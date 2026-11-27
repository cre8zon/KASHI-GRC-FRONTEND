import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitCompare, RotateCcw, Sparkles, Save, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../config/axios.config'
import { Modal, ConfirmDialog } from '../ui/Modal'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import PolicyDiffView from './PolicyDiffView'

/**
 * Draft revisions of one policy, inside the editor's History panel.
 *
 * ── WHAT THE USER CAN DO ─────────────────────────────────────────────────────
 *   Compare any revision with what is in the editor now, or tick two
 *   revisions and compare them with each other.
 *   Restore a revision: the body currently saved is kept as a revision first
 *   (server side), so a restore is itself undoable.
 *
 * Versions (v1, v2 …) are separate policy rows created on approval and are
 * listed above this panel by the editor; revisions are snapshots WITHIN the
 * version being edited. See AuditPolicyRevision on the backend.
 */

export const revisionApi = {
  list:     (policyId)        => api.get(`/v1/audit/library/policies/${policyId}/revisions`),
  get:      (policyId, revId) => api.get(`/v1/audit/library/policies/${policyId}/revisions/${revId}`),
  snapshot: (policyId, body)  => api.post(`/v1/audit/library/policies/${policyId}/revisions`, body),
  restore:  (policyId, revId) => api.post(`/v1/audit/library/policies/${policyId}/revisions/${revId}/restore`),
}

const unwrap = (r) => r?.data?.data ?? r?.data ?? r

const SOURCE = {
  MANUAL:         { label: 'Saved',            icon: Save },
  BEFORE_AI:      { label: 'Before AI draft',  icon: Save },
  AI_DRAFT:       { label: 'AI draft',         icon: Sparkles },
  BEFORE_RESTORE: { label: 'Before restore',   icon: RotateCcw },
  RESTORED:       { label: 'Restored',         icon: RotateCcw },
}

const when = (iso) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : ''

export default function PolicyRevisionsPanel({ policyId, currentHtml, canRestore, onRestored }) {
  const qc = useQueryClient()
  const [picked, setPicked]   = useState([])          // up to two revision ids
  const [compare, setCompare] = useState(null)        // { before, after, beforeLabel, afterLabel }
  const [loadingCompare, setLoadingCompare] = useState(false)
  const [confirm, setConfirm] = useState(null)        // revision to restore

  const { data, isLoading } = useQuery({
    queryKey: ['policy-revisions', policyId],
    queryFn:  () => revisionApi.list(policyId).then(unwrap),
    enabled:  !!policyId,
  })
  const revisions = Array.isArray(data) ? data : []

  const restore = useMutation({
    mutationFn: (rev) => revisionApi.restore(policyId, rev.id).then(unwrap),
    onSuccess: (res, rev) => {
      qc.invalidateQueries({ queryKey: ['policy-revisions', policyId] })
      toast.success(`Restored r${rev.revisionNo} — the previous text is kept as a revision`)
      onRestored?.(res?.contentBody ?? '')
      setCompare(null)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not restore this revision'),
  })

  const togglePick = (id) => setPicked(p =>
    p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2))

  const openCompare = async (ids) => {
    setLoadingCompare(true)
    try {
      const revs = await Promise.all(ids.map(id => revisionApi.get(policyId, id).then(unwrap)))
      if (revs.length === 1) {
        setCompare({ rev: revs[0], before: revs[0].contentBody, after: currentHtml,
          beforeLabel: `r${revs[0].revisionNo}`, afterLabel: 'Editor now' })
      } else {
        const [older, newer] = revs.sort((a, b) => a.revisionNo - b.revisionNo)
        setCompare({ rev: older, before: older.contentBody, after: newer.contentBody,
          beforeLabel: `r${older.revisionNo}`, afterLabel: `r${newer.revisionNo}` })
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not load the revision')
    } finally {
      setLoadingCompare(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-border/50">
        <p className="text-[11px] font-semibold text-text-secondary">Draft revisions</p>
        {picked.length === 2 && (
          <button type="button" onClick={() => openCompare(picked)}
            className="flex items-center gap-1 text-[11px] text-brand-ink hover:underline">
            <GitCompare size={11} /> Compare r{revisions.find(r => r.id === picked[0])?.revisionNo}
            {' & '}r{revisions.find(r => r.id === picked[1])?.revisionNo}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-6 flex justify-center text-text-muted"><Loader2 size={14} className="animate-spin" /></div>
      ) : revisions.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-text-muted">No revisions yet</p>
          <p className="text-[10px] text-text-muted mt-1 opacity-60">
            One is kept each time you click Save draft, and before AI replaces the text
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {revisions.map(r => {
            const s = SOURCE[r.source] || SOURCE.MANUAL
            const Icon = s.icon
            return (
              <div key={r.id} className="px-4 py-2.5 hover:bg-surface-overlay transition-colors">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={picked.includes(r.id)} onChange={() => togglePick(r.id)}
                    className="accent-brand-500" title="Tick two to compare them" />
                  <span className="text-[11px] font-semibold font-mono text-text-primary">r{r.revisionNo}</span>
                  <span className={cn('flex items-center gap-1 text-[10px]',
                    r.source === 'AI_DRAFT' ? 'text-brand-ink' : 'text-text-muted')}>
                    <Icon size={10} /> {s.label}
                  </span>
                </div>
                <p className="text-[10px] text-text-muted mt-0.5 pl-5">
                  {when(r.createdAt)}{r.createdByName ? ` · ${r.createdByName}` : ''}
                  {r.wordCount != null ? ` · ${r.wordCount} words` : ''}
                </p>
                {r.note && <p className="text-[10px] text-text-muted pl-5">{r.note}</p>}
                <div className="flex items-center gap-3 mt-1 pl-5">
                  <button type="button" onClick={() => openCompare([r.id])} disabled={loadingCompare}
                    className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-brand-ink">
                    <GitCompare size={11} /> Compare with editor
                  </button>
                  {canRestore && (
                    <button type="button" onClick={() => setConfirm(r)}
                      className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-brand-ink">
                      <RotateCcw size={11} /> Restore
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={!!compare} onClose={() => setCompare(null)} size="full"
        title="Compare drafts"
        subtitle="Green was added, red was removed; edited paragraphs show the changed words"
        footer={compare && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={X} onClick={() => setCompare(null)}>Close</Button>
            {canRestore && compare.rev && (
              <Button variant="secondary" size="sm" icon={RotateCcw}
                onClick={() => setConfirm(compare.rev)}>
                Restore r{compare.rev.revisionNo}
              </Button>
            )}
          </div>
        )}
      >
        {compare && (
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <PolicyDiffView beforeHtml={compare.before} afterHtml={compare.after}
              beforeLabel={compare.beforeLabel} afterLabel={compare.afterLabel} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { restore.mutate(confirm); setConfirm(null) }}
        title={confirm ? `Restore r${confirm.revisionNo}?` : ''}
        confirmLabel="Restore" variant="primary" loading={restore.isPending} loadingText="Restoring…"
        message="The policy's saved text is kept as a new revision first, so you can undo this from here. Unsaved typing in the editor is replaced."
      />
    </div>
  )
}
