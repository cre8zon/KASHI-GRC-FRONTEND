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
 */

import { useState, useEffect, useRef, useCallback } from 'react'
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
  Code2,
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
import { cn }         from '../../lib/cn'
import api            from '../../config/axios.config'
import toast          from 'react-hot-toast'

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
  const [linkInput,     setLinkInput]     = useState('')
  const [linkMenuOpen,  setLinkMenuOpen]  = useState(false)

  // ── Fetch policy ──────────────────────────────────────────────────────────
  const { data: policyRes, isLoading } = useQuery({
    queryKey: ['policy-editor', id],
    queryFn:  () => policyApi.get(id),
    enabled:  !!id,
  })
  const policy = policyRes?.data || policyRes

  // No dedicated /versions endpoint yet — derive from the policy itself.
  // Shows the current approved version; expand to a real endpoint when available.
  const versions = policy ? [{ id: policy.id, version: policy.version, approvedAt: policy.approvedAt, previousVersionId: policy.previousVersionId }] : []

  const isReadOnly = policy && !EDITABLE_STATUSES.has(policy.status)

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
    content:   policy?.contentBody || '',
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
    if (editor && policy?.contentBody && !editor.getText()) {
      editor.commands.setContent(policy.contentBody)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy?.id])

  // ── Auto-save every 30s ─────────────────────────────────────────────────────
  const doSave = useCallback(async (silent = false) => {
    if (!editor || isReadOnly) return
    const contentBody = editor.getHTML()
    try {
      await policyApi.update(id, { title: policy.title, contentBody })
      qc.invalidateQueries({ queryKey: ['policy-editor', id] })
      setLastSaved(new Date())
      setIsDirty(false)
      if (!silent) toast.success('Saved')
    } catch (e) {
      if (!silent) toast.error(e?.response?.data?.message || 'Save failed')
    }
  }, [editor, id, isReadOnly, qc])

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
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate(-1)}
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
          {isDirty && (
            <span className="text-[10px] text-status-warn-fg italic">Unsaved changes</span>
          )}
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

          {!isReadOnly && (
            <Button
              size="sm" variant="secondary" icon={Save}
              onClick={() => doSave(false)}
            >
              Save draft
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-1 min-h-0">

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
                      className="w-48 px-2 py-1 text-xs bg-surface-overlay border border-border rounded outline-none
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
            </BubbleMenu>
          )}

          {/* Editor canvas */}
          <div className="flex-1 overflow-y-auto">
            {previewMode ? (
              /* Preview mode — rendered HTML */
              <div
                className="max-w-3xl mx-auto px-8 py-10 policy-content"
                dangerouslySetInnerHTML={{ __html: editor?.getHTML() || policy.contentBody || '' }}
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

        {/* ── Version history panel ── */}
        {historyOpen && (
          <div className="w-72 shrink-0 border-l border-border flex flex-col">
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
          </div>
        )}
      </div>

      {/* Policy content styles live in index.css (.policy-content, .policy-link, .tiptap)
          so they also apply when content is rendered in the EntityDrawer on the module page. */}
    </PageLayout>
  )
}