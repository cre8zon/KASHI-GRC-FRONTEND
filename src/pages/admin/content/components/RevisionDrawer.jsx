import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { contentApi } from '../../../../api/content.api'
import { Modal } from '../../../../components/ui/Modal'
import { Button } from '../../../../components/ui/Button'

/**
 * Revision history.
 *
 * Reverting writes a revision of the CURRENT state first, so an accidental
 * revert is itself undoable. A revert you cannot undo is a second way to lose
 * work rather than a way to recover it — which is stated here because it is the
 * reason someone will click the button without hesitating.
 */
export function RevisionDrawer({ open, onClose, postId }) {
  const client = useQueryClient()

  const revisions = useQuery({
    queryKey: ['content-revisions', postId],
    queryFn: () => contentApi.revisions(postId),
    enabled: open && !!postId,
  })

  const revert = useMutation({
    mutationFn: (revisionId) => contentApi.revert(postId, revisionId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['content-post', postId] })
      toast.success('Reverted')
      onClose()
    },
    onError: () => toast.error('Could not revert'),
  })

  return (
    <Modal open={open} onClose={onClose} title="History"
           subtitle="Saved whenever the content changed — not on every keystroke.">
      <div className="flex flex-col gap-1">
        {(revisions.data || []).map((r) => (
          <div key={r.id}
               className="flex items-center gap-3 rounded-ctl px-2 py-2 hover:bg-surface-overlay">
            <span className="reg-code w-10 shrink-0 font-mono text-[11px] tabular-nums text-text-faint">
              v{r.revisionNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-text-primary">
                {new Date(r.createdAt).toLocaleString('en-GB',
                  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              {r.note && <span className="block text-[11px] text-text-faint">{r.note}</span>}
            </span>
            <Button size="xs" variant="ghost" icon={RotateCcw}
                    loading={revert.isPending}
                    onClick={() => revert.mutate(r.id)}>
              Restore
            </Button>
          </div>
        ))}

        {revisions.isSuccess && revisions.data.length === 0 && (
          <p className="py-6 text-center text-sm text-text-faint">No revisions yet.</p>
        )}

        <p className="mt-3 border-t border-border-subtle pt-3 text-[11px] text-text-faint">
          Restoring saves the current version first, so you can undo the undo.
          The fifty most recent revisions are kept.
        </p>
      </div>
    </Modal>
  )
}