import { Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'
import './ai-effects.css'

/**
 * KashiGuard AI's mark: a brand-gradient core inside a slowly turning conic
 * glow — the one visual that says "AI" everywhere the assistant appears
 * (launcher, panel, page, answers). Colours are theme tokens (ai-effects.css),
 * so it follows the user's preset in light and dark.
 *
 * state:
 *   idle     — glow turns slowly
 *   thinking — glow speeds up, sparkle turns
 *   greet    — idle plus one soft ping on mount (launcher)
 *   hero     — the page greeting: floats, breathes, ripples outwards
 * Motion stops under prefers-reduced-motion.
 */
export function AiOrb({ size = 40, state = 'idle', className }) {
  const icon = Math.max(11, Math.round(size * 0.36))
  const pad  = Math.max(3, Math.round(size * 0.14))
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', state === 'hero' && 'ai-float', className)}
          style={{ width: size, height: size }} aria-hidden="true">
      {/* hero: two rings rippling outwards, one after the other */}
      {state === 'hero' && (
        <>
          <span className="absolute inset-0 rounded-full ai-ripple" />
          <span className="absolute inset-0 rounded-full ai-ripple" style={{ animationDelay: '1.6s' }} />
        </>
      )}
      {/* glow: full size, so it shows as a turning halo around the core. Blur
          scales with size so a small orb's halo stays inside its own box
          (a fixed 8px blur on a 26px orb spills out and gets clipped square). */}
      <span className={cn('absolute inset-0 rounded-full ai-glow opacity-80', state === 'thinking' && 'ai-glow-fast',
                          state === 'hero' && 'ai-glow-hero')}
            style={{ filter: `blur(${Math.max(2, Math.round(size * 0.1))}px)` }} />
      {state === 'greet' && (
        <span className="absolute inset-0 rounded-full bg-brand-500/30 motion-safe:animate-ping"
              style={{ animationIterationCount: 2, animationDuration: '1.8s' }} />
      )}
      <span className={cn('absolute rounded-full ai-grad-deep ai-shadow flex items-center justify-center text-brand-on',
                          state === 'hero' && 'ai-breathe')}
            style={{ inset: pad }}>
        <Sparkles size={icon} className={cn(state === 'thinking' && 'motion-safe:animate-spin', state === 'hero' && 'ai-sparkle-turn')}
                  style={state === 'thinking' ? { animationDuration: '2.4s' } : undefined} />
      </span>
    </span>
  )
}

export default AiOrb