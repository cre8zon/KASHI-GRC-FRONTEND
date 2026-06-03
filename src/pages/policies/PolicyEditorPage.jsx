/**
 * PolicyEditorPage — /audit/policies/:id/edit
 *
 * Full WYSIWYG document editor for AuditPolicy.contentBody.
 * Rendered when contentType === 'RICH_TEXT'.
 * PDF_UPLOAD and EXTERNAL_URL policies use a lighter form — not this page.
 *
 * EDITOR STACK:
 *   Uses the browser's native contentEditable + execCommand for now
 *   (zero dependencies). When TipTap or Quill is available, swap
 *   EditorCanvas for that — the rest of this file stays identical.
 *
 * FEATURES:
 *   - Full toolbar: headings H1/H2/H3, bold, italic, underline, lists,
 *     numbered lists, tables (3-col stub), blockquote, hr, undo/redo
 *   - Auto-save every 30 s (PATCH /v1/audit/library/policies/:id)
 *   - Version history panel — GET /v1/audit/library/policies/:id/versions
 *   - Status lifecycle actions: Save Draft / Send for Review / Approve / Deprecate
 *   - Word count, last-saved timestamp in footer
 *   - Read-only mode when policy is APPROVED or DEPRECATED
 *
 * ROUTES:
 *   /audit/policies/:id/edit    — editor (ORGANIZATION, SYSTEM)
 *   /audit/policies/:id         — read-only detail (all allowed sides)
 *
 * BACKEND ENDPOINTS USED:
 *   GET    /v1/audit/library/policies/:id             — load policy
 *   PATCH  /v1/audit/library/policies/:id             — auto-save / save draft
 *   GET    /v1/audit/library/policies/:id/versions    — version list
 *   POST   /v1/audit/library/policies/:id/approve     — approve
 *   POST   /v1/audit/library/policies/:id/deprecate   — deprecate
 *   PATCH  /v1/audit/library/policies/:id             — send for review (status patch)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate }                    from 'react-router-dom'
import { useQuery, useMutation, useQueryClient }     from '@tanstack/react-query'
import {
  ArrowLeft, Save, Send, CheckCircle2, Archive,
  Clock, History, ChevronDown, ChevronRight,
  Bold, Italic, Underline, List, ListOrdered,
  Heading1, Heading2, Heading3, Quote, Minus,
  Table, Undo, Redo, Eye, EyeOff, AlertTriangle,
  FileText, Loader2,
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button }     from '../../components/ui/Button'
import { Badge }      from '../../components/ui/Badge'
import { Modal }      from '../../components/ui/Modal'
import { cn }         from '../../lib/cn'
import api            from '../../config/axios.config'
import toast          from 'react-hot-toast'

// ─── API helpers ──────────────────────────────────────────────────────────────

const policyApi = {
  get:        (id)      => api.get(`/v1/audit/library/policies/${id}`),
  patch:      (id, d)   => api.patch(`/v1/audit/library/policies/${id}`, d),
  versions:   (id)      => api.get(`/v1/audit/library/policies/${id}/versions`),
  approve:    (id)      => api.post(`/v1/audit/library/policies/${id}/approve`),
  deprecate:  (id)      => api.post(`/v1/audit/library/policies/${id}/deprecate`),
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
          ? 'bg-brand-500/20 text-brand-400'
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
  const editorRef  = useRef(null)
  const autoSaveRef = useRef(null)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [lastSaved,   setLastSaved]   = useState(null)
  const [wordCount,   setWordCount]   = useState(0)
  const [isDirty,     setIsDirty]     = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)

  // ── Fetch policy ──────────────────────────────────────────────────────────
  const { data: policyRes, isLoading } = useQuery({
    queryKey: ['policy-editor', id],
    queryFn:  () => policyApi.get(id),
    enabled:  !!id,
  })
  const policy = policyRes?.data || policyRes

  // ── Fetch version history ─────────────────────────────────────────────────
  const { data: versionsRes } = useQuery({
    queryKey: ['policy-versions', id],
    queryFn:  () => policyApi.versions(id),
    enabled:  !!id && historyOpen,
  })
  const versions = Array.isArray(versionsRes) ? versionsRes
    : Array.isArray(versionsRes?.data) ? versionsRes.data : []

  // ── Load initial content into editor ─────────────────────────────────────
  useEffect(() => {
    if (policy?.contentBody && editorRef.current) {
      editorRef.current.innerHTML = policy.contentBody
      updateWordCount()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy?.id])

  const isReadOnly = policy && !EDITABLE_STATUSES.has(policy.status)

  // ── Auto-save every 30s ───────────────────────────────────────────────────
  const doSave = useCallback(async (silent = false) => {
    if (!editorRef.current || isReadOnly) return
    const contentBody = editorRef.current.innerHTML
    try {
      await api.patch(`/v1/audit/library/policies/${id}`, { contentBody })
      qc.invalidateQueries({ queryKey: ['policy-editor', id] })
      setLastSaved(new Date())
      setIsDirty(false)
      if (!silent) toast.success('Saved')
    } catch (e) {
      if (!silent) toast.error(e?.response?.data?.message || 'Save failed')
    }
  }, [id, isReadOnly, qc])

  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (isDirty) doSave(true)
    }, 30_000)
    return () => clearInterval(autoSaveRef.current)
  }, [isDirty, doSave])

  // ── Word count ────────────────────────────────────────────────────────────
  const updateWordCount = () => {
    if (!editorRef.current) return
    const text = editorRef.current.innerText || ''
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length)
  }

  const handleInput = () => {
    setIsDirty(true)
    updateWordCount()
  }

  // ── execCommand helpers ───────────────────────────────────────────────────
  const cmd = (command, value = null) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  const isActive = (command) => {
    try { return document.queryCommandState(command) } catch { return false }
  }

  const insertTable = () => {
    const html = `
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <thead><tr>
          <th style="border:1px solid #3a3a4a;padding:6px 10px;background:#1e1e2e;text-align:left">Column 1</th>
          <th style="border:1px solid #3a3a4a;padding:6px 10px;background:#1e1e2e;text-align:left">Column 2</th>
          <th style="border:1px solid #3a3a4a;padding:6px 10px;background:#1e1e2e;text-align:left">Column 3</th>
        </tr></thead>
        <tbody><tr>
          <td style="border:1px solid #3a3a4a;padding:6px 10px" contenteditable="true"> </td>
          <td style="border:1px solid #3a3a4a;padding:6px 10px" contenteditable="true"> </td>
          <td style="border:1px solid #3a3a4a;padding:6px 10px" contenteditable="true"> </td>
        </tr></tbody>
      </table><p><br></p>`
    document.execCommand('insertHTML', false, html)
  }

  // ── Lifecycle mutations ───────────────────────────────────────────────────
  const approveMut = useMutation({
    mutationFn: () => policyApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policy-editor', id] })
      toast.success('Policy approved')
      setConfirmAction(null)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Approve failed'),
  })

  const deprecateMut = useMutation({
    mutationFn: () => policyApi.deprecate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policy-editor', id] })
      toast.success('Policy deprecated')
      setConfirmAction(null)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Deprecate failed'),
  })

  const sendForReviewMut = useMutation({
    mutationFn: () => policyApi.patch(id, { status: 'UNDER_REVIEW' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policy-editor', id] })
      toast.success('Sent for review')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

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
          <FileText size={14} className="text-brand-400" />
          <span className="text-sm font-semibold text-text-primary truncate max-w-[400px]">
            {policy.title || 'Untitled policy'}
          </span>
          <Badge variant={statusCfg.color} size="xs">{statusCfg.label}</Badge>
          {policy.version && (
            <span className="text-[10px] text-text-muted font-mono">v{policy.version}</span>
          )}
          {isDirty && (
            <span className="text-[10px] text-amber-400 italic">Unsaved changes</span>
          )}
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors',
              historyOpen
                ? 'bg-brand-500/10 text-brand-400 border border-brand-500/30'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay border border-transparent',
            )}
          >
            <History size={12} /> History
          </button>
          <button
            onClick={() => setPreviewMode(o => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs
                       text-text-muted hover:text-text-secondary hover:bg-surface-overlay
                       border border-transparent transition-colors"
          >
            {previewMode ? <EyeOff size={12} /> : <Eye size={12} />}
            {previewMode ? 'Edit' : 'Preview'}
          </button>

          {!isReadOnly && (
            <>
              <Button
                size="sm" variant="secondary" icon={Save}
                onClick={() => doSave(false)}
              >
                Save draft
              </Button>
              {policy.status === 'DRAFT' && (
                <Button
                  size="sm" variant="secondary" icon={Send}
                  loading={sendForReviewMut.isPending}
                  onClick={() => sendForReviewMut.mutate()}
                >
                  Send for review
                </Button>
              )}
              {policy.status === 'UNDER_REVIEW' && (
                <Button
                  size="sm" variant="primary" icon={CheckCircle2}
                  onClick={() => setConfirmAction('approve')}
                >
                  Approve
                </Button>
              )}
            </>
          )}
          {policy.status === 'APPROVED' && (
            <Button
              size="sm" variant="secondary" icon={Archive}
              onClick={() => setConfirmAction('deprecate')}
            >
              Deprecate
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
              <ToolBtn icon={Undo}        title="Undo"           onClick={() => cmd('undo')} />
              <ToolBtn icon={Redo}        title="Redo"           onClick={() => cmd('redo')} />
              <ToolSep />
              <ToolBtn icon={Heading1}    title="Heading 1"      onClick={() => cmd('formatBlock', 'H1')} />
              <ToolBtn icon={Heading2}    title="Heading 2"      onClick={() => cmd('formatBlock', 'H2')} />
              <ToolBtn icon={Heading3}    title="Heading 3"      onClick={() => cmd('formatBlock', 'H3')} />
              <ToolSep />
              <ToolBtn icon={Bold}        title="Bold"           active={isActive('bold')}      onClick={() => cmd('bold')} />
              <ToolBtn icon={Italic}      title="Italic"         active={isActive('italic')}    onClick={() => cmd('italic')} />
              <ToolBtn icon={Underline}   title="Underline"      active={isActive('underline')} onClick={() => cmd('underline')} />
              <ToolSep />
              <ToolBtn icon={List}        title="Bullet list"    onClick={() => cmd('insertUnorderedList')} />
              <ToolBtn icon={ListOrdered} title="Numbered list"  onClick={() => cmd('insertOrderedList')} />
              <ToolBtn icon={Quote}       title="Blockquote"     onClick={() => cmd('formatBlock', 'BLOCKQUOTE')} />
              <ToolSep />
              <ToolBtn icon={Table}       title="Insert table"   onClick={insertTable} />
              <ToolBtn icon={Minus}       title="Horizontal rule" onClick={() => cmd('insertHorizontalRule')} />
            </div>
          )}

          {/* Read-only banner */}
          {isReadOnly && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/5 border-b border-amber-500/20
                            text-xs text-amber-400 shrink-0">
              <AlertTriangle size={12} />
              This policy is {policy.status?.toLowerCase()} — editing is disabled.
            </div>
          )}

          {/* Editor canvas */}
          <div className="flex-1 overflow-y-auto">
            {previewMode ? (
              /* Preview mode — rendered HTML */
              <div
                className="max-w-3xl mx-auto px-8 py-10 policy-content"
                dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || policy.contentBody || '' }}
              />
            ) : (
              <div
                ref={editorRef}
                contentEditable={!isReadOnly}
                suppressContentEditableWarning
                onInput={handleInput}
                className={cn(
                  'max-w-3xl mx-auto px-8 py-10 outline-none min-h-[600px]',
                  'text-sm text-text-primary leading-relaxed policy-content',
                  isReadOnly && 'cursor-default select-text',
                )}
                data-placeholder="Start writing your policy…"
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
                                           border border-brand-500/20 text-brand-400 font-medium">
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

      {/* Approval confirmation */}
      {confirmAction && (
        <Modal
          open
          onClose={() => setConfirmAction(null)}
          title={confirmAction === 'approve' ? 'Approve policy' : 'Deprecate policy'}
          subtitle={
            confirmAction === 'approve'
              ? 'Approving will lock this policy for editing and increment the version number.'
              : 'Deprecating marks this policy as no longer active. It cannot be undone easily.'
          }
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant={confirmAction === 'approve' ? 'primary' : 'danger'}
                loading={approveMut.isPending || deprecateMut.isPending}
                onClick={() => {
                  if (confirmAction === 'approve') approveMut.mutate()
                  else deprecateMut.mutate()
                }}
              >
                {confirmAction === 'approve' ? 'Approve' : 'Deprecate'}
              </Button>
            </div>
          }
        />
      )}

      {/* Policy content styles — scoped via class */}
      <style>{`
        .policy-content h1 {
          font-size: 1.5rem; font-weight: 700; color: var(--text-primary);
          margin: 1.5rem 0 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;
        }
        .policy-content h2 {
          font-size: 1.15rem; font-weight: 600; color: var(--text-primary);
          margin: 1.25rem 0 0.5rem;
        }
        .policy-content h3 {
          font-size: 0.95rem; font-weight: 600; color: var(--text-secondary);
          margin: 1rem 0 0.4rem;
        }
        .policy-content p { margin: 0.5rem 0; color: var(--text-primary); }
        .policy-content ul, .policy-content ol {
          margin: 0.5rem 0 0.5rem 1.5rem; color: var(--text-primary);
        }
        .policy-content li { margin: 0.25rem 0; }
        .policy-content blockquote {
          border-left: 3px solid var(--brand-500); margin: 0.75rem 0;
          padding: 0.5rem 1rem; background: rgba(99,102,241,0.05);
          border-radius: 0 6px 6px 0; color: var(--text-secondary);
        }
        .policy-content hr {
          border: none; border-top: 1px solid var(--border); margin: 1.5rem 0;
        }
        .policy-content table {
          border-collapse: collapse; width: 100%; margin: 1rem 0;
        }
        .policy-content td, .policy-content th {
          border: 1px solid var(--border); padding: 6px 10px;
          font-size: 0.8rem; color: var(--text-primary);
        }
        .policy-content th {
          background: var(--surface-overlay); font-weight: 600;
        }
        .policy-content:empty:before {
          content: attr(data-placeholder);
          color: var(--text-muted); pointer-events: none;
        }
      `}</style>
    </PageLayout>
  )
}