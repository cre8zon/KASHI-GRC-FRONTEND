/**
 * Product analytics — one interface, either provider, both, or neither.
 *
 * ── WHY AN ABSTRACTION RATHER THAN CALLING posthog DIRECTLY ───────────────
 * Sprinkling `posthog.capture(...)` through the app means switching provider
 * later is a find-and-replace across every component, and running both during
 * an evaluation is impossible. Three functions here and the components never
 * know which vendor is behind them.
 *
 * ── THE TENANT GROUP IS THE WHOLE POINT ───────────────────────────────────
 * A multi-tenant B2B product where events are only tied to users answers
 * almost nothing worth knowing. "Which ORGANISATIONS have never opened the
 * risk register", "does adoption differ between tenants with 5 users and
 * tenants with 500" — both need group analytics, and retrofitting it means
 * every event recorded before the change is unusable for those questions.
 *
 * So `group('tenant', tenantId)` is called on every identify, from day one.
 *
 * Worth knowing before choosing: PostHog includes group analytics on its free
 * and paid tiers. Mixpanel's Group Analytics is a PAID ADD-ON, so the same
 * code produces less on Mixpanel unless that add-on is bought. That is the
 * reason to prefer PostHog here, not a technical one.
 *
 * ── DATA RESIDENCY ────────────────────────────────────────────────────────
 * VITE_POSTHOG_HOST defaults to EU Cloud. For a GRC product sold partly on
 * DPDPA and data-residency posture, sending product telemetry to US-hosted
 * infrastructure by default is a question you do not want asked in a security
 * review. Change it deliberately, not by leaving a default.
 *
 * ── ON BY EXPLICIT CONFIG ONLY ────────────────────────────────────────────
 * No key, no analytics — every function becomes a no-op. So local development
 * and self-hosted installs send nothing without anyone opting out, and the
 * calls scattered through the app stay harmless.
 */

const POSTHOG_KEY  = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com'
const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN

let posthog = null
let mixpanel = null
let ready = false

/**
 * Loads whichever providers are configured.
 *
 * Dynamic import so neither SDK is in the main bundle for an install that uses
 * neither — which is every self-hosted deployment.
 */
export async function initAnalytics() {
  if (ready) return
  ready = true

  if (POSTHOG_KEY) {
    try {
      const mod = await import('posthog-js')
      posthog = mod.default
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: 'identified_only',

        // ── PRIVACY DEFAULTS, NOT OPTIONS ────────────────────────────────
        // This app's forms contain risk descriptions, incident details,
        // personnel records and audit findings. Session replay that captures
        // input values would ship a customer's confidential GRC data to a
        // third party, which is both a breach of their trust and squarely the
        // thing this product exists to help them avoid.
        //
        // maskAllInputs is therefore set here rather than left to the
        // dashboard toggle, where somebody can turn it off without a code
        // review.
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '[data-private]',
        },
        autocapture: false,   // explicit events only; autocapture on a GRC app
                              // records field labels that are themselves data
        capture_pageview: false,  // routed manually, see trackPage
      })
    } catch (e) {
      console.warn('[ANALYTICS] PostHog failed to load', e)
    }
  }

  if (MIXPANEL_TOKEN) {
    try {
      const mod = await import('mixpanel-browser')
      mixpanel = mod.default
      mixpanel.init(MIXPANEL_TOKEN, {
        api_host: 'https://api-eu.mixpanel.com',
        persistence: 'localStorage',
        ignore_dnt: false,
        record_sessions_percent: 0,  // off entirely rather than masked — see above
      })
    } catch (e) {
      console.warn('[ANALYTICS] Mixpanel failed to load', e)
    }
  }
}

/**
 * Ties events to a user AND their tenant.
 *
 * ── WHAT IS DELIBERATELY NOT SENT ─────────────────────────────────────────
 * No name, no email. A user id and a tenant id answer every product question
 * worth asking, and personal details in a third-party analytics store are a
 * processor relationship, a DPA and a deletion obligation nobody budgeted for.
 *
 * Role IS sent, because "do CISOs use this differently from analysts" is a real
 * question and a role is not personal data.
 */
export function identify({ userId, tenantId, tenantName, roles = [], sides = [] }) {
  if (!userId) return
  const traits = {
    tenant_id: tenantId,
    roles: roles.map(r => r.roleName ?? r).filter(Boolean),
    sides,
  }

  if (posthog) {
    posthog.identify(String(userId), traits)
    if (tenantId) {
      // The call that has to happen from day one. Retrofitting it leaves every
      // earlier event unattributable to an organisation.
      posthog.group('tenant', String(tenantId), { name: tenantName })
    }
  }

  if (mixpanel) {
    mixpanel.identify(String(userId))
    mixpanel.people.set(traits)
    if (tenantId) {
      // Requires the paid Group Analytics add-on. Without it this is accepted
      // and silently does nothing — which is worth knowing before concluding
      // Mixpanel "does not show tenants".
      mixpanel.set_group('tenant', String(tenantId))
    }
  }
}

/** Clears identity on logout, so the next user on a shared machine is not merged. */
export function resetAnalytics() {
  try { posthog?.reset() } catch {}
  try { mixpanel?.reset() } catch {}
}

/**
 * One event.
 *
 * Name events `object_verb` — `risk_created`, `dashboard_arranged`. Consistency
 * matters more than the specific convention: a store with `createdRisk`,
 * `risk_create` and `Risk Created` in it cannot be queried.
 */
export function track(event, props = {}) {
  try { posthog?.capture(event, props) } catch {}
  try { mixpanel?.track(event, props) } catch {}
}

/**
 * A page view, called from the router rather than automatically.
 *
 * Automatic capture would record the full URL, and these carry record ids —
 * /module/incident/4417. The id is not secret but it is customer data sitting
 * in a third-party store for no analytical gain, since what matters is which
 * SCREEN was opened. The path is normalised before sending.
 */
export function trackPage(path) {
  const normalised = String(path)
    .replace(/\/\d+/g, '/:id')
    .replace(/\?.*$/, '')
  track('$pageview', { path: normalised })
}

/** Whether anything is actually on — for a settings screen to report honestly. */
export function analyticsEnabled() {
  return Boolean(posthog || mixpanel)
}