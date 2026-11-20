import { useState } from 'react'
import { PageLayout } from '../../components/layout/PageLayout'
import { AgentChat } from '../../components/ai/AgentChat'
import { AiOrb } from '../../components/ai/AiOrb'
import { cn } from '../../lib/cn'

/**
 * /ai — KashiGuard AI, full page. The same conversation is available from
 * "Ask AI" in the top bar on any page; this is the roomy version: a centred,
 * chat-first layout over a Gemini-style aurora (ai-backdrop in
 * ai-effects.css) that brightens and quickens while an answer is written.
 *
 * The aurora sits behind the WHOLE page, title included, and fades out
 * towards the top — so there is no seam between the page header and the body.
 */
export default function AiAgentPage() {
  const [busy, setBusy] = useState(false)
  return (
    <div className="relative h-full">
      <div className={cn('ai-backdrop', busy && 'ai-backdrop-busy')} aria-hidden="true">
        <span className="ai-blob-high" />
        <span className="ai-blob-cool" />
        <span className="ai-blob-brand" />
        <span className="ai-blob-warm" />
      </div>

      <PageLayout className="relative z-10" title={<AiTitle busy={busy} />}>
        <div className="h-full min-h-0 px-6 pb-4">
          <AgentChat onBusyChange={setBusy} />
        </div>
      </PageLayout>
    </div>
  )
}

function AiTitle({ busy }) {
  return (
    // Padding keeps the orb's halo inside the heading box: PageLayout's <h1>
    // truncates (overflow hidden), which clipped the glow into a square.
    <span className="inline-flex items-center gap-2 py-1 pl-1">
      <AiOrb size={26} state={busy ? 'thinking' : 'idle'} />
      <span className={cn('ai-text text-lg font-bold tracking-tight', busy && 'ai-text-shimmer')}>KashiGuard AI</span>
      <span className="rounded-badge ai-grad-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink">
        Assistant
      </span>
    </span>
  )
}