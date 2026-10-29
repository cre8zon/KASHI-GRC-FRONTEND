/**
 * WorkflowCataloguePage — /workflow-catalogue/:entityType
 *
 * "See the workflow before you start." For one module: every workflow it can
 * run, the selected one's walkthrough video (chapters = steps), its steps in
 * order with side / role / SLA / approval rule, the roles it needs checked
 * against the organisation's users, and a way to request a custom workflow
 * (which lands in the platform Enquiries inbox as WORKFLOW_REQUEST).
 *
 * Query params: ?workflow={id} selects one, ?at={seconds} starts the video
 * (not ?t= — that is the tenant-switch parameter TenantSync acts on)
 * there (the task bar's "How this step works"), ?request=1 opens the request
 * form. Platform admins also get "Walkthrough video" settings per workflow.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { Play, ExternalLink, Send, CheckCircle2, AlertTriangle, Upload, Save, GitBranch, BookOpen, ArrowRight, Link2, ChevronDown } from 'lucide-react'
import api from '../../config/axios.config'
import { cn } from '../../lib/cn'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Breadcrumb, navTrailFor, Chip } from '../../components/detail/DetailChrome'
import { useWorkflowCatalogue, useModuleGuide, guideRoute, catalogueRoute, StepBar, SIDE_COLOR, SIDE_LABEL } from '../../components/list/ListBands'
import { StepRules, explainStep, STEP_GLOSSARY } from '../../components/detail/WorkflowGuide'
import { useNavigation } from '../../hooks/useUIConfig'
import { selectRoleSides } from '../../store/slices/authSlice'

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const human = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())

export default function WorkflowCataloguePage() {
  const { entityType: rawType } = useParams()
  const entityType = String(rawType || '').toUpperCase()
  const [sp, setSp] = useSearchParams()
  const sides = useSelector(selectRoleSides) || []
  const isPlatform = sides.includes('SYSTEM')
  // Vendors, auditors and auditees work inside the organisation's workflows:
  // they see their part and the walkthroughs, not requests or role coverage.
  const isOrgSide = !sides.some(s => ['VENDOR', 'AUDITOR', 'AUDITEE'].includes(s))
  // /guide/{module} opens on "how this module works"; /workflow-catalogue/{module}
  // on its workflows. Same page, same data.
  const guideMode = useLocation().pathname.startsWith('/guide/')

  const { data: bpRes } = useQuery({
    queryKey: ['module-blueprint-type', entityType],
    queryFn: () => api.get(`/v1/admin/module-blueprints/by-type/${entityType}`),
    enabled: !!entityType,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const bp = bpRes?.data || bpRes || {}
  const moduleLabel = bp.displayNamePlural || bp.displayName || human(entityType)
  const { data: navItems = [] } = useNavigation()

  const { data: workflows = [], isLoading } = useWorkflowCatalogue(entityType)
  const selectedId = Number(sp.get('workflow')) || workflows[0]?.id || null
  const selected = workflows.find(w => w.id === selectedId) || workflows[0] || null
  const select = (id) => { const p = new URLSearchParams(sp); p.set('workflow', String(id)); p.delete('at'); setSp(p, { replace: true }) }

  const requestRef = useRef(null)
  useEffect(() => {
    if (sp.get('request') === '1') requestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sp, workflows.length])

  // Bring the request form into view inside the right column (it scrolls on
  // its own, so the page itself does not move).
  const goRequest = () => requestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <PageLayout>
      {/* Header stays put; below it two columns that scroll independently on
          wide screens — the list of workflows on the left, the selected one
          (or the module guide) on the right. Narrow screens stack and scroll
          as one page. */}
      <div className="px-6 pt-3 pb-4 flex flex-col gap-2 lg:h-full lg:min-h-0">
        <Breadcrumb items={[
          { label: 'Home', to: '/dashboard' },
          ...navTrailFor(navItems, { navKey: bp.navKey, entityType }),
          { label: moduleLabel, to: `/module/${entityType.toLowerCase()}` },
          { label: guideMode ? 'Guide' : 'Workflows' },
        ]} />
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold text-text-primary flex-1 min-w-0 leading-tight">
            {guideMode ? `How ${moduleLabel.toLowerCase()} work` : `Workflows for ${moduleLabel.toLowerCase()}`}
          </h1>
          {isOrgSide && (
            <Button size="md" icon={Send} onClick={goRequest}>Request a custom workflow</Button>
          )}
        </div>

        <div className="flex gap-3 flex-col lg:flex-row lg:flex-1 lg:min-h-0">
          {/* Left: the module guide, then every workflow */}
          <nav aria-label="Workflows"
            className="flex flex-col gap-2 lg:w-[320px] lg:shrink-0 lg:overflow-y-auto lg:min-h-0 scroll-quiet lg:pr-1 pb-1">
            <Link to={guideRoute(entityType)}
              className={cn('rounded-card border px-3 py-2.5 flex items-center gap-2.5 transition-colors',
                guideMode ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500/40' : 'border-border bg-surface-raised hover:border-brand-500/40')}>
              <span className="w-8 h-8 rounded-ctl bg-status-tag-bg text-status-tag-fg flex items-center justify-center shrink-0"><BookOpen size={15} /></span>
              <span className="min-w-0">
                <strong className="block text-sm text-text-primary truncate">How {moduleLabel.toLowerCase()} work</strong>
                <span className="block text-xs text-text-muted truncate">Lifecycle, who does what, demo</span>
              </span>
            </Link>

            {isLoading && <p className="text-xs text-text-muted px-1 py-2">Loading workflows…</p>}
            {!isLoading && workflows.length === 0 && (
              <p className="text-xs text-text-muted px-1 py-2">No workflows for {moduleLabel.toLowerCase()} yet.</p>
            )}
            {workflows.map(w => {
              const active = !guideMode && selected?.id === w.id
              const card = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-text-primary truncate" title={w.name}>{w.name}</strong>
                    {w.usage?.total > 0
                      ? <span className="text-[10.5px] font-semibold px-2 rounded-badge bg-status-pass-bg text-status-pass-fg shrink-0">In use · {w.usage.open} open</span>
                      : <span className="text-[10.5px] font-semibold px-2 rounded-badge bg-status-pending-bg text-status-pending-fg shrink-0">Available</span>}
                  </div>
                  <StepBar steps={w.steps} />
                  <p className="text-xs text-text-muted truncate">
                    {w.stepCount} steps · {(w.sides || []).filter(s => s !== 'SYSTEM').map(s => SIDE_LABEL[s] || s).join(', ') || 'System'}
                    {w.roleCount ? ` · ${w.roleCount} roles` : ''}
                    {w.hasDemo && <span className="text-brand-ink font-semibold"> · ▶ demo</span>}
                  </p>
                </>
              )
              const cls = cn('text-left rounded-card border px-3 py-2.5 flex flex-col gap-1.5 transition-colors',
                active ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500/40' : 'border-border bg-surface-raised hover:border-brand-500/40')
              return guideMode
                ? <Link key={w.id} to={catalogueRoute(entityType, `?workflow=${w.id}`)} className={cls}>{card}</Link>
                : <button key={w.id} type="button" onClick={() => select(w.id)} className={cls} aria-current={active ? 'true' : undefined}>{card}</button>
            })}

            {isOrgSide && (
              <div className="rounded-card border border-dashed border-brand-500/40 bg-brand-500/5 px-3 py-2.5">
                <strong className="text-[13px] text-text-primary">None of these fit?</strong>
                <p className="text-xs text-text-muted mt-0.5 mb-1.5 leading-snug">Describe your process and we will build it for you as a custom workflow.</p>
                <button type="button" onClick={goRequest} className="text-xs font-semibold text-brand-ink hover:underline">
                  Request a custom workflow →
                </button>
              </div>
            )}
          </nav>

          {/* Right: the selected workflow, or the module guide */}
          <main className="flex-1 min-w-0 flex flex-col gap-3 lg:overflow-y-auto lg:min-h-0 scroll-quiet lg:pr-1 pb-2">
            {guideMode
              ? <ModuleGuideSection entityType={entityType} isOrgSide={isOrgSide} />
              : selected
                ? <>
                    <Walkthrough workflow={selected} startAt={Number(sp.get('at')) || 0} />
                    <StepWizard workflow={selected} viewerSides={isOrgSide ? [] : sides} />
                    {isOrgSide && <RoleCoverage workflowId={selected.id} />}
                    {isPlatform && <DemoSettings workflow={selected} entityType={entityType} />}
                  </>
                : !isLoading && (
                    <div className="rounded-card border border-dashed border-border p-8 text-center">
                      <p className="text-sm text-text-secondary">No workflows are available for {moduleLabel.toLowerCase()} yet.</p>
                      <p className="text-xs text-text-muted mt-1">Tell us how the work should run and we will build it.</p>
                    </div>
                  )}
            {isOrgSide && (
              <div ref={requestRef} className="scroll-mt-2">
                <RequestForm entityType={entityType} moduleLabel={moduleLabel} workflows={workflows}
                  startFrom={guideMode ? undefined : selected?.name} />
              </div>
            )}
          </main>
        </div>
      </div>
    </PageLayout>
  )
}

// ─── Walkthrough video ───────────────────────────────────────────────────────

function Walkthrough({ workflow, startAt }) {
  const { data } = useQuery({
    queryKey: ['workflow-demo', workflow.id],
    queryFn: () => api.get(`/v1/workflow-catalogue/${workflow.id}/demo`),
    enabled: !!workflow.hasDemo,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const demo = data?.data || data
  if (!workflow.hasDemo) return null
  const chapters = (demo?.chapters || []).filter(c => c.startSeconds != null)
    .map(c => ({ key: c.stepId, label: `${c.order}. ${c.name}`, seconds: c.startSeconds }))
  return <VideoPlayer demo={demo} chapters={chapters} startAt={startAt} title={workflow.name} chapterHint="Chapters · jump to a step" />
}

/**
 * The walkthrough player, for a workflow or a module. demo = {kind, url}:
 * FILE plays here (presigned URL), LINK opens the hosted video at the chosen
 * time. chapters = [{key, label, seconds}].
 */
function VideoPlayer({ demo, chapters = [], startAt = 0, title, chapterHint = 'Chapters' }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v || demo?.kind !== 'FILE' || !startAt) return
    const seek = () => { v.currentTime = startAt; setPlaying(true) }
    if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true })
  }, [demo?.kind, demo?.url, startAt])

  const jump = (s) => {
    if (demo?.kind === 'FILE' && videoRef.current) {
      videoRef.current.currentTime = s
      videoRef.current.play?.()
      setPlaying(true)
    } else if (demo?.kind === 'LINK' && demo.url) {
      window.open(withTime(demo.url, s), '_blank', 'noopener')
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface-raised p-2.5 flex gap-3 flex-wrap items-stretch">
      <div className="flex-[1_1_380px] min-w-0 rounded-ctl overflow-hidden relative guide-stage" style={{ minHeight: 200 }}>
        {demo?.kind === 'FILE' && demo.url ? (
          <>
            <video ref={videoRef} src={demo.url} controls={playing} preload="metadata"
              className="w-full h-full object-contain" style={{ minHeight: 200 }}
              onPlay={() => setPlaying(true)} />
            {!playing && (
              <button type="button" onClick={() => { videoRef.current?.play?.(); setPlaying(true) }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-on-dark">
                <span className="guide-band-cta w-14 h-14 rounded-full flex items-center justify-center">
                  <Play size={22} fill="currentColor" />
                </span>
                <span className="text-sm font-bold">Watch the walkthrough</span>
                {title && <span className="text-xs guide-band-muted">{title}</span>}
              </button>
            )}
          </>
        ) : demo?.kind === 'LINK' && demo.url ? (
          <a href={withTime(demo.url, startAt)} target="_blank" rel="noopener noreferrer"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-on-dark">
            <span className="guide-band-cta w-14 h-14 rounded-full flex items-center justify-center">
              <Play size={22} fill="currentColor" />
            </span>
            <span className="text-sm font-bold flex items-center gap-1.5">Watch the walkthrough <ExternalLink size={13} /></span>
            <span className="text-xs guide-band-muted">opens in a new tab</span>
          </a>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs guide-band-muted">Loading video…</div>
        )}
      </div>
      <div className="flex-[1_1_240px] min-w-0 flex flex-col gap-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-ink mb-1">{chapterHint}</p>
        {chapters.length === 0 && <p className="text-xs text-text-muted">No chapters set for this video.</p>}
        {chapters.map(c => (
          <button key={c.key} type="button" onClick={() => jump(c.seconds)}
            className={cn('flex items-center gap-2 text-left text-[12.5px] px-2 py-1.5 rounded-ctl hover:bg-brand-500/8',
              startAt && c.seconds === startAt ? 'bg-brand-500/10' : '')}>
            <span className="font-mono text-[11px] text-brand-ink w-10 shrink-0">{mmss(c.seconds)}</span>
            <span className="truncate text-text-primary">{c.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Module guide ("How this module works") ──────────────────────────────────

/**
 * For every module, with or without workflows: the walkthrough, a summary,
 * the lifecycle from the module's own status flow, what can be done and by
 * which roles, and how it connects to other modules.
 */
export function ModuleGuideSection({ entityType, isOrgSide }) {
  const { data: guide, isLoading } = useModuleGuide(entityType)
  const { data: demoRes } = useQuery({
    queryKey: ['module-demo', entityType],
    queryFn: () => api.get(`/v1/module-guide/${entityType}/demo`),
    enabled: !!guide?.hasDemo,
    staleTime: 10 * 60_000,
    retry: false,
  })
  if (isLoading) return <p className="text-sm text-text-muted py-4">Loading the guide…</p>
  if (!guide) return null
  const demo = demoRes?.data || demoRes
  const states = guide.lifecycle?.states || []
  const actions = guide.actions || []
  const connections = guide.connections || []
  const actionItems = guide.actionItems || []
  const nothing = !guide.summary && !guide.hasDemo && states.length < 2 && !actions.length && !connections.length && !actionItems.length

  return (
    <div className="flex flex-col gap-3">
      {guide.hasDemo && (
        <VideoPlayer demo={demo}
          chapters={(demo?.chapters || guide.chapters || []).filter(c => c.seconds != null)
            .map((c, i) => ({ key: `${i}-${c.label}`, label: c.label, seconds: Number(c.seconds) }))}
          title={guide.displayNamePlural || guide.displayName} />
      )}

      {/* A module with no video of its own (Vendor Assessment runs the Vendor
          workflow) shows the walkthrough of the workflow it runs instead. */}
      {!guide.hasDemo && <WorkflowWalkthroughFallback entityType={entityType} />}

      {guide.summary && (
        <section className="rounded-card border border-border bg-surface-raised p-3.5">
          <p className="text-sm leading-relaxed text-text-primary whitespace-pre-wrap">{guide.summary}</p>
        </section>
      )}

      {states.length > 1 && (
        <section className="rounded-card border border-border bg-surface-raised p-3.5 flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-text-primary">Lifecycle</h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            {states.map((st, i) => (
              <span key={st.key} className="flex items-center gap-1.5">
                {i > 0 && <ArrowRight size={12} className="text-text-faint" aria-hidden="true" />}
                <Chip colorTag={st.colorTag || ['blue', 'purple', 'amber', 'green', 'gray'][Math.min(i, 4)]}>{st.label}</Chip>
              </span>
            ))}
          </div>
          {(guide.lifecycle?.moves || []).length > 0 && (
            <p className="text-xs text-text-muted">
              Moves: {guide.lifecycle.moves.slice(0, 8).map(m => m.label).join(' · ')}
              {guide.lifecycle.moves.length > 8 ? ' · …' : ''}
            </p>
          )}
        </section>
      )}

      {actions.length > 0 && (
        <section className="rounded-card border border-border bg-surface-raised p-3.5 flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-text-primary">What you can do, and who can do it</h2>
          <div className="flex flex-col divide-y divide-border/60">
            {actions.map(a => (
              <div key={`${a.screen}-${a.actionKey}`} className="flex items-center gap-3 py-1.5 flex-wrap">
                <span className="text-[13px] font-medium text-text-primary flex-[1_1_200px] min-w-0">{a.label}</span>
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted w-16">
                  {a.screen === 'LIST' ? 'List' : 'Record'}
                </span>
                <span className="flex gap-1 flex-wrap flex-[2_1_260px] min-w-0">
                  {a.roles?.length
                    ? a.roles.map(r => (
                        <span key={r.id} className={cn('text-[11px] font-medium px-2 py-0.5 rounded-badge',
                          isOrgSide && r.side === 'ORGANIZATION' && r.userCount === 0
                            ? 'bg-status-warn-bg text-status-warn-fg' : 'bg-surface-overlay text-text-secondary')}
                          title={isOrgSide ? `${r.userCount} user${r.userCount === 1 ? '' : 's'}` : undefined}>
                          {r.name}{isOrgSide && r.side === 'ORGANIZATION' ? ` · ${r.userCount}` : ''}
                        </span>
                      ))
                    : <span className="text-[11px] text-text-muted">{a.requiredPermission ? 'No role has this yet' : 'Anyone with access'}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {actionItems.length > 0 && (
        <section className="rounded-card border border-border bg-surface-raised p-3.5 flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-text-primary">Action items you may receive here</h2>
          <p className="text-xs text-text-muted -mt-1">
            Besides the workflow's own tasks, work inside a record arrives as action items — in your inbox and on the record's Action items tab.
          </p>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {actionItems.map((a, i) => (
              <div key={i} className="rounded-ctl border border-border px-3 py-2 flex flex-col gap-1">
                <p className="text-[12.5px] font-semibold text-text-primary">{a.label}</p>
                {[['Raised when', a.raisedWhen], ['Goes to', a.goesTo], ['Closes when', a.closesWhen]].filter(([, v]) => v).map(([k, v]) => (
                  <p key={k} className="text-xs leading-snug"><span className="text-text-muted">{k}: </span><span className="text-text-secondary">{v}</span></p>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {connections.length > 0 && (
        <section className="rounded-card border border-border bg-surface-raised p-3.5 flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-text-primary">How it connects</h2>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {connections.map((c, i) => {
              const body = (
                <>
                  <p className="text-[12.5px] font-semibold text-text-primary flex items-center gap-1.5"><Link2 size={12} className="text-brand-ink" /> {c.label}</p>
                  {c.text && <p className="text-xs text-text-secondary leading-snug mt-0.5">{c.text}</p>}
                </>
              )
              return c.entityType
                ? <Link key={i} to={guideRoute(c.entityType)} className="rounded-ctl border border-border px-3 py-2 hover:border-brand-500/40">{body}</Link>
                : <div key={i} className="rounded-ctl border border-border px-3 py-2">{body}</div>
            })}
          </div>
        </section>
      )}

      {nothing && (
        <div className="rounded-card border border-dashed border-border p-6 text-center text-sm text-text-muted">
          The guide for this module has not been written yet.
        </div>
      )}
    </div>
  )
}

/** The first workflow of this module that has a walkthrough video, played on the module's guide. */
function WorkflowWalkthroughFallback({ entityType }) {
  const { data: workflows = [] } = useWorkflowCatalogue(entityType)
  const wf = workflows.find(w => w.hasDemo && w.usage?.total > 0) || workflows.find(w => w.hasDemo)
  if (!wf) return null
  return <Walkthrough workflow={wf} startAt={0} />
}

/** Start time for the common video hosts; other links open at the start. */
function withTime(url, s) {
  if (!s) return url
  try {
    const u = new URL(url)
    if (/youtube\.com|youtu\.be/.test(u.hostname)) { u.searchParams.set('t', `${Math.floor(s)}s`); return u.toString() }
    if (/vimeo\.com/.test(u.hostname)) { u.hash = `t=${Math.floor(s)}s`; return u.toString() }
    if (/loom\.com/.test(u.hostname)) { u.searchParams.set('t', String(Math.floor(s))); return u.toString() }
  } catch { /* not a URL — open as is */ }
  return url
}

// ─── Step wizard ─────────────────────────────────────────────────────────────

export function StepWizard({ workflow, viewerSides = [] }) {
  // A vendor / auditor / auditee sees their own steps marked "You"; the
  // organisation's view marks none.
  const mine = (s) => viewerSides.includes(String(s.side).toUpperCase())
  const [showGlossary, setShowGlossary] = useState(false)
  return (
    <section className="rounded-card border border-border bg-surface-raised p-3 flex flex-col gap-2.5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-[1_1_300px] min-w-0">
          <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
            <GitBranch size={15} className="text-brand-ink" /> {workflow.name}
            {workflow.version > 1 && <span className="text-[10.5px] font-medium text-text-muted">v{workflow.version}</span>}
          </h2>
          {workflow.description && <p className="text-[13px] text-text-muted mt-0.5 leading-snug">{workflow.description}</p>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(workflow.sides || []).map(s => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-badge bg-surface-overlay text-text-secondary">
              <span className="w-2 h-2 rounded-full" style={{ background: SIDE_COLOR[s] }} /> {SIDE_LABEL[s] || s}
            </span>
          ))}
        </div>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {workflow.steps.map(s => (
          <li key={s.id} className={cn('flex-[1_0_210px] min-w-[210px] rounded-ctl border bg-surface-raised p-2.5 flex flex-col gap-1.5',
              mine(s) ? 'border-brand-500/60 ring-1 ring-brand-500/30' : 'border-border',
              viewerSides.length > 0 && !mine(s) && 'opacity-70')}
            style={{ borderTop: `3px solid ${SIDE_COLOR[s.side] || SIDE_COLOR.ORGANIZATION}` }}>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full text-[11px] font-bold text-on-dark flex items-center justify-center shrink-0"
                style={{ background: SIDE_COLOR[s.side] || SIDE_COLOR.ORGANIZATION }}>{s.order}</span>
              <strong className="text-[12.5px] text-text-primary leading-tight">{s.name}</strong>
              {mine(s) && <span className="ml-auto text-[10px] font-bold px-1.5 rounded-badge bg-brand-500 text-brand-on">You</span>}
            </div>
            <span className="text-[10.5px] font-semibold text-text-muted">
              {SIDE_LABEL[s.side] || s.side}{s.automated ? ' · automatic' : ''}{s.optional ? ' · optional' : ''}
            </span>
            {/* What the step asks, who gets it, how it is handed out and when
                it is done — in words, not engine settings. */}
            {explainStep(s)?.what && (
              <span className="self-start text-[10.5px] font-semibold px-1.5 rounded-badge bg-surface-overlay text-text-secondary">
                {explainStep(s).what}
              </span>
            )}
            <StepRules step={s} compact />
            {s.guideText && (
              <p className="text-[11.5px] leading-snug text-text-primary border-t border-border/60 pt-1.5 line-clamp-4" title={s.guideText}>
                {s.guideText}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="rounded-ctl border border-border/70 bg-surface-overlay/40">
        <button type="button" onClick={() => setShowGlossary(v => !v)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary hover:text-text-primary">
          <BookOpen size={13} className="text-brand-ink" /> How steps work — reading the cards above
          <ChevronDown size={13} className={cn('ml-auto transition-transform', showGlossary && 'rotate-180')} />
        </button>
        {showGlossary && (
          <dl className="grid gap-x-4 gap-y-1.5 px-2.5 pb-2.5 text-[12px] leading-snug sm:grid-cols-2">
            {STEP_GLOSSARY.map(g => (
              <div key={g.term}>
                <dt className="font-semibold text-text-primary">{g.term}</dt>
                <dd className="text-text-muted">{g.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}

// ─── Role coverage ───────────────────────────────────────────────────────────

function RoleCoverage({ workflowId }) {
  const { data } = useQuery({
    queryKey: ['workflow-catalogue-one', workflowId],
    queryFn: () => api.get(`/v1/workflow-catalogue/${workflowId}`),
    enabled: !!workflowId,
    staleTime: 60_000,
  })
  const wf = data?.data || data
  const roles = wf?.roles || []
  if (!roles.length) return null
  return (
    <section className="rounded-card border border-border bg-surface-raised p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h2 className="text-[13px] font-semibold text-text-primary">Roles this workflow needs</h2>
        <span className="text-xs text-text-muted">checked against your organisation's users</span>
        {wf.unstaffedOrgRoles > 0 && (
          <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-badge bg-status-warn-bg text-status-warn-fg">
            {wf.unstaffedOrgRoles} role{wf.unstaffedOrgRoles === 1 ? '' : 's'} with nobody yet
          </span>
        )}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {roles.map(r => {
          const external = r.side && r.side !== 'ORGANIZATION'
          const ok = external || r.userCount > 0
          return (
            <div key={r.id} className={cn('flex items-center justify-between gap-2 px-3 py-2 rounded-ctl border',
              external ? 'bg-status-info-bg/50 border-status-info-bg'
                : ok ? 'bg-status-pass-bg/50 border-status-pass-bg' : 'bg-status-warn-bg/50 border-status-warn-bg')}>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-primary truncate">{r.name}</p>
                <p className="text-[11px] text-text-muted">step{r.steps.length === 1 ? '' : 's'} {r.steps.join(', ')} · {SIDE_LABEL[r.side] || r.side || 'Organisation'}</p>
              </div>
              <span className={cn('text-xs font-semibold shrink-0 flex items-center gap-1',
                external ? 'text-status-info-fg' : ok ? 'text-status-pass-fg' : 'text-status-warn-fg')}>
                {external ? 'set per record'
                  : ok ? <><CheckCircle2 size={12} /> {r.userCount} user{r.userCount === 1 ? '' : 's'}</>
                  : <><AlertTriangle size={12} /> <Link to="/users" className="underline">nobody — invite</Link></>}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Request a custom workflow ───────────────────────────────────────────────

function RequestForm({ entityType, moduleLabel, workflows, startFrom }) {
  const [from, setFrom] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(null)
  useEffect(() => { if (!from && startFrom) setFrom(startFrom) }, [startFrom]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    mutationFn: () => api.post('/v1/workflow-catalogue/requests', {
      entityType, moduleLabel, startFrom: from || null, neededBy: neededBy || null, message,
    }),
    onSuccess: (r) => { const d = r?.data || r; setDone(d); setMessage(''); toast.success(`Request sent · ${d?.reference || ''}`) },
    onError: (e) => toast.error(e?.message || 'Could not send the request'),
  })

  return (
    <section id="request" className="rounded-card border border-brand-500/30 bg-brand-500/5 p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Request a custom workflow</h2>
        <p className="text-xs text-text-muted mt-0.5">Our team replies by email with a scope and a quote.</p>
      </div>
      {done ? (
        <div className="rounded-ctl bg-status-pass-bg text-status-pass-fg px-3 py-2 text-sm flex items-start gap-2">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> {done.message || 'Request sent.'}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
              Start from
              <select value={from} onChange={e => setFrom(e.target.value)}
                className="h-9 px-2 text-sm font-normal glass-field border border-border rounded-ctl text-text-primary">
                <option value="">A blank workflow</option>
                {workflows.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
              Needed by
              <input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)}
                className="h-9 px-2 text-sm font-normal glass-field border border-border rounded-ctl text-text-primary" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
            What should the workflow do
            <textarea rows={4} value={message} onChange={e => setMessage(e.target.value)}
              placeholder="e.g. add a legal review before closure; our DPO validates instead of the CISO"
              className="px-3 py-2 text-sm font-normal glass-field border border-border rounded-ctl text-text-primary resize-y" />
          </label>
          <div className="flex justify-end">
            <Button icon={Send} loading={send.isPending} loadingText="Sending…"
              disabled={message.trim().length < 10} onClick={() => send.mutate()}>
              Send request
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

// ─── Platform admin: walkthrough video settings ──────────────────────────────

export function DemoSettings({ workflow, entityType }) {
  const qc = useQueryClient()
  const [link, setLink] = useState('')
  const [times, setTimes] = useState({})
  // "What to do" per step, shown in the task's action bar and the guide drawer.
  const [guides, setGuides] = useState(() => Object.fromEntries(workflow.steps.map(s => [s.id, s.guideText || ''])))
  useEffect(() => {
    setGuides(Object.fromEntries(workflow.steps.map(s => [s.id, s.guideText || ''])))
  }, [workflow.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const { data } = useQuery({
    queryKey: ['workflow-demo', workflow.id],
    queryFn: () => api.get(`/v1/workflow-catalogue/${workflow.id}/demo`),
    staleTime: 60_000,
    retry: false,
  })
  const demo = data?.data || data
  useEffect(() => {
    setLink(demo?.kind === 'LINK' ? (demo.url || '') : '')
    setTimes(Object.fromEntries((demo?.chapters || workflow.steps.map(s => ({ stepId: s.id, startSeconds: s.demoStartSeconds })))
      .map(c => [c.stepId, c.startSeconds == null ? '' : mmss(c.startSeconds)])))
  }, [demo, workflow.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toSeconds = (v) => {
    const s = String(v || '').trim()
    if (!s) return null
    if (s.includes(':')) { const [m, sec] = s.split(':'); return (Number(m) || 0) * 60 + (Number(sec) || 0) }
    return Number(s) || 0
  }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['workflow-demo', workflow.id] })
    qc.invalidateQueries({ queryKey: ['workflow-catalogue', entityType] })
  }
  const save = useMutation({
    mutationFn: (body) => api.put(`/v1/workflow-catalogue/${workflow.id}/demo`, body),
    onSuccess: () => {
      refresh()
      qc.invalidateQueries({ queryKey: ['workflow-catalogue-one', workflow.id] })
      toast.success('Walkthrough saved')
    },
    onError: (e) => toast.error(e?.message || 'Could not save'),
  })

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const r = await api.post(`/v1/workflow-catalogue/${workflow.id}/demo/upload-url`, {
        fileName: file.name, mimeType: file.type, fileSizeBytes: file.size,
      })
      const u = r?.data || r
      const put = await fetch(u.presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': u.mimeType || file.type } })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      await save.mutateAsync({ demoVideoKey: u.s3Key })
    } catch (e) {
      toast.error(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="rounded-card border border-dashed border-status-warn-fg/40 bg-status-warn-bg/30 p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-text-primary">Walkthrough and step guidance</h2>
        <span className="text-[10.5px] text-text-muted">Platform admin · every organisation sees this</span>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
          onChange={e => upload(e.target.files?.[0])} />
        <Button size="sm" variant="secondary" icon={Upload} loading={uploading} loadingText="Uploading…"
          onClick={() => fileRef.current?.click()}>
          {demo?.kind === 'FILE' ? 'Replace video file' : 'Upload video file'}
        </Button>
        <span className="text-xs text-text-muted">or link</span>
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://… (YouTube, Vimeo, Loom)"
          className="flex-1 min-w-[220px] h-8 px-2 text-xs glass-field border border-border rounded-ctl text-text-primary" />
        {demo?.kind === 'FILE' && (
          <button type="button" className="text-xs text-status-fail-fg hover:underline"
            onClick={() => save.mutate({ demoVideoKey: '' })}>Remove file</button>
        )}
      </div>
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted mb-1">
          Per step — chapter start (m:ss) and "what to do" for whoever acts on it
        </p>
        <div className="flex flex-col gap-2">
          {workflow.steps.map(s => (
            <div key={s.id} className="flex gap-2 items-start">
              <input value={times[s.id] ?? ''} onChange={e => setTimes(t => ({ ...t, [s.id]: e.target.value }))}
                aria-label={`Chapter start for step ${s.order}`}
                placeholder="—" className="w-14 h-8 px-1.5 text-xs font-mono glass-field border border-border rounded-ctl text-text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary">
                  {s.order}. {s.name}
                  <span className="ml-1.5 text-[10.5px] font-normal text-text-muted">{SIDE_LABEL[s.side] || s.side}</span>
                </p>
                <textarea rows={2} value={guides[s.id] ?? ''} maxLength={2000}
                  onChange={e => setGuides(g => ({ ...g, [s.id]: e.target.value }))}
                  aria-label={`What to do at step ${s.order}`}
                  placeholder="What should the person on this step do, and which button finishes it?"
                  className="mt-1 w-full px-2 py-1.5 text-xs glass-field border border-border rounded-ctl text-text-primary resize-y" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" icon={Save} loading={save.isPending} loadingText="Saving…"
          onClick={() => save.mutate({
            demoVideoUrl: link.trim(),
            chapters: Object.fromEntries(workflow.steps.map(s => [s.id, toSeconds(times[s.id])])),
            guides: Object.fromEntries(workflow.steps.map(s => [s.id, guides[s.id] ?? ''])),
          })}>
          Save video, chapters and guidance
        </Button>
      </div>
    </section>
  )
}
