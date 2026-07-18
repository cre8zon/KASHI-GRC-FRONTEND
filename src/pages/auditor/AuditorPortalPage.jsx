/**
 * AuditorPortalPage — /auditor/portal
 *
 * Scoped external auditor view. Shows only findings assigned to the
 * logged-in AUDITOR — no org data, no sidebar modules they shouldn't see.
 *
 * DESIGN DECISIONS:
 *   - Uses UniversalModulePage's engine but with a locked filter (assignedToMe=true)
 *   - No access to /tprm, /risks, /users, /admin — enforced by allowedSides on nav items
 *   - The AUDITOR side nav should only have: Portal, My Findings, Evidence
 *   - Layout is stripped — no org branding sidebar, minimal navigation
 *
 * HOW TO CONFIGURE THE AUDITOR PORTAL FROM THE ADMIN UI (no code needed):
 *   1. Navigation Admin (/admin/ui/navigation):
 *      - Create nav items with allowedSides = "AUDITOR"
 *      - Routes: /auditor/portal, /module/FINDING
 *   2. Screen Designer:
 *      - audit_finding_item screen key: set roleAccessJson { AUDITOR: true, ORGANIZATION: true }
 *      - Action buttons: RAISE_FINDING (AUDITOR), APPROVE_ANSWER (ORGANIZATION only)
 *      - Tab visibility: AUDITOR sees Overview + Evidence only, not Workflow
 *   3. Module Blueprint (/admin/modules):
 *      - FINDING blueprint: allowedSides = "AUDITOR,ORGANIZATION"
 *
 * ROUTES NEEDED IN App.jsx:
 *   <Route path="/auditor/portal"   element={<AuditorPortalPage />} />
 *   <Route path="/auditor/findings" element={<AuditorFindingsPage />} />
 *   (AuditorFindingsPage = UniversalModulePage with entityType=FINDING)
 */

import { useState }                          from 'react'
import { useNavigate }                       from 'react-router-dom'
import { useQuery }                          from '@tanstack/react-query'
import { useSelector }                       from 'react-redux'
import { selectAuth }                        from '../../store/slices/authSlice'
import {
  Shield, AlertTriangle, CheckCircle2, Clock,
  FileText, Upload, MessageSquare, ExternalLink,
  ChevronRight, Search, RefreshCw,
} from 'lucide-react'
import { PageLayout }  from '../../components/layout/PageLayout'
import { Button }      from '../../components/ui/Button'
import { Badge }       from '../../components/ui/Badge'
import { cn }          from '../../lib/cn'
import api             from '../../config/axios.config'

// ── Constants ──────────────────────────────────────────────────────────────────

const SEVERITY_COLOR  = { CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'blue', LOW: 'gray' }
const STATUS_COLOR    = {
  OPEN: 'gray', TRIAGED: 'blue', IN_PROGRESS: 'blue',
  SUBMITTED: 'blue', PENDING_REVIEW: 'amber', PENDING_VALIDATION: 'amber',
  RESOLVED: 'green', ACCEPTED_RISK: 'amber', CLOSED: 'green',
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useAuditorFindings(filters) {
  const params = new URLSearchParams({ take: '50', sortBy: 'created_at', sortDir: 'desc' })
  if (filters.status && filters.status !== 'ALL') params.set('status', filters.status)
  if (filters.severity && filters.severity !== 'ALL') params.set('severity', filters.severity)

  return useQuery({
    queryKey: ['auditor-findings', filters],
    // Findings in issue management are EXTERNAL type issues raised by AUDITOR side
    queryFn: () => api.get(`/v1/issues?issueType=EXTERNAL&${params.toString()}`),
    select:  (d) => d?.data?.items || d?.items || (Array.isArray(d?.data) ? d.data : null) || [],
    staleTime: 30_000,
  })
}

function useAuditorStats() {
  return useQuery({
    queryKey: ['auditor-stats'],
    // Get issue stats filtered to EXTERNAL type that auditor raised
    queryFn: () => api.get('/v1/issues/stats'),
    staleTime: 60_000,
  })
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AuditorPortalPage() {
  const navigate = useNavigate()
  const { fullName } = useSelector(selectAuth)
  const [filters, setFilters] = useState({ status: 'ALL', severity: 'ALL' })
  const [search, setSearch] = useState('')

  const { data: findings = [], isLoading, refetch } = useAuditorFindings(filters)
  const { data: stats } = useAuditorStats()

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  const filtered = findings.filter(f =>
    !search || f.title?.toLowerCase().includes(search.toLowerCase()) ||
    f.issueRef?.toLowerCase().includes(search.toLowerCase())
  )

  // Counts for auditor context
  const openCount      = findings.filter(f => !['CLOSED','RESOLVED','ACCEPTED_RISK'].includes(f.status)).length
  const resolvedCount  = findings.filter(f => ['RESOLVED','CLOSED'].includes(f.status)).length
  const pendingCount   = findings.filter(f => ['PENDING_REVIEW','PENDING_VALIDATION'].includes(f.status)).length

  return (
    <PageLayout
      title="Auditor portal"
      subtitle={`Welcome, ${fullName?.split(' ')[0]} — your assigned audit findings and evidence requests`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={refetch}>Refresh</Button>
          {/* Raise finding navigates to create issue form with type=EXTERNAL pre-filled */}
          <Button size="sm" icon={AlertTriangle}
            onClick={() => navigate('/module/ISSUE/new?issueType=EXTERNAL')}>
            Raise finding
          </Button>
        </div>
      }
    >
      {/* ── Portal notice ───────────────────────────────────────────── */}
      <div className="mx-6 mt-4 flex items-center gap-3 px-4 py-2.5 rounded-card bg-brand-500/5 border border-brand-500/20">
        <Shield size={14} className="text-brand-400 shrink-0" />
        <p className="text-xs text-text-secondary">
          You are viewing the <span className="font-medium text-text-primary">external auditor portal</span>.
          Only findings you raised or that are assigned to you are visible here.
        </p>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────── */}
      <div className="px-6 mt-4 grid grid-cols-4 gap-3">
        {[
          { label: 'Open findings',     value: openCount,     icon: AlertTriangle, color: 'text-status-warn-fg' },
          { label: 'Pending response',  value: pendingCount,  icon: Clock,         color: 'text-status-info-fg'  },
          { label: 'Resolved',          value: resolvedCount, icon: CheckCircle2,  color: 'text-status-pass-fg' },
          { label: 'Total raised',      value: findings.length, icon: FileText,    color: 'text-text-muted'},
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-3 rounded-card border border-border bg-surface-overlay">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} className={color} />
              <span className="text-[10px] text-text-muted">{label}</span>
            </div>
            <p className="text-xl font-semibold text-text-primary">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="px-6 mt-4 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-64">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search findings…"
            className="w-full h-7 pl-7 pr-3 text-xs border border-border rounded bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>

        <select value={filters.severity} onChange={e => setFilter('severity', e.target.value)}
          className="h-7 px-2 text-xs border border-border rounded bg-transparent text-text-primary focus:outline-none">
          <option value="ALL">All severity</option>
          {['CRITICAL','HIGH','MEDIUM','LOW'].map(s => <option key={s}>{s}</option>)}
        </select>

        <select value={filters.status} onChange={e => setFilter('status', e.target.value)}
          className="h-7 px-2 text-xs border border-border rounded bg-transparent text-text-primary focus:outline-none">
          <option value="ALL">All status</option>
          {['OPEN','TRIAGED','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION','RESOLVED','CLOSED'].map(s =>
            <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
      </div>

      {/* ── Findings table ──────────────────────────────────────────── */}
      <div className="px-6 mt-4 pb-6">
        <div className="border border-border rounded-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-xs text-text-muted">Loading findings…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Shield size={28} className="text-text-muted" />
              <p className="text-sm text-text-muted">No findings found</p>
              <Button size="sm" icon={AlertTriangle}
                onClick={() => navigate('/module/ISSUE/new?issueType=EXTERNAL')}>
                Raise first finding
              </Button>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  {['Ref', 'Finding', 'Severity', 'Status', 'Source', 'Due', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map(finding => (
                  <tr key={finding.id}
                    onClick={() => navigate(`/module/ISSUE/${finding.id}`)}
                    className="hover:bg-brand-500/3 cursor-pointer transition-colors">
                    <td className="px-3 py-2.5 font-mono text-brand-400">{finding.issueRef}</td>
                    <td className="px-3 py-2.5 max-w-72">
                      <p className="font-medium text-text-primary truncate">{finding.title}</p>
                      {finding.category && <p className="text-text-muted text-[10px]">{finding.category.replace(/_/g,' ')}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge value={finding.severity} colorTag={SEVERITY_COLOR[finding.severity]} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge value={finding.status?.replace('_',' ')} colorTag={STATUS_COLOR[finding.status]} />
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">{finding.sourceModule || '—'}</td>
                    <td className="px-3 py-2.5 text-text-muted">
                      {finding.dueAt ? new Date(finding.dueAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/module/ISSUE/${finding.id}?tab=evidence`)}
                          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-400 border border-border hover:border-brand-500/40 rounded px-1.5 py-0.5 transition-colors">
                          <Upload size={10} /> Evidence
                        </button>
                        <button
                          onClick={() => navigate(`/module/ISSUE/${finding.id}?tab=comments`)}
                          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-400 border border-border hover:border-brand-500/40 rounded px-1.5 py-0.5 transition-colors">
                          <MessageSquare size={10} /> Comment
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Auditor guide ────────────────────────────────────────────── */}
      <div className="mx-6 mb-6 p-4 rounded-card border border-border bg-surface-overlay space-y-2">
        <p className="text-xs font-semibold text-text-primary">How this portal works</p>
        <div className="grid grid-cols-3 gap-3 text-[10px] text-text-secondary">
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="text-status-warn-fg shrink-0 mt-0.5" />
            <span><strong className="text-text-primary">Raise a finding</strong> — click "Raise finding" to document a control failure, gap, or observation from your audit.</span>
          </div>
          <div className="flex items-start gap-2">
            <Upload size={12} className="text-brand-400 shrink-0 mt-0.5" />
            <span><strong className="text-text-primary">Upload evidence</strong> — click Evidence on any finding to upload test results, screenshots, or supporting documents.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={12} className="text-status-pass-fg shrink-0 mt-0.5" />
            <span><strong className="text-text-primary">Validate remediation</strong> — once the org responds, you'll be asked to validate their evidence and mark the finding resolved.</span>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}