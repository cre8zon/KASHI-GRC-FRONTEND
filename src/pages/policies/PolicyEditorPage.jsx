/**
 * PolicyEditorPage — /audit/policies/:id/edit
 *
 * Full WYSIWYG document editor for AuditPolicy.contentBody.
 * Rendered when contentType === 'RICH_TEXT'.
 * PDF_UPLOAD and EXTERNAL_URL policies use a lighter form — not this page.
 *
 * EDITOR STACK:
 *   TipTap (ProseMirror-based). Extensions: StarterKit (with link config),
 *   Placeholder, TextAlign, Highlight, Table (+Row/Cell/Header).
 *   Link is configured via StarterKit.link — NOT as a separate extension
 *   (separate extension causes duplicate 'link' warning in TipTap v3).
 *
 * FEATURES:
 *   - Full toolbar: headings H1/H2/H3, bold, italic, underline, strike,
 *     highlight, bullet/ordered lists, blockquote, code block, hr, tables,
 *     link insert/unlink, text alignment (L/C/R), undo/redo
 *   - Bubble menu on text selection: bold, italic, underline, link
 *   - Link insert popover with apply/remove in toolbar
 *   - Auto-save every 30 s
 *   - Version history panel — derived from policy object (no /versions endpoint yet)
 *   - Save draft button (manual)
 *   - Word count, last-saved timestamp in footer
 *   - Read-only mode when policy is APPROVED or DEPRECATED
 *   - AI: rewrite selection (bubble menu), draft whole policy (empty DRAFT
 *     only), suggested control mappings (side panel)
 *
 * LIFECYCLE ACTIONS (approve, send-for-review, new-version, deprecate) are NOT here.
 * They live in ui_actions rows (screen_key = audit_policy_detail) and execute
 * through the EntityDrawer in UniversalModulePage.
 *
 * ROUTES:
 *   /audit/policies/:id/edit    — editor (ORGANIZATION, SYSTEM)
 *   /audit/policies/:id         — read-only detail (all allowed sides)
 *
 * BACKEND ENDPOINTS USED:
 *   GET /v1/audit/library/policies/:id  — load policy
 *   PUT /v1/audit/library/policies/:id  — save (title required by @NotBlank)
 *
 * AI ENDPOINTS — every one returns a SUGGESTION; none of them writes the policy:
 *   POST /v1/ai/policies/rewrite/stream   — bubble menu, SSE
 *   POST /v1/ai/policies/draft            — full draft
 *   POST /v1/ai/policies/suggest-mappings — control mappings
 *   POST /v1/ai/feedback                  — accept / reject / edit, on every one
 *
 * onAccept only puts HTML in the editor as an unsaved change. The existing
 * DRAFT -> UNDER_REVIEW -> APPROVED lifecycle is untouched, because that
 * approval chain is the audit evidence.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate }                    from 'react-router-dom'
import { useQuery, useMutation, useQueryClient }     from '@tanstack/react-query'
import {
  ArrowLeft, Save,
  Clock, History, ChevronDown, ChevronRight,
  Bold, Italic, Underline, List, ListOrdered,
  Heading1, Heading2, Heading3, Quote, Minus,
  Table, Undo, Redo, Eye, EyeOff, AlertTriangle,
  FileText, Loader2, Strikethrough, Highlighter,
  Link2, Link2Off, AlignLeft, AlignCenter, AlignRight,
  Code2, Sparkles, Braces, Wand2,
} from 'lucide-react'
import { useEditor, EditorContent }                  from '@tiptap/react'
import { BubbleMenu }                                 from '@tiptap/react/menus'
import StarterKit                                    from '@tiptap/starter-kit'
import Placeholder                                   from '@tiptap/extension-placeholder'
import TextAlign                                     from '@tiptap/extension-text-align'
import Highlight                                     from '@tiptap/extension-highlight'
import { Table as TableExtension, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button }     from '../../components/ui/Button'
import { Badge }      from '../../components/ui/Badge'
import { GlassSelect } from '../../components/ui/GlassSelect'
import { Breadcrumb, navTrailFor } from '../../components/detail/DetailChrome'
import { useNavigation } from '../../hooks/useUIConfig'
import { cn }         from '../../lib/cn'
import api            from '../../config/axios.config'
import toast          from 'react-hot-toast'
import AiBubbleAction from '../../components/ai/AiBubbleAction'
import AiDraftModal   from '../../components/ai/AiDraftModal'
import AiMappingPanel from '../../components/ai/AiMappingPanel'
import { aiApi }      from '../../api/ai.api'
import { Link }       from 'react-router-dom'
import PolicyRevisionsPanel, { revisionApi } from '../../components/policies/PolicyRevisionsPanel'

// ─── API helpers ──────────────────────────────────────────────────────────────

const policyApi = {
  get:    (id)    => api.get(`/v1/audit/library/policies/${id}`),
  update: (id, d) => api.put(`/v1/audit/library/policies/${id}`, d),
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  DRAFT:        { label: 'Draft',        color: 'amber'  },
  UNDER_REVIEW: { label: 'Under review', color: 'blue'   },
  APPROVED:     { label: 'Approved',     color: 'green'  },
  DEPRECATED:   { label: 'Deprecated',   color: 'red'    },
}

const EDITABLE_STATUSES = new Set(['DRAFT', 'UNDER_REVIEW'])

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolBtn({ icon: Icon, title, active, onClick, disabled }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded transition-colors',
        active
          ? 'bg-brand-500/20 text-brand-ink'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay',
        disabled && 'opacity-30 cursor-not-allowed',
      )}
    >
      <Icon size={13} />
    </button>
  )
}

function ToolSep() {
  return <div className="w-px h-5 bg-border mx-1 shrink-0" />
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PolicyEditorPage() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const autoSaveRef = useRef(null)

  const [historyOpen,   setHistoryOpen]   = useState(false)
  const [previewMode,   setPreviewMode]   = useState(false)
  const [lastSaved,     setLastSaved]     = useState(null)
  const [wordCount,     setWordCount]     = useState(0)
  const [isDirty,       setIsDirty]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [linkInput,     setLinkInput]     = useState('')
  const [linkMenuOpen,  setLinkMenuOpen]  = useState(false)

  // ── Variable picker ──────────────────────────────────────────────────────
  // Authors should never have to type mustache. The catalog is fetched, not
  // hardcoded: the same list drives the resolver and the generation prompt, and
  // a fourth copy here would drift — the editor would keep offering a variable
  // the resolver stopped handling, and the document ships with raw {{braces}}.
  //
  // The endpoint already returns a `syntax` field per variable saying exactly
  // what to insert, so this does not reimplement the brace rules.
  const [varMenuOpen, setVarMenuOpen] = useState(false)
  const { data: varCatalog } = useQuery({
    queryKey: ['policy-variable-catalog'],
    queryFn:  () => api.get('/v1/ai/admin/policy-variables').then(r => r?.data?.data ?? r?.data ?? r),
    staleTime: 30 * 60 * 1000,   // a deploy-time constant, not live data
  })

  // The list is the RESOLVER's keys, not the catalog's WORKFLOW subset.
  //
  // PolicyVariableCatalog.Source describes what the AI should EMIT — company_name
  // is TENANT because the model is told to write the literal. But a human authoring
  // a GLOBAL policy must write {{company_name}}, because the platform text is read
  // by every organisation and the resolver substitutes it per tenant at read time.
  //
  // Filtering on source === WORKFLOW therefore hid the single most important
  // variable, and on this deployment left the menu empty.
  //
  // PolicyVariableResolver substitutes these twelve. Kept here rather than derived
  // from the endpoint because the endpoint groups by a source that means something
  // else; if the resolver gains a key, add it here too.
  const RESOLVER_KEYS = [
    { key: 'company_name',    label: 'Company name',   example: 'Northwind Data Systems' },
    { key: 'policy_owner',    label: 'Policy owner',   example: 'Head of Security' },
    { key: 'approver_name',   label: 'Approver',       example: 'Meera Raghavan' },
    { key: 'approval_date',   label: 'Approval date',  example: '14 March 2026' },
    { key: 'effective_date',  label: 'Effective date', example: '1 April 2026' },
    { key: 'next_review_date',label: 'Next review date', example: '1 April 2027' },
    { key: 'review_cycle',    label: 'Review cycle',   example: 'Annual' },
    { key: 'policy_title',    label: 'Policy title',   example: 'Access Control Policy' },
    { key: 'policy_ref',      label: 'Policy reference', example: 'POL-02' },
    { key: 'policy_version',  label: 'Version',        example: '1.0' },
  ]

  // The tenant's policy roles ({{role_<key>}} -> current holder at read time).
  const { data: policyRolesRaw } = useQuery({
    queryKey: ['policy-roles'],
    queryFn:  () => api.get('/v1/ai/org-profile/roles').then(r => r?.data?.data ?? r?.data ?? r),
    staleTime: 5 * 60 * 1000,
  })

  // Catalog labels/examples when the endpoint answers; the static list otherwise,
  // so the picker still works if the AI admin endpoint is unavailable to this user.
  const insertableVars = useMemo(() => {
    const cats = varCatalog?.categories || {}
    const meta = {}
    Object.values(cats).forEach(list => (list || []).forEach(v => { meta[v.key] = v }))
    return [{
      category: 'Filled in automatically',
      vars: RESOLVER_KEYS.map(k => ({
        key:     k.key,
        label:   meta[k.key]?.label   || k.label,
        example: meta[k.key]?.example || k.example,
        syntax:  `{{${k.key}}}`,   // always mustache — this is the resolver's syntax
      })),
    }, {
      // Name a role's current holder without typing their name — it updates
      // when the role changes hands (Settings → AI profile → Policy roles).
      category: 'Policy roles',
      vars: (Array.isArray(policyRolesRaw) ? policyRolesRaw : [])
        .filter(r => r.current)
        .map(r => ({ key: `role_${r.roleKey}`, label: r.roleTitle, example: r.userName, syntax: r.variable })),
    }].filter(g => g.vars.length > 0)
  }, [varCatalog, policyRolesRaw])

  const insertVariable = (v) => {
    if (!editor) return
    editor.chain().focus().insertContent(v.syntax).run()
    setVarMenuOpen(false)
  }
  const [aiDraftOpen,   setAiDraftOpen]   = useState(false)
  const [aiPanelOpen,   setAiPanelOpen]   = useState(false)

  // ── Fetch policy ──────────────────────────────────────────────────────────
  const { data: policyRes, isLoading } = useQuery({
    queryKey: ['policy-editor', id],
    queryFn:  () => policyApi.get(id),
    enabled:  !!id,
  })
  const policy = policyRes?.data || policyRes
  // The API sends contentBody with {{variables}} already filled in, for
  // reading, and contentBodyRaw with them intact. The editor must only ever
  // hold the raw form: loading the filled-in text would show "POL-056" instead
  // of {{policy_ref}}, and the next save would write those values in for good,
  // so the reference line would stop following renumbering, versions and owner.
  const rawBody = policy?.contentBodyRaw ?? policy?.contentBody ?? ''

  // ── Where this page sits ──────────────────────────────────────────────────
  // The editor belongs to a policy record (/module/audit_policy/:id). Back and
  // the breadcrumb go there, not to whatever page happened to be open before
  // (navigate(-1) returned to Settings or Users after a detour).
  const { data: navItems = [] } = useNavigation()
  const policyListLabel = useMemo(() => {
    const find = (nodes) => {
      for (const n of nodes || []) {
        if (typeof n.route === 'string' && n.route.split('?')[0] === '/module/audit_policy') return n.label
        const hit = find(n.children)
        if (hit) return hit
      }
      return null
    }
    return find(navItems) || 'Policies'
  }, [navItems])
  const recordPath = `/module/audit_policy/${id}`
  const crumbs = [
    { label: 'Home', to: '/dashboard' },
    ...navTrailFor(navItems, { entityType: 'AUDIT_POLICY' }),
    { label: policyListLabel, to: '/module/audit_policy' },
    { label: policy?.policyRef || policy?.title || `Policy #${id}`, to: recordPath },
    { label: 'Content' },
  ]

  // ── Policy owner ──────────────────────────────────────────────────────────
  // The owner should be an accountable ROLE from the policy role register: a
  // team cannot approve an exception, and a personal name goes stale. When the
  // owner names a role, {{policy_owner}} reads "Role (Current holder)" and
  // follows the register. Older free-text owners ("Engineering") still show
  // as written until someone picks a role.
  const ownerRoles = useMemo(() => (Array.isArray(policyRolesRaw) ? policyRolesRaw : [])
    .filter(r => r.current)
    .map(r => ({ title: r.roleTitle, holder: r.userName })), [policyRolesRaw])
  const ownerRole = ownerRoles.find(r =>
    r.title.trim().toLowerCase() === (policy?.ownerTeam || '').trim().toLowerCase())
  const ownerMut = useMutation({
    mutationFn: (ownerTeam) => policyApi.update(id, { title: policy?.title, ownerTeam }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policy-editor', id] })
      toast.success('Owner updated — policies show the role and its current holder')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not change the owner'),
  })

  // No dedicated /versions endpoint yet — derive from the policy itself.
  // Shows the current approved version; expand to a real endpoint when available.
  const versions = policy ? [{ id: policy.id, version: policy.version, approvedAt: policy.approvedAt, previousVersionId: policy.previousVersionId }] : []

  const isReadOnly = policy && !EDITABLE_STATUSES.has(policy.status)

  // ── AI context ─────────────────────────────────────────────────────────
  // frameworkRefs and controlTags are delimited strings on the entity, so
  // they are split once here rather than inside each AI component.
  const aiFrameworks = (policy?.frameworkRefs || '')
    .split(',').map(v => v.trim()).filter(Boolean)

  const aiControlCodes = (policy?.commonControlCodes || policy?.controlTags || '')
    .split(/[,\s]+/).map(v => v.trim()).filter(Boolean)

  // "Draft content" on an empty DRAFT; "Regenerate" on a DRAFT that has text.
  // Regenerating used to be withheld because it would overwrite someone's work
  // with one click. It no longer can: the current body is snapshotted as a
  // revision (BEFORE_AI) before the AI draft goes in, the modal shows a
  // comparison before anything is accepted, and History can restore it.
  const isDraft      = policy?.status === 'DRAFT'
  const isEmptyDraft = isDraft
    && !rawBody.replace(/<[^>]+>/g, '').trim()

  // How much the AI knows about this organisation. Shared query key with the
  // Settings → AI profile tab, so saving the profile refreshes this too.
  // Only fetched once the AI panel is open — non-AI users are never nagged.
  const { data: aiProfile } = useQuery({
    queryKey: ['ai-org-profile-completeness'],
    queryFn:  () => aiApi.completeness(),
    enabled:  aiPanelOpen,
    staleTime: 60 * 1000,
  })
  const aiProfileScore = typeof aiProfile?.score === 'number' ? aiProfile.score : null

  // ── TipTap editor ──────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { languageClassPrefix: 'language-' },
        link: { openOnClick: false, HTMLAttributes: { class: 'policy-link' } },
      }),
      Placeholder.configure({ placeholder: 'Start writing your policy…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      TableExtension.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content:   rawBody,
    editable:  !isReadOnly,
    onUpdate:  ({ editor: e }) => {
      setIsDirty(true)
      const text = e.getText()
      setWordCount(text.trim().split(/\s+/).filter(Boolean).length)
    },
  })

  // Sync editable flag when policy status changes
  useEffect(() => {
    if (editor) editor.setEditable(!isReadOnly)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadOnly])

  // Load content once policy arrives (editor may mount before data)
  useEffect(() => {
    if (editor && rawBody && !editor.getText()) {
      // emitUpdate false: loading is not an edit. Emitting it marked the page
      // dirty on open ("Unsaved changes"), so autosave rewrote the body 30 s
      // later even though nobody had typed.
      editor.commands.setContent(rawBody, { emitUpdate: false })
      // No update event, so count here — otherwise the footer reads 0 words.
      setWordCount(editor.getText().trim().split(/\s+/).filter(Boolean).length)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy?.id])

  // ── Auto-save every 30s ─────────────────────────────────────────────────────
  const doSave = useCallback(async (silent = false) => {
    if (!editor || isReadOnly) return
    // Guard re-entry. Without it the 30s autosave can fire mid-manual-save and
    // two PUTs race for the same document, last-write-wins on a body that may be
    // a keystroke behind.
    if (saving) return
    const contentBody = editor.getHTML()
    setSaving(true)
    try {
      await policyApi.update(id, { title: policy.title, contentBody })
      // Awaited: the button stays in its saving state until the refetch lands,
      // rather than releasing the moment the PUT returns.
      await qc.invalidateQueries({ queryKey: ['policy-editor', id] })
      setLastSaved(new Date())
      setIsDirty(false)
      // A manual save keeps a revision; autosave does not (one every 30 s is
      // noise, not history). Identical text is deduplicated server side.
      if (!silent) {
        revisionApi.snapshot(id, { source: 'MANUAL', contentBody })
          .then(() => qc.invalidateQueries({ queryKey: ['policy-revisions', id] }))
          .catch(() => {})
      }
      if (!silent) toast.success('Saved')
    } catch (e) {
      if (!silent) toast.error(e?.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [editor, id, isReadOnly, qc, saving, policy?.title])

  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (isDirty) doSave(true)
    }, 30_000)
    return () => clearInterval(autoSaveRef.current)
  }, [isDirty, doSave])

  // ── Link helper ─────────────────────────────────────────────────────────────────
  const applyLink = () => {
    if (!editor) return
    const url = linkInput.trim()
    if (!url) { editor.chain().focus().unsetLink().run(); setLinkMenuOpen(false); return }
    editor.chain().focus().setLink({ href: url.startsWith('http') ? url : `https://${url}` }).run()
    setLinkMenuOpen(false)
    setLinkInput('')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle size={24} className="text-text-muted" />
        <p className="text-sm text-text-muted">Policy not found</p>
      </div>
    )
  }

  const statusCfg = STATUS_CFG[policy.status] || STATUS_CFG.DRAFT

  return (
    <PageLayout
      title={
        <div className="flex flex-col gap-1 min-w-0">
        <Breadcrumb items={crumbs} />
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate(recordPath)}
            aria-label="Back to the policy"
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={15} />
          </button>
          <FileText size={14} className="text-brand-ink" />
          <span className="text-sm font-semibold text-text-primary truncate max-w-[400px]">
            {policy.title || 'Untitled policy'}
          </span>
          <Badge variant={statusCfg.color} size="xs">{statusCfg.label}</Badge>
          {policy.version && (
            <span className="text-[10px] text-text-muted font-mono">v{policy.version}</span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-text-muted"
                title="The accountable owner. Pick a policy role: wherever {{policy_owner}} appears it reads as the role and its current holder.">
            Owner
            <GlassSelect
              value={ownerRole ? ownerRole.title : ''}
              disabled={isReadOnly || ownerMut.isPending || ownerRoles.length === 0}
              onChange={e => { if (e.target.value) ownerMut.mutate(e.target.value) }}
              listMinWidth={440}
              className="h-7 w-[380px] max-w-[40vw] text-xs"
            >
              {!ownerRole && (
                <option value="">
                  {ownerRoles.length === 0
                    ? 'Add policy roles in Settings → AI profile'
                    : policy.ownerTeam ? `${policy.ownerTeam} (not a policy role)` : 'Choose a role…'}
                </option>
              )}
              {ownerRoles.map(r => (
                <option key={r.title} value={r.title}>{r.title}{r.holder ? ` — ${r.holder}` : ' — vacant'}</option>
              ))}
            </GlassSelect>
          </span>
          {isDirty && (
            <span className="text-[10px] text-status-warn-fg italic">Unsaved changes</span>
          )}
        </div>
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-ctl text-xs transition-colors',
              historyOpen
                ? 'bg-brand-500/10 text-brand-ink border border-brand-500/30'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay border border-transparent',
            )}
          >
            <History size={12} /> History
          </button>
          <button
            onClick={() => setPreviewMode(o => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-ctl text-xs
                       text-text-muted hover:text-text-secondary hover:bg-surface-overlay
                       border border-transparent transition-colors"
          >
            {previewMode ? <EyeOff size={12} /> : <Eye size={12} />}
            {previewMode ? 'Edit' : 'Preview'}
          </button>

          {/* AI: suggested control mappings. The panel explains itself before
              it runs, so it is available on any saved policy. */}
          {policy?.id && (
            <button
              onClick={() => setAiPanelOpen(o => !o)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-ctl text-xs transition-colors',
                aiPanelOpen
                  ? 'bg-brand-500/10 text-brand-ink border border-brand-500/30'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay border border-transparent',
              )}
            >
              <Sparkles size={12} /> AI
            </button>
          )}

          {/* AI: generate the BODY. Empty DRAFT only — see isEmptyDraft.
              Metadata is not asked for here: the policy already has a title,
              owner team, frameworks and cadence, chosen when it was created.
              Creating a policy FROM scratch with AI is AiPolicyCreatePage. */}
          {/* One AI entry point. An empty draft gets a direct "Draft with AI"
              button, because writing the first draft is THE obvious next step;
              once there is text, regenerating lives in the AI panel beside the
              other AI actions rather than as a second competing button. */}
          {!isReadOnly && isEmptyDraft && (
            <Button
              size="sm" variant="secondary" icon={Sparkles}
              onClick={() => setAiDraftOpen(true)}
            >
              Draft with AI
            </Button>
          )}

          {!isReadOnly && (
            <Button
              size="sm" variant="secondary" icon={Save}
              loading={saving} loadingText="Saving…"
              // Disabled when there is nothing to save. The button previously
              // looked identical before and after a save, so the only signal that
              // anything happened was a toast that disappears — and clicking again
              // sent an identical PUT.
              disabled={!isDirty && !saving}
              onClick={() => doSave(false)}
            >
              {isDirty || saving ? 'Save draft' : 'Saved'}
            </Button>
          )}
        </div>
      }
    >
      {/* h-full, not flex-1.

          PageLayout puts its children inside <div className="flex-1
          overflow-y-auto">, which is a BLOCK. flex-1 on a child of a block does
          nothing, so this row had auto height, grew to fit the document, and
          PageLayout scrolled the whole thing — toolbar and side rails included.
          That is why the rail scrolled away with the content.

          h-full pins the row to the scroller's own height, so nothing overflows
          it and each column scrolls internally instead. */}
      <div className="flex h-full min-h-0 overflow-hidden">

        {/* ── Editor area ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* Toolbar */}
          {!previewMode && !isReadOnly && (
            <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border
                            bg-surface-overlay flex-wrap shrink-0">
              <ToolBtn icon={Undo}          title="Undo"            onClick={() => editor?.chain().focus().undo().run()} />
              <ToolBtn icon={Redo}          title="Redo"            onClick={() => editor?.chain().focus().redo().run()} />
              <ToolSep />
              <ToolBtn icon={Heading1}      title="Heading 1"       active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
              <ToolBtn icon={Heading2}      title="Heading 2"       active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
              <ToolBtn icon={Heading3}      title="Heading 3"       active={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
              <ToolSep />
              <ToolBtn icon={Bold}          title="Bold"            active={editor?.isActive('bold')}       onClick={() => editor?.chain().focus().toggleBold().run()} />
              <ToolBtn icon={Italic}        title="Italic"          active={editor?.isActive('italic')}     onClick={() => editor?.chain().focus().toggleItalic().run()} />
              <ToolBtn icon={Underline}     title="Underline"       active={editor?.isActive('underline')}  onClick={() => editor?.chain().focus().toggleUnderline().run()} />
              <ToolBtn icon={Strikethrough} title="Strikethrough"   active={editor?.isActive('strike')}     onClick={() => editor?.chain().focus().toggleStrike().run()} />
              <ToolBtn icon={Highlighter}   title="Highlight"       active={editor?.isActive('highlight')}  onClick={() => editor?.chain().focus().toggleHighlight().run()} />
              <ToolSep />
              <ToolBtn icon={List}          title="Bullet list"     active={editor?.isActive('bulletList')}  onClick={() => editor?.chain().focus().toggleBulletList().run()} />
              <ToolBtn icon={ListOrdered}   title="Numbered list"   active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
              <ToolBtn icon={Quote}         title="Blockquote"      active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
              <ToolBtn icon={Code2}         title="Code block"      active={editor?.isActive('codeBlock')}  onClick={() => editor?.chain().focus().toggleCodeBlock().run()} />
              <ToolSep />
              <ToolBtn icon={AlignLeft}     title="Align left"      active={editor?.isActive({ textAlign: 'left' })}   onClick={() => editor?.chain().focus().setTextAlign('left').run()} />
              <ToolBtn icon={AlignCenter}   title="Align center"    active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} />
              <ToolBtn icon={AlignRight}    title="Align right"     active={editor?.isActive({ textAlign: 'right' })}  onClick={() => editor?.chain().focus().setTextAlign('right').run()} />
              <ToolSep />
              <ToolBtn icon={Table}         title="Insert table"    onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
              <ToolBtn icon={Minus}         title="Horizontal rule" onClick={() => editor?.chain().focus().setHorizontalRule().run()} />
              <ToolSep />
              {/* Insert variable — placed before Link because it is the one
                  authors are most likely to need and least likely to know exists. */}
              <div className="relative">
                <ToolBtn icon={Braces} title="Insert variable"
                  active={varMenuOpen}
                  onClick={() => setVarMenuOpen(o => !o)} />
              </div>
              <ToolSep />
              {/* Link insert */}
              <div className="relative">
                <ToolBtn icon={Link2}        title="Insert link"     active={editor?.isActive('link') || linkMenuOpen} onClick={() => { setLinkInput(editor?.getAttributes('link').href || ''); setLinkMenuOpen(o => !o) }} />
                {linkMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 flex items-center gap-1 p-1.5
                                  bg-surface border border-border rounded-card shadow-lg">
                    <input
                      autoFocus
                      value={linkInput}
                      onChange={e => setLinkInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setLinkMenuOpen(false) }}
                      placeholder="https://"
                      className="w-48 px-2 py-1 text-xs glass-field border border-border rounded outline-none
                                 text-text-primary placeholder:text-text-muted focus:border-brand-500/50"
                    />
                    <button onClick={applyLink} className="px-2 py-1 text-[10px] bg-brand-500/10 text-brand-ink border border-brand-500/20 rounded hover:bg-brand-500/20">Apply</button>
                    {editor?.isActive('link') && (
                      <ToolBtn icon={Link2Off} title="Remove link" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkMenuOpen(false) }} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Read-only banner */}
          {isReadOnly && (
            <div className="flex items-center gap-2 px-4 py-2 bg-status-warn-bg border-b border-status-warn-bd
                            text-xs text-status-warn-fg shrink-0">
              <AlertTriangle size={12} />
              This policy is {policy.status?.toLowerCase()} — editing is disabled.
            </div>
          )}

          {/* Bubble menu — appears on text selection */}
          {editor && !isReadOnly && (
            <BubbleMenu editor={editor} options={{ placement: 'top', offset: 6 }}
              className="flex items-center gap-0.5 p-1 bg-surface border border-border rounded-card shadow-lg">
              <ToolBtn icon={Bold}      title="Bold"      active={editor.isActive('bold')}      onClick={() => editor.chain().focus().toggleBold().run()} />
              <ToolBtn icon={Italic}    title="Italic"    active={editor.isActive('italic')}    onClick={() => editor.chain().focus().toggleItalic().run()} />
              <ToolBtn icon={Underline} title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
              <ToolSep />
              <ToolBtn icon={Link2}     title="Link"      active={editor.isActive('link')}      onClick={() => { setLinkInput(editor.getAttributes('link').href || ''); setLinkMenuOpen(o => !o) }} />
              <ToolSep />
              {/* Streams the rewrite into a preview and replaces the selection
                  only on Apply. Disables itself under 15 selected characters —
                  rewriting three words produces three different words. */}
              <AiBubbleAction editor={editor} policyId={policy?.id} disabled={isReadOnly} />
            </BubbleMenu>
          )}

          {/* Editor canvas */}
          <div className="flex-1 overflow-y-auto">
            {previewMode ? (
              /* Preview mode — rendered HTML */
              <div
                className="max-w-3xl mx-auto px-8 py-10 policy-content"
                // Saved text is shown as readers will see it, variables filled
                // in by the server. Unsaved edits can only be shown raw.
                dangerouslySetInnerHTML={{ __html: (!isDirty && policy.contentBody) || editor?.getHTML() || '' }}
              />
            ) : (
              <EditorContent
                editor={editor}
                className={cn(
                  'max-w-3xl mx-auto px-8 py-10 min-h-[600px]',
                  'text-sm text-text-primary leading-relaxed policy-content',
                  isReadOnly && 'cursor-default',
                )}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-2 border-t border-border
                          bg-surface-overlay text-[10px] text-text-muted shrink-0">
            <span>{wordCount.toLocaleString()} words</span>
            <span>
              {lastSaved
                ? `Last saved ${lastSaved.toLocaleTimeString()}`
                : policy.updatedAt
                  ? `Last saved ${new Date(policy.updatedAt).toLocaleString()}`
                  : 'Not saved yet'}
            </span>
            <span>{policy.policyRef || policy.id}</span>
          </div>
        </div>

        {/* ── Variable rail ──

            Sibling of the editor area, not a child of the scrolling canvas — the
            same place the history and AI panels live. Nested inside the canvas it
            scrolled away with the document, which defeats the point: variables are
            consulted WHILE writing, so the list has to stay put.

            min-h-0 on the parent row is what lets this scroll independently rather
            than stretching the page. */}
        {varMenuOpen && !isReadOnly && (
          <div className="w-72 shrink-0 border-l border-border flex flex-col">
            <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
              <p className="text-xs font-semibold text-text-secondary">Insert variable</p>
              <button onClick={() => setVarMenuOpen(false)}
                className="text-text-muted hover:text-text-primary text-xs leading-none p-1"
                title="Close">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-[10px] text-text-muted leading-snug mb-3">
                Filled in automatically when the policy is read. Use these instead of
                typing a company or person name — a platform policy is read by every
                organisation, and a name typed here appears in all of them.
              </p>
              {insertableVars.map(group => (
                <div key={group.category} className="mb-3">
                  {insertableVars.length > 1 && (
                    <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                      {group.category}
                    </p>
                  )}
                  {group.vars.map(v => (
                    <button key={v.key} onClick={() => insertVariable(v)}
                      className="w-full text-left px-2 py-2 rounded hover:bg-surface-overlay
                                 border border-transparent hover:border-border mb-0.5">
                      <span className="block text-xs text-text-primary">{v.label}</span>
                      <span className="block text-[10px] font-mono text-text-muted">{v.syntax}</span>
                      {v.example && (
                        <span className="block text-[10px] text-text-muted mt-0.5">e.g. {v.example}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI panel ── */}
        {aiPanelOpen && policy?.id && (
          <div className="w-80 shrink-0 border-l border-border flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
              <p className="text-xs font-semibold text-text-secondary">AI assistance</p>
              <button onClick={() => setAiPanelOpen(false)}
                className="text-text-muted hover:text-text-secondary text-xs">Close</button>
            </div>
            <div className="p-3 space-y-3">
              {/* Profile status: the reason a draft says [[ORGANISATION NAME]]. */}
              {aiProfileScore != null && aiProfileScore < 80 && (
                <div className={cn('flex gap-2 rounded-ctl border p-2.5',
                  aiProfileScore < 50 ? 'border-status-warn-bd bg-status-warn-bg' : 'border-status-info-bd bg-status-info-bg')}>
                  <AlertTriangle size={13} className={cn('mt-0.5 shrink-0',
                    aiProfileScore < 50 ? 'text-status-warn-fg' : 'text-status-info-fg')} />
                  <div className={cn('text-[11px] leading-snug',
                    aiProfileScore < 50 ? 'text-status-warn-fg' : 'text-status-info-fg')}>
                    AI organisation profile {aiProfileScore}% complete — drafts use
                    placeholders for anything it doesn't know.
                    <Link to="/settings?tab=ai-profile" className="ml-1 font-medium underline">
                      Complete it
                    </Link>
                  </div>
                </div>
              )}

              {/* Policy content: draft or regenerate the body. */}
              {!isReadOnly && isDraft && (
                <div className="rounded-ctl border border-border bg-surface p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                    <Wand2 size={12} className="text-brand-ink" />
                    {isEmptyDraft ? 'Draft the content' : 'Regenerate the content'}
                  </div>
                  <p className="mt-1 text-[11px] text-text-muted leading-snug">
                    {isEmptyDraft
                      ? 'Writes a first draft from this policy’s title and linked controls.'
                      : 'Writes a fresh draft. You compare it with the current text before replacing anything, and the current text is kept in History.'}
                  </p>
                  <Button size="sm" variant="secondary" icon={Sparkles} className="mt-2"
                    onClick={() => setAiDraftOpen(true)}>
                    {isEmptyDraft ? 'Draft with AI' : 'Regenerate…'}
                  </Button>
                </div>
              )}

              {/* onAccept calls the existing link-control endpoint. The AI never
                  writes the mapping itself — a mapping is a compliance assertion
                  and a human accepts each one individually. */}
              <AiMappingPanel
                policyId={policy.id}
                frameworks={aiFrameworks}
                existingCodes={aiControlCodes}
                onAccept={async (code) => {
                  // Accepting a suggestion links it — the person has just
                  // confirmed this one mapping.
                  try {
                    const lr = await api.post(`/v1/audit/library/policies/${id}/controls/link-common`, {
                      codes: [code], frameworks: aiFrameworks,
                    })
                    const res = lr?.data?.data ?? lr?.data ?? lr
                    const n = (res?.linked || []).filter(l => !l.alreadyLinked).length
                    if (n) toast.success(`${code} linked (${n} library control${n === 1 ? '' : 's'})`)
                    else if (res?.linked?.length) toast(`${code} was already linked`)
                    else toast(`${code} has no library control yet — nothing to link`)
                    qc.invalidateQueries({ queryKey: ['policy-editor', id] })
                  } catch (e) {
                    toast.error(e?.response?.data?.message || `Could not link ${code}`)
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* ── Version history panel ── */}
        {historyOpen && (
          <div className="w-80 shrink-0 border-l border-border flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-xs font-semibold text-text-secondary">Version history</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {versions.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-text-muted">No versions yet</p>
                  <p className="text-[10px] text-text-muted mt-1 opacity-60">
                    Versions are created on each approval
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {versions.map((v, i) => (
                    <div key={v.id || i}
                      className="px-4 py-3 hover:bg-surface-overlay transition-colors cursor-pointer">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-text-primary font-mono">
                          v{v.version}
                        </span>
                        {i === 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/10
                                           border border-brand-500/20 text-brand-ink font-medium">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted">
                        {v.approvedAt
                          ? new Date(v.approvedAt).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })
                          : 'Draft'}
                      </p>
                      {v.previousVersionId && (
                        <p className="text-[10px] text-text-muted mt-0.5">
                          Previous: v{v.previousVersionId}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Draft revisions within this version: compare and restore. */}
            <div className="border-t border-border">
              <PolicyRevisionsPanel
                policyId={policy.id}
                currentHtml={editor?.getHTML() || ''}
                canRestore={!isReadOnly}
                onRestored={(html) => {
                  editor?.commands.setContent(html || '')
                  const text = editor?.getText() || ''
                  setWordCount(text.trim().split(/\s+/).filter(Boolean).length)
                  setIsDirty(false)
                  qc.invalidateQueries({ queryKey: ['policy-editor', id] })
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* AI content modal. Generates the BODY for this policy, grounded in its
          own saved metadata — no title field, because the policy has one.
          onAccept sets editor content and marks the page dirty; the normal
          autosave and Save draft path then applies, unchanged. */}
      {policy?.id && (
        <AiDraftModal
          open={aiDraftOpen}
          onClose={() => setAiDraftOpen(false)}
          policyId={policy.id}
          policyTitle={policy.title}
          controlCodes={aiControlCodes}
          frameworks={aiFrameworks}
          currentHtml={aiDraftOpen ? (editor?.getHTML() || '') : ''}
          onAccept={async (html, result) => {
            // 1. Keep what is in the editor now — including unsaved typing — as
            //    a revision, so replacing it can always be undone.
            const before = editor?.getHTML() || ''
            const hadText = !!before.replace(/<[^>]+>/g, '').trim()
            let kept = null
            if (hadText) {
              try {
                kept = await revisionApi.snapshot(id, { source: 'BEFORE_AI', contentBody: before })
                kept = kept?.data?.data ?? kept?.data ?? kept
              } catch (e) {
                // Without the snapshot the old text would be unrecoverable — stop.
                toast.error(e?.response?.data?.message || 'Could not keep the current draft, so nothing was replaced')
                return
              }
            }

            // 2. Put the AI draft in and save it, so it is a revision too.
            editor?.commands.setContent(html)
            const text = editor?.getText() || ''
            setWordCount(text.trim().split(/\s+/).filter(Boolean).length)
            try {
              await policyApi.update(id, { title: policy.title, contentBody: html })
              await revisionApi.snapshot(id, {
                source: 'AI_DRAFT', contentBody: html,
                aiInteractionId: result?.interactionId ?? undefined,
              })
              setIsDirty(false)
              setLastSaved(new Date())
              toast.success(kept?.revisionNo
                ? `AI draft saved — the previous text is kept as r${kept.revisionNo} in History`
                : 'AI draft saved')
            } catch (e) {
              setIsDirty(true)
              toast.error(e?.response?.data?.message || 'The draft is in the editor but was not saved — click Save draft')
            }
            qc.invalidateQueries({ queryKey: ['policy-editor', id] })
            qc.invalidateQueries({ queryKey: ['policy-revisions', id] })
          }}
        />
      )}

      {/* Policy content styles live in index.css (.policy-content, .policy-link, .tiptap)
          so they also apply when content is rendered in the EntityDrawer on the module page. */}
    </PageLayout>
  )
}