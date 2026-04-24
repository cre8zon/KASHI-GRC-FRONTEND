/**
 * AssessmentListPage — /assessments
 *
 * Unified assessment list for all sides and roles.
 * Shows different columns and actions based on the user's role:
 *
 *   ORGANIZATION  → all vendor assessments for their org, review/approve actions
 *   VENDOR        → assessments assigned to their vendor, fill/assign actions
 *
 * Replaces VendorAssessmentsPage as the primary entry point.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search, Filter, RefreshCw, ChevronRight, Clock,
  CheckCircle2, XCircle, Send, Eye, Shield,
  AlertTriangle, X, SlidersHorizontal,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { formatDate } from '../../utils/format'
import { useSelector } from 'react-redux'
import { selectRoles } from '../../store/slices/authSlice'
import toast from 'react-hot-toast'
import api from '../../config/axios.config'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  ASSIGNED:     { label: 'Assigned',      color: 'blue',   icon: Clock },
  IN_PROGRESS:  { label: 'In Progress',   color: 'amber',  icon: Clock },
  SUBMITTED:    { label: 'Submitted',     color: 'purple', icon: Send },
  UNDER_REVIEW: { label: 'Under Review',  color: 'indigo', icon: Shield },
  COMPLETED:    { label: 'Completed',     color: 'green',  icon: CheckCircle2 },
  REJECTED:     { label: 'Rejected',      color: 'red',    icon: XCircle },
  CANCELLED:    { label: 'Cancelled',     color: 'gray',   icon: XCircle },
}

const PRIORITY_CONFIG = {
  CRITICAL: { color: 'text-red-400 bg-red-500/10', label: 'Critical' },
  HIGH:     { color: 'text-amber-400 bg-amber-500/10', label: 'High' },
  MEDIUM:   { color: 'text-text-muted bg-surface-overlay', label: 'Medium' },
  LOW:      { color: 'text-text-muted bg-surface-overlay/50', label: 'Low' },
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const useAssessments = (params) => useQuery({
  queryKey: ['assessments-list', params],
  queryFn:  () => assessmentsApi.vendor.list(params),
  keepPreviousData: true,
})

// ─── Row ──────────────────────────────────────────────────────────────────────

function AssessmentRow({ assessment, onView, isOrgSide }) {
  const meta = STATUS_CONFIG[assessment.status] || { label: assessment.status, color: 'gray' }
  const StatusIcon = meta.icon || Clock
  const prog = assessment.progress
  const pct  = prog?.percentComplete ?? 0
  const priority = assessment.priority || 'MEDIUM'
  const pc   = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.MEDIUM

  return (
    <div
      onClick={() => onView(assessment)}
      className="flex items-center gap-4 px-5 py-4 hover:bg-surface-overlay/40 transition-colors cursor-pointer border-b border-border last:border-0 group"
    >
      {/* Priority dot */}
      <div className={cn('w-1.5 h-8 rounded-full shrink-0', pc.color.split(' ')[1])} />

      {/* Main content */}
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_160px_100px_120px] gap-4 items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{assessment.vendorName}</p>
          <p className="text-xs text-text-muted truncate">{assessment.templateName}</p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5">
          <StatusIcon size={12} className={cn(
            meta.color === 'green' ? 'text-green-400' :
            meta.color === 'amber' ? 'text-amber-400' :
            meta.color === 'red'   ? 'text-red-400'   :
            meta.color === 'blue'  ? 'text-blue-400'  :
            meta.color === 'purple'? 'text-purple-400' :
            meta.color === 'indigo'? 'text-indigo-400' : 'text-text-muted'
          )} />
          <span className="text-xs text-text-secondary">{meta.label}</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
            <div className={cn('h-full rounded-full transition-all',
              pct === 100 ? 'bg-green-500' : 'bg-brand-500')}
              style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-mono text-text-muted">{pct}%</span>
        </div>

        {/* Date */}
        <p className="text-xs font-mono text-text-muted">
          {assessment.submittedAt ? formatDate(assessment.submittedAt) :
           assessment.createdAt  ? formatDate(assessment.createdAt)   : '—'}
        </p>
      </div>

      <ChevronRight size={14} className="text-text-muted shrink-0 group-hover:text-text-secondary transition-colors" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentListPage() {
  const navigate = useNavigate()
  const roles    = useSelector(selectRoles)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('')
  const [showFilters, setFilters]   = useState(false)
  const [page, setPage]             = useState(1)

  const isOrgSide = roles?.some(r => r.side === 'ORGANIZATION')
  const hasRole   = (name) => roles?.some(r => (r.name || r.roleName) === name)
  const isVRM     = hasRole('VENDOR_VRM')
  const isCISO    = hasRole('VENDOR_CISO')
  const isContributor = hasRole('VENDOR_CONTRIBUTOR')

  const { data, isLoading, refetch } = useAssessments({
    skip: (page - 1) * 30,
    take: 30,
    ...(statusFilter ? { status: statusFilter } : {}),
  })

  const allItems = data?.items || data || []

  const items = useMemo(() => {
    if (!search) return allItems
    const q = search.toLowerCase()
    return allItems.filter(a =>
      a.vendorName?.toLowerCase().includes(q) ||
      a.templateName?.toLowerCase().includes(q)
    )
  }, [allItems, search])

  // Status pill counts
  const counts = useMemo(() => allItems.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1
    return acc
  }, {}), [allItems])

  const handleView = async (row) => {
    // Navigate to detail page — let it resolve access contextually
    navigate(`/assessments/${row.assessmentId}`)
  }

  const activeCritical = items.filter(a => a.priority === 'CRITICAL' && a.status !== 'COMPLETED').length
  const pendingReview  = items.filter(a => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').length

  return (
    <PageLayout
      title="Assessments"
      subtitle={`${items.length}${allItems.length > items.length ? ` of ${allItems.length}` : ''} assessment${items.length !== 1 ? 's' : ''}`}
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
          <Button variant={showFilters ? 'secondary' : 'ghost'} size="sm" icon={SlidersHorizontal}
            onClick={() => setFilters(f => !f)}>
            {statusFilter ? 'Filtered' : 'Filter'}
          </Button>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
        </div>
      }
    >
      {/* Summary strip */}
      {(activeCritical > 0 || pendingReview > 0) && (
        <div className="flex items-center gap-3 px-6 pt-4">
          {activeCritical > 0 && (
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertTriangle size={12} />
              {activeCritical} critical
            </div>
          )}
          {pendingReview > 0 && isOrgSide && (
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Eye size={12} />
              {pendingReview} awaiting review
            </div>
          )}
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-surface-raised flex-wrap">
          <button onClick={() => { setStatus(''); setPage(1) }}
            className={cn('text-xs px-3 py-1 rounded-full border transition-colors',
              !statusFilter ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-border text-text-muted hover:text-text-secondary')}>
            All
          </button>
          {Object.entries(STATUS_CONFIG).map(([k, m]) => {
            if (!counts[k]) return null
            return (
              <button key={k} onClick={() => { setStatus(s => s === k ? '' : k); setPage(1) }}
                className={cn('flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition-colors',
                  statusFilter === k ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-border text-text-muted hover:text-text-secondary')}>
                {m.label}
                <span className="font-mono">{counts[k]}</span>
              </button>
            )
          })}
          {statusFilter && (
            <button onClick={() => setStatus('')} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary">
              <X size={11} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Table header */}
      <div className="hidden md:grid grid-cols-[1fr_160px_100px_120px] gap-4 px-10 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-widest border-b border-border">
        <span>Vendor / Template</span>
        <span>Status</span>
        <span>Progress</span>
        <span>Date</span>
      </div>

      {/* List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden mx-6 mt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Shield size={28} className="text-text-muted" strokeWidth={1.5} />
            <p className="text-sm text-text-muted">No assessments found</p>
          </div>
        ) : items.map(a => (
          <AssessmentRow key={a.assessmentId} assessment={a} onView={handleView} isOrgSide={isOrgSide} />
        ))}
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalItems > 30 && (
        <div className="flex items-center justify-between px-6 py-4">
          <p className="text-xs text-text-muted">
            {((page - 1) * 30) + 1}–{Math.min(page * 30, data.pagination.totalItems)} of {data.pagination.totalItems}
          </p>
          <div className="flex gap-2">
            <Button size="xs" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button size="xs" variant="ghost"
              disabled={page * 30 >= data.pagination.totalItems}
              onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </PageLayout>
  )
}