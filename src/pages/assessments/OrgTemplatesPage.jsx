import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutTemplate, Search, RefreshCw, ChevronRight,
  ChevronDown, Eye, BookOpen, Hash, Weight, CheckCircle2
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'
import { formatDate } from '../../utils/format'

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_COLOR = { SINGLE_CHOICE: 'blue', MULTI_CHOICE: 'purple', TEXT: 'cyan', FILE_UPLOAD: 'amber' }
const TYPE_LABEL = { SINGLE_CHOICE: 'Single Choice', MULTI_CHOICE: 'Multi Choice', TEXT: 'Text', FILE_UPLOAD: 'File Upload' }

// ─── Hooks ────────────────────────────────────────────────────────────────────
const usePublishedTemplates = (params) => useQuery({
  queryKey: ['org-templates', params],
  queryFn:  () => assessmentsApi.templates.list({ ...params, status: 'PUBLISHED' }),
  keepPreviousData: true,
})

const useFullTemplate = (id) => useQuery({
  queryKey: ['org-template-full', id],
  queryFn:  () => assessmentsApi.templates.full(id),
  enabled:  !!id,
})

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrgTemplatesPage() {
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [preview, setPreview] = useState(null)  // templateId

  const { data, isLoading, refetch } = usePublishedTemplates({
    skip: (page - 1) * 20, take: 20,
    ...(search ? { search: `name=${search}` } : {}),
  })

  const templates = data?.items || []

  return (
    <PageLayout
      title="Assessment Templates"
      subtitle="Published templates available for vendor assessments"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search templates…"
              className="h-8 pl-8 pr-3 w-52 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
        </div>
      }
    >
      {isLoading ? (
        <div className="px-6 py-4 grid grid-cols-1 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-lg bg-surface-overlay animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No published templates"
          description="Your platform administrator hasn't published any assessment templates yet."
        />
      ) : (
        <div className="px-6 py-4 flex flex-col gap-3">
          {templates.map(tpl => (
            <TemplateCard
              key={tpl.templateId}
              template={tpl}
              onPreview={() => setPreview(tpl.templateId)}
            />
          ))}

          {/* Pagination */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs text-text-muted">
              <span>{data.pagination.totalItems} templates</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="xs" disabled={!data.pagination.hasPrevious} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <span className="flex items-center px-2">Page {page} of {data.pagination.totalPages}</span>
                <Button variant="secondary" size="xs" disabled={!data.pagination.hasNext} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full preview modal */}
      <TemplatePreviewModal
        templateId={preview}
        onClose={() => setPreview(null)}
      />
    </PageLayout>
  )
}

// ─── Template Card ────────────────────────────────────────────────────────────
function TemplateCard({ template, onPreview }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised hover:border-border-subtle transition-colors">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
            <LayoutTemplate size={16} className="text-brand-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{template.name}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-text-muted">v{template.version}</span>
              <Badge value="PUBLISHED" label="Published" colorTag="green" />
              {template.publishedAt && (
                <span className="text-xs text-text-muted">Published {formatDate(template.publishedAt)}</span>
              )}
            </div>
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={Eye} onClick={onPreview}>
          Preview
        </Button>
      </div>
    </div>
  )
}

// ─── Template Preview Modal ───────────────────────────────────────────────────
function TemplatePreviewModal({ templateId, onClose }) {
  const { data: template, isLoading } = useFullTemplate(templateId)
  const [expandedSections, setExpandedSections] = useState({})

  const toggle = (id) => setExpandedSections(p => ({ ...p, [id]: !p[id] }))

  const totalQuestions = template?.sections?.reduce((s, sec) => s + (sec.questions?.length || 0), 0) || 0

  return (
    <Modal
      open={!!templateId}
      onClose={onClose}
      title={template?.name || 'Template Preview'}
      subtitle={template ? `${template.sections?.length || 0} sections · ${totalQuestions} questions` : undefined}
      size="xl"
    >
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-surface-overlay animate-pulse" />)}
        </div>
      ) : !template ? null : (
        <div className="flex flex-col gap-3">
          {/* Template meta */}
          <div className="flex items-center gap-4 p-3 bg-surface-overlay rounded-lg border border-border text-xs text-text-muted">
            <span>Version: <span className="font-mono text-text-secondary">{template.version}</span></span>
            <span>Sections: <span className="font-mono text-text-secondary">{template.sections?.length || 0}</span></span>
            <span>Questions: <span className="font-mono text-text-secondary">{totalQuestions}</span></span>
            {template.publishedAt && <span>Published: <span className="text-text-secondary">{formatDate(template.publishedAt)}</span></span>}
          </div>

          {/* Sections */}
          {(template.sections || []).map((section, sIdx) => (
            <div key={section.sectionId} className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => toggle(section.sectionId)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-md bg-brand-500/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-brand-400">{sIdx + 1}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">{section.name}</p>
                  <p className="text-xs text-text-muted">{section.questions?.length || 0} questions</p>
                </div>
                {expandedSections[section.sectionId]
                  ? <ChevronDown size={14} className="text-text-muted" />
                  : <ChevronRight size={14} className="text-text-muted" />
                }
              </button>

              {expandedSections[section.sectionId] && (
                <div className="border-t border-border divide-y divide-border">
                  {(section.questions || []).map((q, qIdx) => (
                    <div key={q.questionId} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-mono text-text-muted w-5 mt-0.5 shrink-0">{qIdx + 1}</span>
                        <div className="flex-1">
                          <p className="text-sm text-text-primary leading-relaxed">{q.questionText}</p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <Badge
                              value={q.responseType}
                              label={TYPE_LABEL[q.responseType] || q.responseType}
                              colorTag={TYPE_COLOR[q.responseType] || 'gray'}
                            />
                            {q.weight != null && (
                              <span className="text-xs text-text-muted">Weight: <span className="font-mono">{q.weight}</span></span>
                            )}
                            {q.isMandatory && (
                              <span className="flex items-center gap-1 text-xs text-red-400">
                                <CheckCircle2 size={10} /> Required
                              </span>
                            )}
                          </div>
                          {q.options?.length > 0 && (
                            <div className="mt-2 flex flex-col gap-1">
                              {q.options.map(opt => (
                                <div key={opt.optionId} className="flex items-center justify-between px-2 py-1 rounded bg-surface-overlay text-xs">
                                  <span className="text-text-secondary">{opt.optionValue}</span>
                                  <span className="font-mono text-text-muted">score: {opt.score ?? 0}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}