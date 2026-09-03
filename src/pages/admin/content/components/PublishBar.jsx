import { useState } from 'react'
import { Check, Clock, AlertCircle, Eye, Loader2, ArrowLeft, History } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { Badge } from '../../../../components/ui/Badge'
import { cn } from '../../../../lib/cn'

/**
 * The top bar: what state this post is in, whether it is saved, and the two
 * buttons that change either.
 *
 * ── THE SAVE INDICATOR IS NOT DECORATION ─────────────────────────────────────
 * An editor that autosaves without saying so trains people to hit Ctrl-S on a
 * page with no save handler and then worry. Four states, always visible, and
 * 'error' is loud rather than a grey dot — a failed save is the one thing on
 * this screen worth interrupting someone for.
 */
const STATUS_TAG = {
  DRAFT: 'gray', IN_REVIEW: 'amber', SCHEDULED: 'blue',
  PUBLISHED: 'green', ARCHIVED: 'gray',
}

export function PublishBar({
  post, saveStatus, savedAt, onPublish, onUnpublish, onSchedule,
  publishing, problems, onDismissProblems, onPreview, onOpenRevisions, onBack,
}) {
  const [scheduling, setScheduling] = useState(false)
  const [when, setWhen] = useState('')

  return (
    <div className="sticky top-0 z-20 flex flex-col border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-5 py-2.5">
        {/* The editor fills the frame — there is no breadcrumb and no visible
            list behind it, so without this the only way back is the browser
            button, and that leaves the autosave queue unflushed. */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all posts"
          title="Back to all posts"
          className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <ArrowLeft size={15} />
        </button>

        <Badge value={post.status || 'DRAFT'} colorTag={STATUS_TAG[post.status] || 'gray'} />

        <SaveIndicator status={saveStatus} savedAt={savedAt} />

        <div className="flex-1" />

        <Button variant="ghost" size="sm" icon={History} onClick={onOpenRevisions}>
          History
        </Button>

        {post.status === 'PUBLISHED' && (
          <Button variant="ghost" size="sm" icon={Eye} onClick={onPreview}>
            View live
          </Button>
        )}

        {post.status === 'PUBLISHED' ? (
          <Button variant="secondary" size="sm" onClick={onUnpublish}>Unpublish</Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" icon={Clock}
                    onClick={() => setScheduling(!scheduling)}>
              Schedule
            </Button>
            <Button variant="primary" size="sm" onClick={onPublish} loading={publishing}>
              Publish
            </Button>
          </>
        )}
      </div>

      {scheduling && (
        <div className="flex items-center gap-3 border-t border-border-subtle px-5 py-2.5">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="h-8 rounded-ctl border border-border bg-surface px-2.5 text-[13px] text-text-primary"
          />
          <Button size="sm" variant="primary" onClick={() => { onSchedule(when); setScheduling(false) }}>
            Schedule
          </Button>
          {/* Validation runs now, not at 3am. A post that silently fails to
              appear is worse than one that never scheduled. */}
          <p className="text-[11px] text-text-faint">
            Checked against publish requirements now, not when it runs.
          </p>
        </div>
      )}

      {problems?.length > 0 && (
        <div className="border-t border-border-subtle bg-status-fail-bg px-5 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-status-fail-fg" />
            <div className="flex-1">
              <p className="mb-1.5 text-[12.5px] font-medium text-status-fail-fg">
                {problems.length === 1
                  ? 'One thing to fix before publishing'
                  : `${problems.length} things to fix before publishing`}
              </p>
              {/* All of them at once. Fixing one, clicking publish, and being
                  told about the next is what makes people abandon a CMS. */}
              <ul className="space-y-0.5">
                {problems.map((p, i) => (
                  <li key={i} className="text-[12.5px] text-status-fail-fg">
                    <span className="reg-code font-mono text-[11px] opacity-70">{p.field}</span>
                    {'  '}{p.message}
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" onClick={onDismissProblems}
                    className="text-status-fail-fg opacity-60 hover:opacity-100" aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SaveIndicator({ status, savedAt }) {
  if (status === 'saving' || status === 'pending') {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-text-faint">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 rounded-badge bg-status-fail-bg px-2 py-0.5 text-[11.5px] text-status-fail-fg">
        <AlertCircle size={11} /> Not saved — retrying
      </span>
    )
  }
  if (status === 'saved' && savedAt) {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-text-faint">
        <Check size={11} /> Saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    )
  }
  return null
}