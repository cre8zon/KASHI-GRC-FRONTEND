import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectRoles } from '../../store/slices/authSlice'
import api from '../../config/axios.config'
import { useNavigate } from 'react-router-dom'
import {
  Search, RefreshCw, ChevronRight, ChevronDown,
  Eye, AlertCircle, CheckCircle2, Clock, Send,
  FileText, Loader2, X, Users
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { DataTable } from '../../components/ui/DataTable'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'
import { formatDate } from '../../utils/format'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META = {
  ASSIGNED:     { label: 'Assigned',     color: 'blue',   icon: Clock },
  IN_PROGRESS:  { label: 'In Progress',  color: 'amber',  icon: Clock },
  SUBMITTED:    { label: 'Submitted',    color: 'purple', icon: Send },
  UNDER_REVIEW: { label: 'Under Review', color: 'indigo', icon: Eye },
  COMPLETED:    { label: 'Completed',    color: 'green',  icon: CheckCircle2 },
  REJECTED:     { label: 'Rejected',     color: 'red',    icon: X },
  // CANCELLED: stale assessments from a Cancel & Restart.
  // Excluded from the default list by the backend (listAssessments filters them out
  // unless ?status=CANCELLED is passed). Shown here so the badge renders if ever visible.
  CANCELLED:    { label: 'Cancelled',    color: 'gray',   icon: X },
}

const TYPE_COLOR = {
  SINGLE_CHOICE: 'blue', MULTI_CHOICE: 'purple',
  TEXT: 'cyan', FILE_UPLOAD: 'amber',
}
const TYPE_LABEL = {
  SINGLE_CHOICE: 'Single', MULTI_CHOICE: 'Multi',
  TEXT: 'Text', FILE_UPLOAD: 'File',
}

const COLUMNS = [
  { key: 'assessmentId', label: 'ID',       width: 70,  type: 'mono',     sortable: true },
  { key: 'vendorName',   label: 'Vendor',   width: 220, sortable: true },
  { key: 'templateName', label: 'Template', width: 220, sortable: false,  type: 'truncate', truncateLen: 40 },
  { key: 'status',       label: 'Status',   width: 130, sortable: true,   type: 'custom' },
  { key: 'progress',     label: 'Progress', width: 140, sortable: false,  type: 'custom' },
  { key: 'submittedAt',  label: 'Submitted',width: 120, sortable: true,   type: 'custom' },
  { key: '__view',       label: '',         width: 80,  type: 'custom' },
]

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useVendorAssessments = (params) => useQuery({
  queryKey: ['vendor-assessments', params],
  queryFn:  () => assessmentsApi.vendor.list(params),
  keepPreviousData: true,
})

const useAssessmentDetail = (id, isReview) => useQuery({
  queryKey: ['assessment-detail', id, isReview],
  queryFn:  () => isReview
    ? assessmentsApi.vendor.review(id)
    : assessmentsApi.vendor.get(id),
  enabled: !!id,
})

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VendorAssessmentsPage() {
  const [page, setPage]               = useState(1)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy]           = useState('assessmentId')
  const [sortDir, setSortDir]         = useState('desc')
  const [detail, setDetail]           = useState(null)  // { id, isReview }

  const { data, isLoading, refetch } = useVendorAssessments({
    skip: (page - 1) * 20, take: 20,
    ...(statusFilter ? { status: statusFilter } : {}),
    sortBy: `${sortBy}=${sortDir}`,
  })

  const navigate = useNavigate()
  const roles = useSelector(selectRoles)
  const hasRole = (name) => roles?.some(r => (r.name || r.roleName) === name)

  const isVRM         = hasRole('VENDOR_VRM')
  const isCISO        = hasRole('VENDOR_CISO')
  const isResponder   = hasRole('VENDOR_RESPONDER')
  const isContributor = hasRole('VENDOR_CONTRIBUTOR')
  const isOrgSide     = roles?.some(r => r.side === 'ORGANIZATION')

  /**
   * handleViewAssessment — navigate to the correct page for the user's role.
   *
   * FIXED: The my-tasks API call was using res.data?.data?.items to unwrap the
   *   response. Since the axios interceptor already unwraps ApiResponse<T> to T,
   *   the result is already a plain array — res.data?.data?.items was undefined.
   *
   *   Before: const items = res.data?.data?.items || []  ← always []
   *   After:  const items = Array.isArray(res) ? res : []  ← correct array
   *
   * FIXED (Responder/Contributor): These roles were being navigated to the
   *   vendor assessment pages WITHOUT a taskId in the URL query params. The
   *   page-level STEP-GATED guard immediately redirected them back to the inbox.
   *   Now we look up their matching task by entityId and include the taskId.
   */
  const handleViewAssessment = async (row) => {
    const id = row.assessmentId

    if (isOrgSide) {
      // Org reviewers — open review modal (no task required for modal view)
      setDetail({ id, isReview: ['SUBMITTED', 'UNDER_REVIEW', 'COMPLETED'].includes(row.status) })
      return
    }

    // All vendor-side roles: look up their task for this assessment's entity
    try {
      // GET /v1/workflows/my-tasks — axios interceptor returns TaskInstanceResponse[] directly
      const taskList = await api.get('/v1/workflows/my-tasks', { params: { status: 'PENDING' } })

      // FIXED: taskList is already the unwrapped array (not { data: { items: [] } })
      const items = Array.isArray(taskList) ? taskList : []

      // Find the task that matches this specific vendor entity
      const myTask = items.find(t =>
        String(t.entityId) === String(row.vendorId || id) &&
        t.entityType === 'VENDOR'
      )

      if (isVRM || isCISO) {
        if (myTask) {
          const step = isVRM ? 3 : 4
          const url  = `/vendor/assessments/${id}/assign` +
            `?taskId=${myTask.id}&stepInstanceId=${myTask.stepInstanceId}&step=${step}`
          navigate(url)
        } else if (row.status === 'ASSIGNED' && isVRM) {
          // ASSIGNED status: no task exists yet (step is AWAITING_ASSIGNMENT).
          // VRM can still open the assign page to pick a CISO — the backend
          // now bypasses the task guard for ASSIGNED assessments, and the
          // assign page skips the task ownership check for ASSIGNED status.
          navigate(`/vendor/assessments/${id}/assign?step=3`)
        } else {
          toast.error('No pending task found for this assessment — check your inbox')
        }
        return
      }

      if (isResponder) {
        if (myTask) {
          // FIXED: include taskId so the page guard accepts the navigation
          navigate(
            `/vendor/assessments/${id}/responder-review` +
            `?taskId=${myTask.id}&stepInstanceId=${myTask.stepInstanceId}`
          )
        } else {
          toast.error('No pending task found — you may not be assigned to this assessment yet')
        }
        return
      }

      if (isContributor) {
        if (myTask) {
          // FIXED: include taskId so the page guard accepts the navigation
          navigate(
            `/vendor/assessments/${id}/fill` +
            `?taskId=${myTask.id}&stepInstanceId=${myTask.stepInstanceId}`
          )
        } else {
          toast.error('No pending task found — you may not be assigned any questions yet')
        }
        return
      }

    } catch (e) {
      console.error('[VendorAssessmentsPage] my-tasks error:', e)
      toast.error('Could not load task info — try opening from your inbox')
    }

    // Fallback — read-only modal for any unmatched role
    setDetail({ id, isReview: false })
  }

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  // Client-side name search
  const assessments = (data?.items || []).filter(a =>
    !search
    || a.vendorName?.toLowerCase().includes(search.toLowerCase())
    || a.templateName?.toLowerCase().includes(search.toLowerCase())
  )

  // Status counts for filter pills
  const statusCounts = (data?.items || []).reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1
    return acc
  }, {})

  const columns = COLUMNS.map(col => {
    if (col.key === 'status') return {
      ...col,
      render: (row) => {
        const meta = STATUS_META[row.status] || { label: row.status, color: 'gray' }
        return <Badge value={row.status} label={meta.label} colorTag={meta.color} />
      },
    }
    if (col.key === 'progress') return {
      ...col,
      render: (row) => {
        const prog = row.progress
        if (!prog) return <span className="text-xs text-text-muted">—</span>
        const pct = prog.percentComplete ?? 0
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-surface-overlay rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-brand-500')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-mono text-text-muted w-8 text-right">{pct}%</span>
          </div>
        )
      },
    }
    if (col.key === 'submittedAt') return {
      ...col,
      render: (row) => (
        <span className="text-xs font-mono text-text-muted">
          {row.submittedAt ? formatDate(row.submittedAt) : '—'}
        </span>
      ),
    }
    if (col.key === '__view') return {
      ...col,
      render: (row) => (
        <Button variant="ghost" size="xs"
          icon={isOrgSide ? Eye : (isContributor ? FileText : Users)}
          onClick={(e) => { e.stopPropagation(); handleViewAssessment(row) }}>
          {isOrgSide ? (
            ['SUBMITTED', 'UNDER_REVIEW', 'COMPLETED'].includes(row.status) ? 'Review' : 'View'
          ) : isContributor ? 'Fill' : 'Assign'}
        </Button>
      ),
    }
    return col
  })

  return (
    <PageLayout
      title="Vendor Assessments"
      subtitle={data?.pagination ? `${data.pagination.totalItems} assessments` : undefined}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vendor or template…"
              className="h-8 pl-8 pr-3 w-52 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="h-8 appearance-none pl-3 pr-8 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_META).map(([v, m]) =>
              <option key={v} value={v}>{m.label}</option>)}
          </select>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
        </div>
      }
    >
      {/* Status filter pills */}
      {Object.keys(statusCounts).length > 0 && (
        <div className="flex items-center gap-2 px-6 pt-4 pb-2 flex-wrap">
          {Object.entries(STATUS_META).map(([status, meta]) => {
            const count = statusCounts[status]
            if (!count) return null
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(f => f === status ? '' : status)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  statusFilter === status
                    ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                    : 'border-border bg-surface-raised text-text-muted hover:text-text-secondary'
                )}
              >
                <span>{meta.label}</span>
                <span className="font-mono">{count}</span>
              </button>
            )
          })}
          {statusFilter && (
            <button
              onClick={() => setStatusFilter('')}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={assessments}
        pagination={data?.pagination}
        onPageChange={setPage}
        onSort={handleSort}
        sortBy={sortBy}
        sortDir={sortDir}
        loading={isLoading}
        onRowClick={(row) => handleViewAssessment(row)}
        emptyMessage="No vendor assessments found."
      />

      <AssessmentDetailModal
        detail={detail}
        onClose={() => setDetail(null)}
      />
    </PageLayout>
  )
}

// ─── Assessment Detail / Review Modal (logic unchanged) ───────────────────────

function AssessmentDetailModal({ detail, onClose }) {
  const { data: assessment, isLoading } = useAssessmentDetail(detail?.id, detail?.isReview)
  const [expandedSections, setExpandedSections] = useState({})

  const toggle = (sectionInstanceId) =>
    setExpandedSections(p => ({ ...p, [sectionInstanceId]: !p[sectionInstanceId] }))

  const prog   = assessment?.progress
  const pct    = prog?.percentComplete ?? 0
  const status = assessment?.status
  const meta   = STATUS_META[status] || { label: status, color: 'gray' }

  const totalAnswered = assessment?.sections?.reduce(
    (sum, sec) => sum + (sec.questions?.filter(q => !!q.currentResponse).length || 0), 0
  ) ?? 0

  return (
    <Modal
      open={!!detail}
      onClose={onClose}
      title={assessment?.vendorName ? `${assessment.vendorName} — Assessment` : 'Assessment Detail'}
      subtitle={assessment?.templateName || undefined}
      size="xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="text-brand-400 animate-spin" />
        </div>
      ) : !assessment ? null : (
        <div className="flex flex-col gap-4">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Status',    value: <Badge value={status} label={meta.label} colorTag={meta.color} /> },
              { label: 'Progress',  value: `${pct}% (${prog?.answered ?? totalAnswered} / ${prog?.totalQuestions ?? 0})` },
              { label: 'Mandatory', value: `${prog?.mandatoryQuestions ?? '—'} required` },
              { label: 'Score',     value: prog?.totalEarnedScore != null
                  ? prog.totalEarnedScore.toFixed(1) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-lg bg-surface-overlay border border-border">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">{label}</p>
                <div className="text-sm font-medium text-text-primary">{value}</div>
              </div>
            ))}
          </div>

          {/* Overall progress bar */}
          <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-brand-500')}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Sections */}
          <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
            {(assessment.sections || []).length === 0 ? (
              <p className="text-xs text-text-muted text-center py-8">No sections in this assessment.</p>
            ) : (
              (assessment.sections || []).map((section, sIdx) => {
                const key = section.sectionInstanceId ?? sIdx
                const answeredInSection = section.questions?.filter(q => !!q.currentResponse).length || 0
                const totalInSection    = section.questions?.length || 0

                return (
                  <div key={key} className="rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => toggle(key)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay transition-colors text-left"
                    >
                      <div className="w-6 h-6 rounded-md bg-brand-500/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-brand-400">
                          {section.sectionOrderNo ?? sIdx + 1}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-text-primary">{section.sectionName}</p>
                        <p className="text-xs text-text-muted">
                          {answeredInSection} / {totalInSection} answered
                        </p>
                      </div>
                      {totalInSection > 0 && (
                        <div className="flex items-center gap-2 mr-2">
                          <div className="w-16 h-1 bg-surface-overlay rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', answeredInSection === totalInSection ? 'bg-green-500' : 'bg-brand-500')}
                              style={{ width: `${(answeredInSection / totalInSection) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {expandedSections[key]
                        ? <ChevronDown size={14} className="text-text-muted shrink-0" />
                        : <ChevronRight size={14} className="text-text-muted shrink-0" />
                      }
                    </button>

                    {expandedSections[key] && (
                      <div className="border-t border-border divide-y divide-border">
                        {(section.questions || []).map((q) => (
                          <QuestionDetailRow key={q.questionInstanceId} question={q} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Question Detail Row (logic unchanged) ────────────────────────────────────

function QuestionDetailRow({ question }) {
  const answered = !!question.currentResponse

  return (
    <div className="px-4 py-3 hover:bg-surface-overlay/50">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {answered
            ? <CheckCircle2 size={14} className="text-green-400" />
            : <div className="w-3.5 h-3.5 rounded-full border-2 border-border" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-primary leading-relaxed">{question.questionText}</p>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge
              value={question.responseType}
              label={TYPE_LABEL[question.responseType] || question.responseType}
              colorTag={TYPE_COLOR[question.responseType] || 'gray'}
            />
            {question.mandatory && (
              <span className="text-[10px] text-red-400 font-medium">Required</span>
            )}
            {question.weight != null && (
              <span className="text-[10px] text-text-muted">Weight: {question.weight}</span>
            )}
          </div>

          {answered && (
            <div className="mt-2 p-2.5 rounded-lg bg-surface-overlay border border-border">
              {question.currentResponse.responseText && (
                <p className="text-xs text-text-secondary leading-relaxed">
                  {question.currentResponse.responseText}
                </p>
              )}
              {!question.currentResponse.responseText && question.options?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {question.options.map(opt => {
                    const isSelected = question.currentResponse.scoreEarned != null
                      && opt.score === question.currentResponse.scoreEarned
                    return (
                      <span
                        key={opt.optionInstanceId}
                        className={cn(
                          'text-[11px] px-2 py-0.5 rounded border',
                          isSelected
                            ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium'
                            : 'bg-surface-raised border-border text-text-muted'
                        )}
                      >
                        {opt.optionValue}
                        {isSelected && <span className="ml-1 font-mono">(+{opt.score})</span>}
                      </span>
                    )
                  })}
                </div>
              )}
              {question.currentResponse.scoreEarned != null && (
                <p className="text-[10px] text-text-muted mt-1.5">
                  Score: <span className="font-mono text-green-400">{question.currentResponse.scoreEarned}</span>
                </p>
              )}
              {question.currentResponse.reviewerStatus && (
                <div className="mt-1.5">
                  <Badge
                    value={question.currentResponse.reviewerStatus}
                    label={question.currentResponse.reviewerStatus}
                    colorTag={question.currentResponse.reviewerStatus === 'APPROVED' ? 'green' : 'red'}
                  />
                </div>
              )}
              {question.currentResponse.comments?.length > 0 && (
                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                  {question.currentResponse.comments.map(c => (
                    <p key={c.commentId} className="text-[10px] text-text-muted italic">
                      "{c.commentText}"
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {!answered && question.options?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {question.options.map(opt => (
                <span
                  key={opt.optionInstanceId}
                  className="text-[10px] px-2 py-0.5 rounded bg-surface-overlay text-text-muted border border-border"
                >
                  {opt.optionValue}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}