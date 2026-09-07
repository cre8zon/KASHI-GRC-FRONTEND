/**
 * AiPolicyCreateModal — the CREATE path. Three steps: describe, review, generate.
 *
 * ── WHY A MODAL, NOT A ROUTE ────────────────────────────────────────────────
 * v1 was a full page reached by __navRoute. It worked and it looked wrong: the
 * policy list, the create form and the CSV importer are all modals over the
 * module screen, so a full page break made the AI flow feel bolted on rather
 * than part of the product.
 *
 * This follows the __openImport precedent exactly — a payload flag sets a
 * boolean, and the modal renders as a sibling of the list. Three lines in
 * UniversalModulePage, mirroring what TestPolicyCsvImportModal already does.
 *
 * ── WHY THE METADATA STEP IS SEPARATE FROM GENERATION ───────────────────────
 * Title, frameworks and control mappings are the grounding for everything the
 * draft then produces. Getting them wrong silently yields a fluent policy about
 * the wrong subject. Splitting the step puts a human between the guess and the
 * consequence, at the one moment when correcting it costs nothing.
 *
 * Every suggested field is editable here. The AI proposes; the user decides.
 *
 * ── REACHED FROM THE MODULE LIST, NOT A HARDCODED PAGE ──────────────────────
 * The policy list and detail are ui_layouts-driven under /module/audit_policy.
 * This page is reached by a ui_actions row carrying
 *   {"__navRoute": "/audit/policies/new-ai"}
 * which UniversalModulePage.handleListAction already dispatches — the same
 * mechanism that opens the editor via {"__navRoute": "/audit/policies/{id}"}.
 * No change to that page. See 40-seed-ai-ui-actions.sql.
 *
 * ── WHAT THIS CREATES ───────────────────────────────────────────────────────
 * One AuditPolicy in DRAFT, with the confirmed metadata and the generated body,
 * through the SAME endpoint the create form posts to.
 * It does NOT approve, does not send for review, does not link controls. The
 * adoption workflow starts when the drafter submits, exactly as it does for a
 * hand-written policy — that chain is the audit evidence.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ArrowRight, Check, Loader2, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { aiApi } from '../../api/ai.api'
import api from '../../config/axios.config'
import { cn } from '../../lib/cn'

const STAGES = [
  'Gathering your organisation profile',
  'Reading the selected controls',
  'Drafting the policy',
  'Reviewing it against the requirements',
  'Checking control references',
]

/**
 * Mirrors ui_form_fields id 109 (frameworkRefs on audit_policy_create_form),
 * minus the two keyboard-mash test values that field still offers, plus DPDPA.
 * If you edit that row, edit this — or better, fetch the field config.
 */
const FRAMEWORKS = ['ISO27001', 'SOC2', 'DPDPA', 'CERTIN', 'RBI', 'PSS']

/**
 * ui_options for component 49 (policy_review_cycle). The create form renders a
 * SELECT over exactly these five, so a free number input here would let AI or
 * the user produce a value the edit form cannot then display.
 */
const REVIEW_CYCLES = [
  { value: 3,  label: 'Quarterly' },
  { value: 6,  label: 'Every 6 months' },
  { value: 12, label: 'Annually' },
  { value: 24, label: 'Every 2 years' },
  { value: 36, label: 'Every 3 years' },
]

export default function AiPolicyCreateModal({ open, onClose, onCreated }) {
  const navigate = useNavigate()

  const [step, setStep]       = useState(1)
  const [intent, setIntent]   = useState('')
  const [frameworks, setFw]   = useState([])
  const [busy, setBusy]       = useState(false)
  const [stage, setStage]     = useState(0)

  // Step 2 — every one of these is seeded by AI and then owned by the user.
  const [meta, setMeta]       = useState(null)
  const [dropped, setDropped] = useState({})     // controlCode -> true when deselected
  const [extra, setExtra]     = useState('')
  const [quick, setQuick]     = useState(false)

  // Reset on open. A modal that remembers the last run's suggestions shows one
  // policy's controls while the user describes a different one.
  useEffect(() => {
    if (!open) return
    setStep(1); setIntent(''); setFw([]); setMeta(null)
    setDropped({}); setExtra(''); setQuick(false); setBusy(false); setStage(0)
  }, [open])

  const toggleFw = (f) => setFw(v => v.includes(f) ? v.filter(x => x !== f) : [...v, f])

  // ── Step 1 -> 2 ───────────────────────────────────────────────────────────
  const suggest = async () => {
    if (intent.trim().length < 10) return toast.error('Describe what the policy needs to cover')
    setBusy(true)
    try {
      const res = await aiApi.suggestMetadata({ intent: intent.trim(), frameworks })
      const body = res.data?.data ?? res.data
      setMeta(body)
      setDropped({})
      if (body?.warnings?.length) toast(body.warnings[0], { icon: '⚠️' })
      setStep(2)
    } catch (e) {
      toast.error(e?.response?.data?.error?.message || 'Could not suggest metadata')
    } finally { setBusy(false) }
  }

  // ── Step 2 -> 3 ───────────────────────────────────────────────────────────
  const generate = async () => {
    if (!meta?.title?.trim()) return toast.error('The policy needs a title')

    const keptCodes = (meta.suggestedControls || [])
      .filter(c => !dropped[c.controlCode]).map(c => c.controlCode)

    setBusy(true); setStage(0); setStep(3)
    const tick = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 4000)

    try {
      // 1 — generate the body first. If generation fails there is no orphan
      //     DRAFT left behind for someone to find later and wonder about.
      const draftRes = await aiApi.draft({
        title: meta.title.trim(),
        controlCodes: keptCodes,
        frameworks: meta.frameworkRefs?.length ? meta.frameworkRefs : frameworks,
        additionalInstructions: extra.trim() || undefined,
        quickMode: quick,
      })
      const draft = draftRes.data?.data ?? draftRes.data

      // 2 — create the policy with the confirmed metadata and the generated body
      /*
       * These are exactly the fields audit_policy_create_form (ui_forms id 13)
       * submits to this endpoint, in the same shapes:
       *
       *   title                  TEXT      required
       *   policyRef              TEXT      optional — blank auto-generates
       *   contentType            SELECT    default RICH_TEXT
       *   frameworkRefs          TAG       comma-joined
       *   controlTags            TAG       comma-joined; the suggestions on that
       *                                    field are UCF leaf codes, so this IS
       *                                    the control-code field in practice
       *   reviewFrequencyMonths  SELECT    3 | 6 | 12 | 24 | 36
       *   ownerTeam              TEXT      optional
       *   description            TEXTAREA  optional
       *
       * contentBody is the one addition — the form leaves it empty and sends the
       * user to the editor; here the body already exists.
       */
      const createRes = await api.post('/v1/audit/library/policies', {
        title:                 meta.title.trim(),
        policyRef:             meta.policyRef?.trim() || undefined,
        contentType:           'RICH_TEXT',
        contentBody:           draft.contentHtml,
        description:           meta.description || undefined,
        frameworkRefs:         (meta.frameworkRefs?.length ? meta.frameworkRefs : frameworks).join(','),
        controlTags:           keptCodes.join(','),
        ownerTeam:             meta.ownerTeam || undefined,
        reviewFrequencyMonths: meta.reviewFrequencyMonths || 12,
      })
      const created = createRes.data?.data ?? createRes.data

      // 3 — record acceptance. Without this the create path, likely the most
      //     used AI action in the product, contributes nothing to the flywheel.
      if (draft.interactionId) {
        aiApi.feedback({
          interactionId: draft.interactionId,
          suggestionType: 'DRAFT',
          suggestionKey: meta.title.trim(),
          decision: 'ACCEPTED',
          originalValue: draft.contentHtml,
        }).catch(() => {})
      }
      if (meta.interactionId) {
        aiApi.feedback({
          interactionId: meta.interactionId,
          suggestionType: 'METADATA',
          suggestionKey: meta.title.trim(),
          decision: Object.keys(dropped).length ? 'ACCEPTED_WITH_EDIT' : 'ACCEPTED',
          originalValue: (meta.suggestedControls || []).map(c => c.controlCode).join(','),
          finalValue: keptCodes.join(','),
        }).catch(() => {})
      }

      toast.success('Draft created')
      onCreated?.(created)          // lets the list invalidate its query
      onClose?.()
      navigate(`/audit/policies/${created.id}/edit`)

    } catch (e) {
      toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || 'Could not create the policy')
      setStep(2)
    } finally {
      clearInterval(tick); setBusy(false)
    }
  }

  const kept = (meta?.suggestedControls || []).filter(c => !dropped[c.controlCode])

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="lg"
      title="Draft a policy with AI"
      subtitle={step === 1 ? 'Describe what you need — the rest is suggested'
              : step === 2 ? 'Review and adjust before anything is created'
              : 'Generating — this takes about twenty seconds'}
      footer={
        step === 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="primary" icon={Sparkles} loading={busy}
              loadingText="Thinking…" onClick={suggest}>
              Suggest the details
            </Button>
          </div>
        ) : step === 2 ? (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button size="sm" variant="primary" icon={ArrowRight} onClick={generate}>
              Generate and create draft
            </Button>
          </div>
        ) : null
      }
    >
      <div className="w-full">

        {/* ── stepper ── */}
        <div className="mb-5 flex items-center gap-2">
          {['Describe', 'Review', 'Generate'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium',
                step > i + 1 ? 'bg-brand-500 text-brand-ink'
                : step === i + 1 ? 'bg-brand-500/15 text-brand-ink ring-1 ring-brand-500/40'
                : 'bg-surface-overlay text-text-muted',
              )}>
                {step > i + 1 ? <Check size={12} /> : i + 1}
              </div>
              <span className={cn('text-xs',
                step === i + 1 ? 'text-text-primary font-medium' : 'text-text-muted')}>
                {label}
              </span>
              {i < 2 && <ChevronRight size={13} className="text-text-muted/40" />}
            </div>
          ))}
        </div>

        {/* ══ STEP 1 ══ */}
        {step === 1 && (
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                What does this policy need to cover?
              </span>
              <textarea
                autoFocus rows={4} value={intent} onChange={e => setIntent(e.target.value)}
                placeholder="e.g. how staff handle company laptops, including encryption, lost devices and what happens when someone leaves"
                className="glass-field w-full rounded-ctl p-3 text-sm text-text-primary"
              />
              <span className="mt-1 block text-[11px] text-text-muted">
                A sentence is enough. Title, controls and review cadence are suggested from this.
              </span>
            </label>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                Frameworks <span className="text-text-muted">(optional — narrows the controls offered)</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {FRAMEWORKS.map(f => (
                  <button key={f} onClick={() => toggleFw(f)}
                    className={cn('h-7 rounded-ctl px-2.5 text-xs transition-colors',
                      frameworks.includes(f)
                        ? 'bg-brand-500 text-brand-ink'
                        : 'border border-border text-text-secondary hover:bg-surface-overlay')}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ══ STEP 2 ══ */}
        {step === 2 && meta && (
          <div className="space-y-4">
            {meta.rationale && (
              <p className="rounded-ctl bg-surface-overlay px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
                {meta.rationale}
              </p>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Title</span>
              <input value={meta.title || ''} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
                className="glass-field h-9 w-full rounded-ctl px-3 text-sm text-text-primary" />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                Policy ref <span className="text-text-muted">(leave blank to auto-generate)</span>
              </span>
              <input value={meta.policyRef || ''} onChange={e => setMeta(m => ({ ...m, policyRef: e.target.value }))}
                placeholder="POL-12"
                className="glass-field reg-code h-9 w-full rounded-ctl px-3 text-sm text-text-primary" />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Description</span>
              <textarea rows={2} value={meta.description || ''}
                onChange={e => setMeta(m => ({ ...m, description: e.target.value }))}
                className="glass-field w-full rounded-ctl p-2 text-sm text-text-primary" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Owner team</span>
                <input value={meta.ownerTeam || ''} onChange={e => setMeta(m => ({ ...m, ownerTeam: e.target.value }))}
                  className="glass-field h-9 w-full rounded-ctl px-3 text-sm text-text-primary" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Review cycle</span>
                <select value={meta.reviewFrequencyMonths || 12}
                  onChange={e => setMeta(m => ({ ...m, reviewFrequencyMonths: Number(e.target.value) }))}
                  className="glass-field h-9 w-full rounded-ctl px-2 text-sm text-text-primary">
                  {REVIEW_CYCLES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Controls — deselect individually. These become the policy's stored
                control tags and the grounding for the draft, so the user reviews
                them here rather than discovering them afterwards. */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                Controls this policy will address
                <span className="ml-1 text-text-muted">({kept.length} selected)</span>
              </span>
              {(meta.suggestedControls || []).length === 0 ? (
                <p className="rounded-ctl border border-border px-3 py-3 text-xs text-text-muted">
                  No confident mappings found. The policy will still be drafted — link controls
                  from the editor afterwards.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-ctl border border-border">
                  {meta.suggestedControls.map(c => {
                    const off = dropped[c.controlCode]
                    return (
                      <div key={c.controlCode}
                        className={cn('flex items-start gap-2 px-3 py-2', off && 'opacity-40')}>
                        <input type="checkbox" checked={!off} className="mt-0.5 accent-brand-500"
                          onChange={() => setDropped(d => ({ ...d, [c.controlCode]: !off }))} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="reg-code text-xs font-medium text-text-primary">{c.controlCode}</span>
                            {typeof c.confidence === 'number' && (
                              <span className={cn('rounded-ctl px-1.5 py-px text-[9px] font-medium',
                                c.confidence >= 0.8 ? 'bg-status-pass-bg text-status-pass-fg'
                                : c.confidence >= 0.6 ? 'bg-status-warn-bg text-status-warn-fg'
                                : 'bg-surface-overlay text-text-muted')}>
                                {Math.round(c.confidence * 100)}%
                              </span>
                            )}
                          </div>
                          {c.controlTitle && (
                            <div className="truncate text-[11px] text-text-secondary">{c.controlTitle}</div>
                          )}
                          {c.rationale && (
                            <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted">{c.rationale}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                Anything specific to add <span className="text-text-muted">(optional)</span>
              </span>
              <textarea rows={2} value={extra} onChange={e => setExtra(e.target.value)}
                placeholder="e.g. we are fully remote, keep it under three pages"
                className="glass-field w-full rounded-ctl p-2 text-sm text-text-primary" />
            </label>

            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={quick} onChange={e => setQuick(e.target.checked)}
                className="accent-brand-500" />
              Quick mode — skip the review pass. Faster and cheaper, slightly rougher.
            </label>

          </div>
        )}

        {/* ══ STEP 3 ══ */}
        {step === 3 && (
          <div className="space-y-2 py-6">
            {STAGES.map((s, i) => (
              <div key={s} className={cn('flex items-center gap-2 text-xs transition-opacity',
                i < stage ? 'text-text-muted'
                : i === stage ? 'text-text-primary'
                : 'text-text-muted/40')}>
                {i < stage ? <Check size={13} className="text-brand-600" />
                 : i === stage ? <Loader2 size={13} className="animate-spin text-brand-500" />
                 : <ChevronRight size={13} />}
                {s}
              </div>
            ))}
            <p className="pt-3 text-[11px] text-text-muted">
              Several model calls, and every control reference is checked against your
              catalogue before you see it.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}