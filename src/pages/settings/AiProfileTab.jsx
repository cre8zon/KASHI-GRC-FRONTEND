import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, RefreshCw, Building2, Scale, Server,
  PenLine, Sparkles, AlertTriangle, Loader2, UserCheck, History, Plus, UserMinus,
} from 'lucide-react'
import { aiApi } from '../../api/ai.api'
import api from '../../config/axios.config'
import { usersApi } from '../../api/users.api'
import { PickerCombobox } from '../../components/ui/PickerCombobox'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * The grounding facts every AI feature reads before it writes anything.
 *
 * ── WHERE IT LIVES ───────────────────────────────────────────────────────────
 * Settings → AI profile, beside Integrations. It is organisation-wide and read
 * by every AI feature (policies, questionnaire answers, content), so it does
 * not belong under any one module's menu. /settings/ai-profile redirects here.
 * Shown to users who can create policies (AUDIT_CREATE) or platform operators —
 * the same rule the backend applies to saving it.
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

// ─── Policy roles ─────────────────────────────────────────────────────────────
// Who holds each accountable role. Generated policies name the ROLE ("the
// Engineering Lead reviews…"); the holder's name is filled in when a policy is
// read, through {{role_<key>}}. Changing a holder ends their tenure rather than
// overwriting it, so the history of who held what, when, is kept — and the
// approval record of every policy keeps its own names regardless.
const rolesApi = {
  list:   ()     => api.get('/v1/ai/org-profile/roles'),
  assign: (body) => api.post('/v1/ai/org-profile/roles', body),
  vacate: (key)  => api.post(`/v1/ai/org-profile/roles/${encodeURIComponent(key)}/vacate`),
}
const unwrap = (r) => r?.data?.data ?? r?.data ?? r
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const SUGGESTED_ROLES = [
  'Chief Information Security Officer', 'Engineering Lead', 'Privacy Officer',
  'IT Manager', 'HR Manager', 'Incident Manager',
]

// ── Suggesting holders ───────────────────────────────────────────────────────
// Job titles and system roles only RANK the people offered for a policy role;
// they never assign it. A job title is free text that many people may share,
// and a system role is a permission bundle — neither says who is accountable.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const STOP_WORDS = new Set(['of', 'and', 'the', 'for'])
const acronym = (s) => norm(s).split(' ').filter(w => w && !STOP_WORDS.has(w)).map(w => w[0]).join('')

/** "Chief Information Security Officer" ~ "CISO" ~ "chief information security officer". */
function titleMatches(roleTitle, other) {
  const a = norm(roleTitle), b = norm(other)
  if (!a || !b) return false
  if (a === b) return true
  const ac = a.replace(/ /g, ''), bc = b.replace(/ /g, '')
  if (acronym(a).length >= 2 && acronym(a) === bc) return true
  if (acronym(b).length >= 2 && acronym(b) === ac) return true
  const shorter = a.length < b.length ? a : b
  const longer  = shorter === a ? b : a
  return shorter.length >= 6 && ` ${longer} `.includes(` ${shorter} `)
}
/** ORG_CISO -> "ciso", GRC_MANAGER -> "grc manager". */
const systemRoleWords = (name) => norm(String(name || '').replace(/^(ORG|ORGANIZATION|VENDOR|AUDITOR|SYSTEM)_/i, ''))

/**
 * Job title was never mandatory, so most people have none. When the chosen
 * holder has no title, offer to save one to their user record. The backend
 * fills it only while it is empty and never overwrites an existing title.
 */
function JobTitleOffer({ user, roleTitle, value, onChange }) {
  if (!user || user.jobTitle) return null
  const first = String(user.label || '').split(' ')[0] || 'This person'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 basis-full md:col-span-3">
      <Check label={`${first} has no job title — save one to their user profile`}
             checked={value.save} onChange={v => onChange({ ...value, save: v })} />
      {value.save && (
        <div className="w-full sm:w-72">
          <Input value={value.text ?? roleTitle} placeholder={roleTitle || 'Job title'}
                 onChange={e => onChange({ ...value, text: e.target.value })} />
        </div>
      )}
    </div>
  )
}
const JT_DEFAULT = { save: true, text: null }
const jobTitleFor = (user, jt, roleTitle) =>
  user && !user.jobTitle && jt.save ? ((jt.text ?? roleTitle) || '').trim() || undefined : undefined

// A role whose title names privacy or data protection is the privacy officer;
// the backend applies the same rule (PolicyRoleRegister.applyTo).
const isPrivacyRole = (title) => /privacy|data protection|\bdpo\b/i.test(title || '')

function PolicyRolesSection({ form, setForm }) {
  const qc = useQueryClient()
  const [newTitle, setNewTitle]   = useState('')
  const [newUser, setNewUser]     = useState('')
  const [editing, setEditing]     = useState(null)   // roleKey being reassigned
  const [editUser, setEditUser]   = useState('')
  const [showHistory, setHistory] = useState(false)
  const [newJt, setNewJt]         = useState(JT_DEFAULT)
  const [editJt, setEditJt]       = useState(JT_DEFAULT)
  const pickNewUser  = (v) => { setNewUser(v);  setNewJt(JT_DEFAULT) }
  const pickEditUser = (v) => { setEditUser(v); setEditJt(JT_DEFAULT) }

  const { data: rolesRaw, isLoading } = useQuery({
    queryKey: ['policy-roles'],
    queryFn:  () => rolesApi.list().then(unwrap),
  })
  const rows    = Array.isArray(rolesRaw) ? rolesRaw : []
  const current = rows.filter(r => r.current)
  const past    = rows.filter(r => !r.current)

  // The organisation's own active people. The backend refuses anyone else.
  const { data: usersRaw, isLoading: usersLoading } = useQuery({
    queryKey: ['policy-role-users'],
    queryFn:  () => usersApi.list({ side: 'ORGANIZATION', filterBy: 'status=ACTIVE', take: 200, skip: 0 }),
    staleTime: 5 * 60 * 1000,
  })
  const users = useMemo(() => {
    const list = Array.isArray(usersRaw) ? usersRaw : (usersRaw?.items || usersRaw?.data || [])
    return list.map(u => ({
      value:     u.userId ?? u.id,
      label:     u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      sub:       [u.jobTitle, u.email].filter(Boolean).join(' · '),
      jobTitle:  (u.jobTitle || '').trim(),
      roleNames: (u.roles || []).map(r => r.roleName || r.name).filter(Boolean),
    }))
  }, [usersRaw])
  const userById = (id) => users.find(u => String(u.value) === String(id))

  // People whose job title or system role fits the role title, shown first.
  const suggestedFor = (title) => !norm(title) ? [] : users
    .filter(u => titleMatches(title, u.jobTitle) || u.roleNames.some(r => titleMatches(title, systemRoleWords(r))))
    .map(u => String(u.value))
  const itemsFor = (ids) => {
    const set = new Set(ids)
    return users.map(u => set.has(String(u.value)) ? { ...u, sub: ['Suggested', u.sub].filter(Boolean).join(' · ') } : u)
  }

  const assign = useMutation({
    mutationFn: (body) => rolesApi.assign(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policy-roles'] })
      qc.invalidateQueries({ queryKey: ['ai-org-profile-completeness'] })
      qc.invalidateQueries({ queryKey: ['policy-role-users'] })
      toast.success('Role holder saved — policies show the new name from now on')
      setNewTitle(''); setNewUser(''); setEditing(null); setEditUser('')
      setNewJt(JT_DEFAULT); setEditJt(JT_DEFAULT)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not save the role'),
  })
  const vacate = useMutation({
    mutationFn: (key) => rolesApi.vacate(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policy-roles'] })
      qc.invalidateQueries({ queryKey: ['ai-org-profile-completeness'] })
      toast.success('Role left vacant — the previous holder stays in the history')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not update the role'),
  })

  // Suggestions: the job titles your people already have first, then common
  // roles. A title only one person holds fills in that person as well.
  const chips = useMemo(() => {
    const taken = (t) => current.some(r => norm(r.roleTitle) === norm(t))
    const byTitle = new Map()
    users.forEach(u => {
      if (!u.jobTitle) return
      const k = norm(u.jobTitle)
      if (!byTitle.has(k)) byTitle.set(k, { title: u.jobTitle, users: [] })
      byTitle.get(k).users.push(u)
    })
    const fromPeople = [...byTitle.values()].filter(c => !taken(c.title))
    const common = SUGGESTED_ROLES.filter(t => !taken(t) && !byTitle.has(norm(t))).map(t => ({ title: t, users: [] }))
    return [...fromPeople, ...common].slice(0, 12)
  }, [users, current])
  const pickChip = (c) => {
    setNewTitle(c.title)
    const ids = c.users.length ? c.users.map(u => String(u.value)) : suggestedFor(c.title)
    if (ids.length === 1) pickNewUser(ids[0])
  }
  const newIds  = suggestedFor(newTitle)
  const editRow = current.find(r => r.roleKey === editing)
  const editIds = editRow ? suggestedFor(editRow.roleTitle) : []

  // Profiles saved before the register existed hold the security owner as free
  // text. Pre-fill the add row from it once, so moving it across is one click.
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    if (prefilled || isLoading || usersLoading || current.length > 0) return
    const title = (form.securityOwnerTitle || '').trim()
    if (!title) return
    const name = (form.securityOwnerName || '').trim().toLowerCase()
    const match = name ? users.find(u => String(u.label).toLowerCase() === name) : null
    setNewTitle(title)
    if (match) setNewUser(String(match.value))
    setPrefilled(true)
  }, [prefilled, isLoading, usersLoading, current.length, form.securityOwnerTitle, form.securityOwnerName, users])

  // Which role owns information security. Stored as the role's title; the
  // holder's name follows the register (set here and again by the backend).
  const ownerTitle = form.securityOwnerTitle || ''
  const ownerInRegister = current.some(r => r.roleTitle.toLowerCase() === ownerTitle.toLowerCase())
  const ownerOptions = [
    ...current.map(r => ({ value: r.roleTitle, label: `${r.roleTitle} — ${r.userName || 'vacant'}` })),
    ...(ownerTitle && !ownerInRegister ? [{ value: ownerTitle, label: `${ownerTitle} (not in the register yet)` }] : []),
  ]
  const onOwnerChange = (e) => {
    const title = e.target.value
    const holder = current.find(r => r.roleTitle.toLowerCase() === title.toLowerCase())
    setForm(f => ({ ...f, securityOwnerTitle: title, securityOwnerName: holder?.userName || '' }))
  }
  const privacyRole = current.find(r => isPrivacyRole(r.roleTitle))

  return (
    // relative + z-10: every glass card is its own stacking context, so without
    // this the next card paints over the open "Held by" list.
    <Card className="relative z-10">
      <CardHeader
        title={<span className="flex items-center gap-2"><UserCheck size={14} className="text-text-muted" />Roles and contacts</span>}
        subtitle="Policies name the role; the current holder's name is filled in when the policy is read"
      />
      <CardBody>
        {isLoading ? (
          <div className="py-6 flex justify-center text-text-muted"><Loader2 size={16} className="animate-spin" /></div>
        ) : (
          <div className="flex flex-col gap-3">
            {current.length === 0 && (
              <p className="text-xs text-text-muted">
                No roles yet. Add the people accountable in your policies — a security owner at least.
              </p>
            )}

            {current.length > 0 && (
              <div className="divide-y divide-border rounded-ctl border border-border">
                {current.map(r => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-medium text-text-primary">{r.roleTitle}</p>
                      <p className="text-[11px] text-text-muted font-mono">{r.variable}</p>
                    </div>
                    {editing === r.roleKey ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <PickerCombobox items={itemsFor(editIds)} pinned={editIds} loading={usersLoading} value={editUser}
                          onChange={pickEditUser} placeholder="Choose the new holder…" defaultSort="az" />
                        <Button size="sm" disabled={!editUser || assign.isPending} loading={assign.isPending}
                          onClick={() => assign.mutate({ roleTitle: r.roleTitle, userId: Number(editUser),
                            jobTitle: jobTitleFor(userById(editUser), editJt, r.roleTitle) })}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(null); pickEditUser('') }}>Cancel</Button>
                        <JobTitleOffer user={userById(editUser)} roleTitle={r.roleTitle} value={editJt} onChange={setEditJt} />
                      </div>
                    ) : (
                      <>
                        <div className="min-w-[180px] flex-1">
                          <p className="text-sm text-text-primary">{r.userName || '—'}</p>
                          <p className="text-[11px] text-text-muted">since {fmtDate(r.effectiveFrom)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(r.roleKey); pickEditUser('') }}>
                            Change holder
                          </Button>
                          <Button size="sm" variant="ghost" icon={UserMinus} disabled={vacate.isPending}
                            onClick={() => vacate.mutate(r.roleKey)}>
                            Vacate
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add a role */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <Input label="Role title, as it should appear in policies" value={newTitle}
                     onChange={e => setNewTitle(e.target.value)} placeholder="Engineering Lead" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Held by</span>
                <PickerCombobox items={itemsFor(newIds)} pinned={newIds} loading={usersLoading} value={newUser}
                  onChange={pickNewUser} placeholder="Choose a person…" defaultSort="az" />
              </div>
              <Button size="sm" icon={Plus} disabled={!newTitle.trim() || !newUser || assign.isPending}
                onClick={() => assign.mutate({ roleTitle: newTitle.trim(), userId: Number(newUser),
                  jobTitle: jobTitleFor(userById(newUser), newJt, newTitle.trim()) })}>
                Add role
              </Button>
              <JobTitleOffer user={userById(newUser)} roleTitle={newTitle.trim()} value={newJt} onChange={setNewJt} />
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-text-muted">Suggestions:</span>
                {chips.map(c => (
                  <button key={c.title} type="button" onClick={() => pickChip(c)}
                    title={c.users.length ? `Job title of ${c.users.map(u => u.label).join(', ')}` : 'Common role'}
                    className="text-[11px] px-2 py-0.5 rounded-ctl border border-border text-text-secondary hover:text-brand-ink hover:border-brand-500/40">
                    {c.users.length === 1 ? `${c.title} · ${c.users[0].label}` : c.title}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-border-subtle">
              <div className="flex flex-col gap-1">
                <Select label="Owns information security" options={ownerOptions}
                        placeholder={current.length ? 'Choose a role…' : 'Add a role above first'}
                        value={ownerTitle} onChange={onOwnerChange} disabled={!ownerOptions.length} />
                <p className="text-[11px] text-text-muted">
                  The role policies treat as the security owner{privacyRole
                    ? `. Privacy officer: ${privacyRole.roleTitle} — ${privacyRole.userName || 'vacant'}`
                    : '. Add a role with "Privacy" in its title to name a privacy officer.'}
                </p>
              </div>
              <div />
              <Input label="Security contact" type="email"
                     value={form.securityContactEmail} onChange={e => setForm(f => ({ ...f, securityContactEmail: e.target.value }))}
                     placeholder="security@kashiguard.com" />
              <Input label="Incident reporting address" type="email"
                     value={form.incidentContactEmail} onChange={e => setForm(f => ({ ...f, incidentContactEmail: e.target.value }))}
                     placeholder="incident@kashiguard.com" />
            </div>

            {past.length > 0 && (
              <div>
                <button type="button" onClick={() => setHistory(h => !h)}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-brand-ink">
                  <History size={12} /> {showHistory ? 'Hide' : 'Show'} previous holders ({past.length})
                </button>
                {showHistory && (
                  <div className="mt-2 divide-y divide-border/60 rounded-ctl border border-border">
                    {past.map(r => (
                      <div key={r.id} className="flex flex-wrap gap-x-4 px-3 py-2 text-xs">
                        <span className="min-w-[180px] font-medium text-text-primary">{r.roleTitle}</span>
                        <span className="min-w-[160px] text-text-secondary">{r.userName || '—'}</span>
                        <span className="text-text-muted">{fmtDate(r.effectiveFrom)} – {fmtDate(r.effectiveTo)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function AiProfileTab() {
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
    // Holder names are derived from the policy role register (the backend
    // re-derives them on every save), so they never make the form dirty.
    return Object.keys(EMPTY).filter(k => k !== 'securityOwnerName' && k !== 'privacyOfficerName').some(k => {
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
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 max-w-5xl">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">AI organisation profile</p>
          <p className="text-xs text-text-secondary mt-0.5">
            The facts every generated policy, questionnaire answer and article is written from
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw size={13} className={cn(isLoading && 'animate-spin')} />
            Reload
          </Button>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty || saving}>
            <Save size={13} />
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        </div>
      </div>
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

          <PolicyRolesSection form={form} setForm={setForm} />

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
                        helperText="One fact per line — anything true of your organisation that the fields above cannot express. The model states these as facts, so write only what you can evidence." />
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
    </div>
  )
}

export default AiProfileTab