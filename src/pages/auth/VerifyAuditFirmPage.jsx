/**
 * Public page behind the link in the audit-firm confirmation email.
 *
 * The firm's contact has no account. The token in the URL is sent in a POST
 * body (never a GET to the API) — mail scanners pre-fetch links, and the page
 * loading must not count as the firm confirming. Confirmation needs the click.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, ShieldAlert, Loader2 } from 'lucide-react'
import { firmConfirmationPublicApi } from '../../api/firmVerification.api'

export default function VerifyAuditFirmPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [state, setState] = useState({ phase: 'loading' })

  useEffect(() => {
    if (!token) { setState({ phase: 'error', message: 'This link is incomplete.' }); return }
    firmConfirmationPublicApi.preview(token)
      .then(d => setState({ phase: 'ready', d }))
      .catch(e => setState({ phase: 'error', message: e?.response?.data?.error?.message || 'This confirmation link is not valid.' }))
  }, [token])

  const confirm = async () => {
    setState(s => ({ ...s, busy: true }))
    try {
      await firmConfirmationPublicApi.confirm(token)
      setState({ phase: 'done' })
    } catch (e) {
      setState({ phase: 'error', message: e?.response?.data?.error?.message || 'Could not confirm. The link may have expired.' })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-lg rounded-card border border-border glass-card shadow-elevated p-6 space-y-5">
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">KashiGRC · Audit-firm verification</p>

        {state.phase === 'loading' && <p className="text-sm text-text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking link…</p>}

        {state.phase === 'error' && (
          <div className="flex gap-3">
            <ShieldAlert size={20} className="text-status-fail-fg shrink-0" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Link not valid</p>
              <p className="text-sm text-text-secondary mt-1">{state.message}</p>
              <p className="text-xs text-text-muted mt-3">Reply to the email you received from KashiGRC and we will send a new link.</p>
            </div>
          </div>
        )}

        {state.phase === 'done' && (
          <div className="flex gap-3">
            <BadgeCheck size={20} className="text-status-pass-fg shrink-0" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Thank you — confirmed</p>
              <p className="text-sm text-text-secondary mt-1">Our team will complete the review. We will email you when your firm is verified.</p>
            </div>
          </div>
        )}

        {state.phase === 'ready' && (
          <>
            <div>
              <p className="text-base font-semibold text-text-primary">Confirm your firm's details</p>
              <p className="text-sm text-text-secondary mt-1">
                {state.d.contactName ? `${state.d.contactName}, please` : 'Please'} check that these details are accurate and that you are authorised to
                confirm them for your firm. Once verified, your firm's auditors can be admitted into client organisations on KashiGRC.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm rounded-card border border-border p-4">
              <dt className="text-text-muted">Firm</dt><dd className="col-span-2 text-text-primary font-medium">{state.d.firmLegalName}</dd>
              <dt className="text-text-muted">Registered with</dt><dd className="col-span-2 text-text-primary">{state.d.registrationBody} — <span className="font-mono">{state.d.registrationNumber}</span></dd>
              <dt className="text-text-muted">Country</dt><dd className="col-span-2 text-text-primary">{state.d.jurisdiction}</dd>
              <dt className="text-text-muted">Website</dt><dd className="col-span-2 text-text-primary">{state.d.website}</dd>
              <dt className="text-text-muted">Frameworks</dt><dd className="col-span-2 text-text-primary">{(state.d.frameworks || []).join(', ')}</dd>
              <dt className="text-text-muted">Contact</dt><dd className="col-span-2 text-text-primary">{state.d.contactName} · <span className="font-mono">{state.d.contactEmail}</span></dd>
            </dl>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-text-muted">If anything is wrong, don't confirm — reply to the email instead.</p>
              <button onClick={confirm} disabled={state.busy}
                className="h-9 px-4 rounded-ctl bg-brand-500 text-brand-on text-sm font-medium hover:bg-brand-600 disabled:opacity-60 flex items-center gap-2">
                {state.busy && <Loader2 size={14} className="animate-spin" />} Confirm details
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
