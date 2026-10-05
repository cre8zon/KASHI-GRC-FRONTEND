/**
 * RiskControlsTab — the controls that treat this risk.
 *
 * WHY THIS COMPONENT HAS TO EXIST
 *   'controls' is in CustomTabContent's CUSTOM_RENDERED_TABS set, so the
 *   generic form fetch is suppressed for it. Without an entityType branch the
 *   tab renders "No fields configured for this tab" — not an error, just a
 *   dead panel. Every other module with a controls tab has a dedicated
 *   component for the same reason.
 *
 * WHAT IT SHOWS
 *   Linked LIBRARY controls (audit_controls), never control instances, plus
 *   the latest observed effectiveness the server derived by traversing
 *   audit_control_instances.original_control_id. A control no engagement has
 *   covered reads NOT TESTED rather than being hidden — "we have a control and
 *   have never tested it" is the finding, not an absence of data.
 *
 * DATA
 *   GET    /v1/risks/{id}/controls
 *   POST   /v1/risks/{id}/controls              { controlId, linkNote }
 *   DELETE /v1/risks/{id}/controls/{controlId}
 *   GET    /v1/audit/library/controls?search=name=…   for the picker
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Link2, Plus, Trash2, Search, X, RefreshCw,
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, Tag,
} from 'lucide-react'
import api from '../../config/axios.config'
import toast from 'react-hot-toast'

const EFFECTIVENESS = {
  EFFECTIVE:           { label: 'Effective', icon: CheckCircle2,  color: 'text-status-pass-fg', bg: 'bg-status-pass-bg' },
  PARTIALLY_EFFECTIVE: { label: 'Partial',   icon: AlertTriangle, color: 'text-status-warn-fg', bg: 'bg-status-warn-bg' },
  INEFFECTIVE:         { label: 'Fail',      icon: XCircle,       color: 'text-status-fail-fg', bg: 'bg-status-fail-bg' },
  NOT_APPLICABLE:      { label: 'N/A',       icon: MinusCircle,   color: 'text-text-muted',     bg: 'bg-surface-overlay' },
  NOT_TESTED:          { label: 'Not tested',icon: MinusCircle,   color: 'text-text-muted',     bg: 'bg-surface-overlay' },
}

function EffectivenessBadge({ value }) {
  const cfg = EFFECTIVENESS[value] || EFFECTIVENESS.NOT_TESTED
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

export function RiskControlsTab({ riskId, entity, canEdit = true }) {
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState(null)

  // A platform library risk is read-only — there is nothing to treat until the
  // tenant adopts it. entity.editable is what the server says about ownership,
  // so it is the honest gate rather than a permission code the UI can only guess at.
  const editable = canEdit && entity?.editable !== false

  const { data: linkedRes, isLoading } = useQuery({
    queryKey: ['risk-controls', riskId],
    queryFn: () => api.get(`/v1/risks/${riskId}/controls`),
    enabled: !!riskId,
  })
  const linked = useMemo(() => linkedRes || [], [linkedRes])
  const linkedIds = useMemo(() => new Set(linked.map(c => c.controlId)), [linked])

  // The picker is only queried once it is open, so browsing the tab costs one
  // request rather than two.
  const { data: candidateRes, isFetching: searching } = useQuery({
    queryKey: ['risk-control-candidates', search],
    queryFn: () => api.get('/v1/audit/library/controls', {
      params: { take: 25, skip: 0, ...(search ? { search: `name=${search}` } : {}) },
    }),
    enabled: pickerOpen,
    staleTime: 30_000,
  })
  const candidates = useMemo(
    () => (candidateRes?.items || candidateRes || []).filter(c => !linkedIds.has(c.id)),
    [candidateRes, linkedIds])

  const linkMutation = useMutation({
    mutationFn: () => api.post(`/v1/risks/${riskId}/controls`, {
      controlId: selected.id,
      linkNote: note || null,
    }),
    onSuccess: () => {
      toast.success('Control linked')
      setPickerOpen(false); setSelected(null); setNote(''); setSearch('')
      qc.invalidateQueries({ queryKey: ['risk-controls', riskId] })
      // The detail payload carries linkedControlCount and the mark-treated gate
      // reads the link count server-side, so the entity has to be refetched too.
      qc.invalidateQueries({ queryKey: ['module-detail'] })
    },
    onError: (e) => toast.error(e?.message || 'Could not link that control'),
  })

  const unlinkMutation = useMutation({
    mutationFn: (controlId) => api.delete(`/v1/risks/${riskId}/controls/${controlId}`),
    onSuccess: () => {
      toast.success('Control unlinked')
      qc.invalidateQueries({ queryKey: ['risk-controls', riskId] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
    },
    onError: (e) => toast.error(e?.message || 'Could not unlink that control'),
  })

  if (isLoading) return (
    <div className="py-8 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {editable && (
        <div className="flex justify-end">
          <button
            onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl border border-border text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors">
            {pickerOpen ? <X size={12} /> : <Plus size={12} />}
            {pickerOpen ? 'Cancel' : 'Link control'}
          </button>
        </div>
      )}

      {pickerOpen && editable && (
        <div className="rounded-card border border-border bg-surface-secondary p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Search size={13} className="text-text-muted shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search controls by name"
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none"
            />
            {searching && <RefreshCw size={12} className="animate-spin text-text-muted" />}
          </div>

          <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
            {candidates.length === 0 && !searching && (
              <p className="text-xs text-text-muted py-3 text-center">
                {search ? 'No matching controls.' : 'No controls available to link.'}
              </p>
            )}
            {candidates.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`text-left px-2 py-1.5 rounded-ctl transition-colors ${
                  selected?.id === c.id
                    ? 'bg-brand-500/10 border border-brand-500/40'
                    : 'hover:bg-surface-overlay border border-transparent'
                }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {c.controlCode && (
                    <span className="text-[10px] font-mono text-text-muted">{c.controlCode}</span>
                  )}
                  <span className="text-xs text-text-primary">{c.name}</span>
                  {c.frameworkRef && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                      {c.frameworkRef}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="How this control treats the risk (optional)"
                className="flex-1 px-2 py-1.5 text-xs rounded-ctl border border-border bg-surface-primary text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong"
              />
              <button
                disabled={linkMutation.isPending}
                onClick={() => linkMutation.mutate()}
                className="px-3 py-1.5 text-xs font-medium rounded-ctl bg-brand-500 text-white disabled:opacity-60">
                {linkMutation.isPending ? 'Linking…' : 'Link'}
              </button>
            </div>
          )}
        </div>
      )}

      {linked.length === 0 ? (
        <div className="py-12 text-center">
          <Link2 size={18} className="mx-auto text-text-muted opacity-50" />
          <p className="text-sm text-text-muted mt-2">No controls linked yet.</p>
          <p className="text-xs text-text-muted mt-1 opacity-60">
            {entity?.editable === false
              ? 'Adopt this risk to link the controls that treat it.'
              : 'Link the controls that treat this risk — ISO 27001 Clause 8.2 expects the mapping to exist.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {linked.map(c => (
            <div key={c.linkId || c.controlId}
              className="flex items-start gap-3 p-3 rounded-card border border-border bg-surface-secondary hover:border-border-strong transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.controlCode && (
                    <span className="text-[10px] font-mono text-text-muted">{c.controlCode}</span>
                  )}
                  <span className="text-xs font-medium text-text-primary truncate">{c.name}</span>
                  <EffectivenessBadge value={c.effectiveness} />
                  {c.frameworkRef && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                      {c.frameworkRef}
                    </span>
                  )}
                  {c.controlTag && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                      <Tag size={9} />{c.controlTag}
                    </span>
                  )}
                </div>
                {c.linkNote && (
                  <p className="text-xs text-text-muted mt-1">{c.linkNote}</p>
                )}
              </div>
              {editable && (
                <button
                  title="Unlink"
                  disabled={unlinkMutation.isPending}
                  onClick={() => unlinkMutation.mutate(c.controlId)}
                  className="p-1 rounded text-text-muted hover:text-status-fail-fg transition-colors disabled:opacity-50">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RiskControlsTab
