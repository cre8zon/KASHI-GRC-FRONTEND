import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, RefreshCw, Building2, Scale, Server, Users,
  PenLine, Sparkles, AlertTriangle, Loader2,
} from 'lucide-react'
import { aiApi } from '../../api/ai.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * The grounding facts every AI feature reads before it writes anything.
 *
 * ── WHY THIS SCREEN EXISTS ───────────────────────────────────────────────────
 * AiOrgProfileController's own javadoc states the problem it solves:
 *
 *   "Output quality is bounded by what this table contains. A tenant with a
 *    filled profile gets policies naming their real cloud provider, their real
 *    security owner and their real jurisdictions; a tenant with an empty one
 *    gets 'The Company shall implement appropriate controls.'"
 *
 * The API, the completeness score and PolicyVariableCatalog were all built for
 * this form. Until now there was no form, so every tenant ran on an empty
 * profile and every generated policy came out full of [[PLACEHOLDERS]] that the
 * system already had the answers to.
 *
 * ── THE THREE KINDS OF FIELD ─────────────────────────────────────────────────
 * PolicyVariableCatalog divides variables by where they come from, and the
 * grouping below follows it rather than inventing its own:
 *
 *   ORG FACT   fields here, written into generated text as literal values
 *   PARAMETER  a decision nobody has made yet — left as [[PLACEHOLDER]]
 *   WORKFLOW   filled later by the adoption workflow, never typed here
 *
 * So a field on this screen is one the model will quote verbatim. That is why
 * the helper text matters: "AWS" produces a better sentence than "cloud".
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const SPELLING_OPTIONS = [
  { value: 'BRITISH',  label: 'British — organisation, authorised, licence' },
  { value: 'AMERICAN', label: 'American — organization, authorized, license' },
]

const TONE_OPTIONS = [
  { value: 'FORMAL',        label: 'Formal — traditional policy register' },
  { value: 'PLAIN_ENGLISH', label: 'Plain English — same meaning, fewer clauses' },
  { value: 'CONCISE',       label: 'Concise — shortest defensible wording' },
]

const REMOTE_OPTIONS = [
  { value: 'REMOTE_FIRST', label: 'Remote first' },
  { value: 'HYBRID',       label: 'Hybrid' },
  { value: 'OFFICE_FIRST', label: 'Office first' },
]

/** Mirrors the weights in AiOrgProfileController.completeness(). */
const FIELD_LABELS = {
  legalName:           'Legal entity name',
  industry:            'Industry',
  frameworksInScope:   'Frameworks in scope',
  cloudProviders:      'Cloud provider',
  securityOwnerName:   'Security owner',
  operatingCountries:  'Operating countries',
  identityProvider:    'Identity provider',
  headquartersCountry: 'Headquarters',
  remoteWorkModel:     'Working model',
  securityContactEmail:'Security contact',
  customFactsJson:     'Custom facts',
  prohibitedClaims:    'Prohibited claims',
}

const EMPTY = {
  legalName: '', shortName: '', industry: '', employeeCount: '',
  headquartersCountry: '', operatingCountries: '',
  frameworksInScope: '', dataResidencyRegions: '',
  processesPersonalData: false, processesHealthData: false,
  processesCardholderData: false, processesChildrenData: false,
  cloudProviders: '', identityProvider: '', mdmSolution: '',
  endpointProtection: '', codeRepository: '', ticketingSystem: '',
  hasOnPremise: false, remoteWorkModel: '',
  securityOwnerName: '', securityOwnerTitle: '', securityContactEmail: '',
  privacyOfficerName: '', incidentContactEmail: '',
  toneOfVoice: 'FORMAL', spellingVariant: 'BRITISH',
  defaultReviewFrequencyMonths: 12, policyRefPrefix: '',
  customFactsJson: '', prohibitedClaims: '',
  preferredProvider: '', preferredModel: '',
  aiEnabled: true, allowExampleMining: false,
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
const useOrgProfile = () => useQuery({
  queryKey: ['ai-org-profile'],
  queryFn:  () => aiApi.getOrgProfile(),
})

const useCompleteness = () => useQuery({
  queryKey: ['ai-org-profile-completeness'],
  queryFn:  () => aiApi.completeness(),
})

const useSaveProfile = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (profile) => aiApi.saveOrgProfile(profile),
    onSuccess: () => {
      // Both must refresh: the score is derived from what was just saved.
      qc.invalidateQueries({ queryKey: ['ai-org-profile'] })
      qc.invalidateQueries({ queryKey: ['ai-org-profile-completeness'] })
      toast.success('Profile saved')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not save the profile'),
  })
}

// ─── Completeness ─────────────────────────────────────────────────────────────
function CompletenessCard({ data, loading }) {
  const score   = data?.score ?? 0
  const missing = data?.missing || []

  // Three bands, matching the three messages the endpoint returns.
  const tone = score >= 80 ? 'pass' : score >= 50 ? 'warn' : 'fail'
  const bar  = {
    pass: 'bg-status-pass-fg',
    warn: 'bg-status-warn-fg',
    fail: 'bg-status-fail-fg',
  }[tone]

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-text-primary tabular-nums">
                {loading ? '—' : `${score}%`}
              </span>
              <span className="text-xs text-text-muted">grounded</span>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              {data?.message || 'Checking how much the model has to work with…'}
            </p>
          </div>
          {score < 50 && !loading && (
            <AlertTriangle size={16} className="text-status-warn-fg shrink-0 mt-1" />
          )}
        </div>

        <div className="mt-3 h-1.5 w-full rounded-full bg-surface-overlay overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', bar)}
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </div>

        {missing.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-1.5">
              Still empty — each of these is quoted directly into generated text:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map(key => (
                <span
                  key={key}
                  className="text-xs px-2 py-0.5 rounded-ctl bg-surface-overlay text-text-secondary border border-border"
                >
                  {FIELD_LABELS[key] || key}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────
// There is no Checkbox in components/ui, and adding one to the design system
// for a single screen would be the wrong place to introduce it. Styled inline
// with the same tokens the other controls use.
function Check({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none py-1">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-ctl border-border accent-brand-500"
      />
      <span className="min-w-0">
        <span className="text-sm text-text-primary">{label}</span>
        {hint && <span className="block text-xs text-text-muted mt-0.5">{hint}</span>}
      </span>
    </label>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon size={14} className="text-text-muted" />
            {title}
          </span>
        }
        subtitle={subtitle}
      />
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          {children}
        </div>
      </CardBody>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AiOrgProfilePage() {
  const { data: profile, isLoading, refetch } = useOrgProfile()
  const { data: completeness, isLoading: scoring } = useCompleteness()
  const { mutate: save, isPending: saving } = useSaveProfile()

  const [form, setForm] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)

  // Seed once. Re-seeding on every query settle would discard edits made while
  // a background refetch was in flight.
  useEffect(() => {
    if (profile && !loaded) {
      setForm({ ...EMPTY, ...Object.fromEntries(
        Object.entries(profile).filter(([, v]) => v !== null && v !== undefined)
      ) })
      setLoaded(true)
    }
  }, [profile, loaded])

  const set = (key) => (e) => {
    const v = e?.target ? e.target.value : e
    setForm(f => ({ ...f, [key]: v }))
  }
  const setBool = (key) => (v) => setForm(f => ({ ...f, [key]: v }))

  const dirty = useMemo(() => {
    if (!loaded) return false
    return Object.keys(EMPTY).some(k => {
      const a = form[k] ?? ''
      const b = profile?.[k] ?? EMPTY[k] ?? ''
      return String(a) !== String(b)
    })
  }, [form, profile, loaded])

  const onSave = () => {
    save({
      ...form,
      // Both are integers server-side; an empty input is a blank string, which
      // would fail binding rather than clearing the column.
      employeeCount: form.employeeCount === '' ? null : Number(form.employeeCount),
      defaultReviewFrequencyMonths:
        form.defaultReviewFrequencyMonths === '' ? null : Number(form.defaultReviewFrequencyMonths),
    })
  }

  return (
    <PageLayout
      title="AI organisation profile"
      subtitle="The facts every generated policy, questionnaire answer and article is written from"
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw size={13} className={cn(isLoading && 'animate-spin')} />
            Reload
          </Button>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty || saving}>
            <Save size={13} />
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-w-5xl">

          <CompletenessCard data={completeness} loading={scoring} />

          <Section
            icon={Building2}
            title="Identity"
            subtitle="Written into the opening paragraph of every policy"
          >
            <Input label="Legal entity name" value={form.legalName} onChange={set('legalName')}
                   placeholder="Dinfosek Solutions LLP"
                   helperText="The name as it appears on contracts, not the product name" />
            <Input label="Short name" value={form.shortName} onChange={set('shortName')}
                   placeholder="KashiGuard" />
            <Input label="Industry" value={form.industry} onChange={set('industry')}
                   placeholder="B2B SaaS — governance, risk and compliance" />
            <Input label="Headcount" type="number" min="0"
                   value={form.employeeCount} onChange={set('employeeCount')}
                   helperText="Changes what the model assumes about separation of duties" />
            <Input label="Headquarters" value={form.headquartersCountry} onChange={set('headquartersCountry')}
                   placeholder="India" />
            <Input label="Operating countries" value={form.operatingCountries} onChange={set('operatingCountries')}
                   placeholder="India, Singapore"
                   helperText="Comma separated — drives which jurisdictions get named" />
          </Section>

          <Section
            icon={Scale}
            title="Regulatory"
            subtitle="Decides which obligations a generated document takes seriously"
          >
            <Input label="Frameworks in scope" value={form.frameworksInScope} onChange={set('frameworksInScope')}
                   placeholder="ISO 27001, SOC 2, DPDPA" />
            <Input label="Data residency regions" value={form.dataResidencyRegions} onChange={set('dataResidencyRegions')}
                   placeholder="ap-south-1" />
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Check label="Processes personal data"
                     checked={form.processesPersonalData} onChange={setBool('processesPersonalData')} />
              <Check label="Processes health data"
                     hint="Pulls in stricter handling language"
                     checked={form.processesHealthData} onChange={setBool('processesHealthData')} />
              <Check label="Processes cardholder data"
                     hint="Makes PCI DSS controls relevant"
                     checked={form.processesCardholderData} onChange={setBool('processesCardholderData')} />
              <Check label="Processes children's data"
                     hint="Triggers guardian-consent requirements under DPDPA"
                     checked={form.processesChildrenData} onChange={setBool('processesChildrenData')} />
            </div>
          </Section>

          <Section
            icon={Server}
            title="Technical estate"
            subtitle="Named directly in control wording — 'in AWS KMS' rather than 'in a key management service'"
          >
            <Input label="Cloud provider" value={form.cloudProviders} onChange={set('cloudProviders')}
                   placeholder="AWS" />
            <Input label="Identity provider" value={form.identityProvider} onChange={set('identityProvider')}
                   placeholder="Okta" />
            <Input label="Source control" value={form.codeRepository} onChange={set('codeRepository')}
                   placeholder="GitHub" />
            <Input label="Ticketing" value={form.ticketingSystem} onChange={set('ticketingSystem')}
                   placeholder="Jira" />
            <Input label="Device management" value={form.mdmSolution} onChange={set('mdmSolution')}
                   placeholder="Jamf" />
            <Input label="Endpoint protection" value={form.endpointProtection} onChange={set('endpointProtection')}
                   placeholder="CrowdStrike" />
            <Select label="Working model" options={REMOTE_OPTIONS} placeholder="Not set"
                    value={form.remoteWorkModel} onChange={set('remoteWorkModel')} />
            <div className="flex items-end pb-1">
              <Check label="Has on-premise infrastructure"
                     checked={form.hasOnPremise} onChange={setBool('hasOnPremise')} />
            </div>
          </Section>

          <Section
            icon={Users}
            title="Roles"
            subtitle="Replaces [[SECURITY OFFICER]] and its siblings with real names"
          >
            <Input label="Security owner" value={form.securityOwnerName} onChange={set('securityOwnerName')}
                   placeholder="Priyanka Paridhi" />
            <Input label="Security owner title" value={form.securityOwnerTitle} onChange={set('securityOwnerTitle')}
                   placeholder="Head of Security" />
            <Input label="Security contact" type="email"
                   value={form.securityContactEmail} onChange={set('securityContactEmail')}
                   placeholder="security@kashiguard.com" />
            <Input label="Privacy officer" value={form.privacyOfficerName} onChange={set('privacyOfficerName')} />
            <Input label="Incident reporting address" type="email"
                   value={form.incidentContactEmail} onChange={set('incidentContactEmail')}
                   placeholder="incident@kashiguard.com" />
          </Section>

          <Section
            icon={PenLine}
            title="Conventions"
            subtitle="House style, applied to everything generated"
          >
            <Select label="Spelling" options={SPELLING_OPTIONS}
                    value={form.spellingVariant} onChange={set('spellingVariant')} />
            <Select label="Tone" options={TONE_OPTIONS}
                    value={form.toneOfVoice} onChange={set('toneOfVoice')} />
            <Input label="Default review cycle (months)" type="number" min="1" max="60"
                   value={form.defaultReviewFrequencyMonths}
                   onChange={set('defaultReviewFrequencyMonths')} />
            <Input label="Policy reference prefix" value={form.policyRefPrefix} onChange={set('policyRefPrefix')}
                   placeholder="POL" helperText="Produces POL-001, POL-002 and so on" />
            <div className="md:col-span-2">
              <Textarea label="Custom facts" rows={3}
                        value={form.customFactsJson} onChange={set('customFactsJson')}
                        placeholder="We run a 24x7 SOC from Bengaluru. All production access is brokered through Teleport."
                        helperText="Anything true of your organisation that the fields above cannot express. The model treats these as facts, so write only what you can evidence." />
            </div>
            <div className="md:col-span-2">
              <Textarea label="Prohibited claims" rows={3}
                        value={form.prohibitedClaims} onChange={set('prohibitedClaims')}
                        placeholder="Never state that we are ISO 27001 certified. Never claim a SOC 2 Type II report exists."
                        helperText="Claims the model must never make. A single false statement in a compliance document is worse than a missing one." />
            </div>
          </Section>

          <Section
            icon={Sparkles}
            title="AI configuration"
            subtitle="Which model serves this tenant, and what it may learn from"
          >
            <Input label="Preferred provider" value={form.preferredProvider} onChange={set('preferredProvider')}
                   placeholder="gemini"
                   helperText="Pinning a vendor keeps this tenant on it: if it is busy, only that vendor's backup models are tried, never another company's — so a stated sub-processor commitment is not quietly broken. Must match a configured provider exactly, or it is ignored." />
            <Input label="Preferred model" value={form.preferredModel} onChange={set('preferredModel')}
                   helperText="Leave blank to use the provider's configured default" />
            <div className="md:col-span-2">
              <Check label="AI features enabled for this tenant"
                     checked={form.aiEnabled} onChange={setBool('aiEnabled')} />
              <Check label="Allow accepted output to be used as few-shot examples"
                     hint="Improves future suggestions for this tenant. Leave off where customer content must not be reused."
                     checked={form.allowExampleMining} onChange={setBool('allowExampleMining')} />
            </div>
          </Section>

          <div className="flex justify-end pb-6">
            <Button onClick={onSave} loading={saving} disabled={!dirty || saving}>
              <Save size={14} />
              Save changes
            </Button>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
