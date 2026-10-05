import { useDashboardWidgets } from '../../hooks/useUIConfig'
import { DashboardGrid } from '../../components/charts/DashboardWidget'
import { Card, CardBody } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { useSelector } from 'react-redux'
import { selectAuth, selectRoleSides } from '../../store/slices/authSlice'
import { useMyTasks } from '../../hooks/useWorkflow'
import { cn } from '../../lib/cn'
import { useParams } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sliders, Plus, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../config/axios.config'

/**
 * DashboardPage — main landing page with widget grid and task inbox.
 *
 * FIXED: tasks?.items?.length → pendingCount derived from plain array.
 *
 * WHY: useMyTasks now returns a plain TaskInstanceResponse[] (not a paginated
 *   object with an items field). tasks?.items?.length was always undefined,
 *   so pendingCount was always 0 and the greeting never showed the task count.
 *
 * The Task Inbox and Action Items cards were removed: both duplicate a
 * sidebar entry and together pushed every chart below the fold.
 */
/**
 * A sketch of what a widget will look like, for the picker.
 *
 * Deliberately NOT the real widget: rendering forty live ones means forty
 * requests the moment the dialog opens, most for widgets nobody will add. The
 * sketch shows the SHAPE — a number, bars, a ring, a bar of progress — which is
 * the thing you are choosing between. A list of titles does not tell you
 * whether you are adding a donut or a digit.
 */
function WidgetSketch({ type }) {
  const bar = 'rounded-sm bg-brand-500/30'
  switch (type) {
    case 'KPI_CARD':
      return (
        <div className="h-full flex flex-col justify-center gap-1.5 px-2">
          <div className="h-5 w-10 rounded bg-brand-500/40" />
          <div className="h-1.5 w-16 rounded bg-text-muted/20" />
        </div>
      )
    case 'BAR_CHART':
      return (
        <div className="h-full flex items-end justify-center gap-1 px-2 pb-2">
          {[9, 16, 6, 20, 12].map((h, i) => (
            <div key={i} className={bar} style={{ height: h * 1.4, width: 7 }} />
          ))}
        </div>
      )
    case 'LINE_CHART': case 'AREA_CHART':
      return (
        <svg viewBox="0 0 60 30" className="h-full w-full p-2" preserveAspectRatio="none">
          <polyline points="0,24 12,14 24,18 36,7 48,12 60,4" fill="none"
                    stroke="rgb(var(--color-brand-500))" strokeOpacity="0.5" strokeWidth="2" />
        </svg>
      )
    case 'PIE_CHART': case 'DONUT_CHART':
      return (
        <div className="h-full flex items-center justify-center">
          <div className={cn('rounded-full border-[6px] border-brand-500/35',
            type === 'DONUT_CHART' ? 'w-10 h-10' : 'w-10 h-10 border-[20px]')}
            style={{ borderTopColor: 'rgb(var(--color-brand-500))' }} />
        </div>
      )
    case 'PROGRESS_BAR':
      return (
        <div className="h-full flex flex-col justify-center gap-1.5 px-3">
          <div className="h-1.5 w-full rounded-full bg-text-muted/15 overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-brand-500/50" />
          </div>
          <div className="h-1.5 w-8 rounded bg-text-muted/20" />
        </div>
      )
    default:
      return (
        <div className="h-full flex flex-col justify-center gap-1 px-3">
          {[0, 1, 2].map(i => <div key={i} className="h-1.5 w-full rounded bg-text-muted/15" />)}
        </div>
      )
  }
}

export default function DashboardPage() {
  /**
   * ── ONE PAGE FOR EVERY DASHBOARD ────────────────────────────────────────
   * /dashboard              → the landing page, as before
   * /dashboard/risk         → a module dashboard
   * /dashboard/u42-my-week  → somebody's personal one
   *
   * All three are rows in `dashboards` differing by scope, so all three render
   * here. That is what keeps opening dashboard authoring to users a UI job
   * rather than a routing job.
   */
  const { dashboardKey: routeKey } = useParams()

  /**
   * /dashboard with no key means the GLOBAL dashboard, not "every widget".
   *
   * The legacy useDashboardWidgets hook calls findActiveByTenant, which filters
   * on is_active and tenant only — it does not know dashboard_id exists. So the
   * landing page was rendering every active widget in the tenant, module ones
   * included: thirty-odd cards with the charts pushed below the fold.
   *
   * Defaulting the key to 'global' routes it through the dashboards table like
   * everything else, so the landing page shows what was curated for it.
   */
  const dashboardKey = routeKey || 'global'
  const isLanding = !routeKey

  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard', dashboardKey],
    queryFn: () => api.get(`/v1/dashboards/${dashboardKey}`),
    enabled: !!dashboardKey,
    retry: false,          // a missing dashboard should fall back, not retry
  })

  // Kept ONLY as a fallback for an installation that has not run the dashboards
  // migration yet: if 'global' does not resolve, the page still renders rather
  // than going blank.
  const { data: legacyWidgets = [], isLoading: legacyLoading } = useDashboardWidgets()

  /**
   * ── EVERY DASHBOARD RENDERS FROM THE DASHBOARD ENDPOINT ──────────────────
   * Including the landing page. dashboardKey already defaults to 'global', so
   * /dashboard fetches a real dashboard like any other — it was simply
   * ignoring it and using the legacy hook instead.
   *
   * useDashboardWidgets returns EVERY widget the tenant can see, with no
   * dashboard filtering at all. That is why /dashboard showed the entire
   * catalogue — people on the roster, mean time to detect, the lot — and why
   * "Assessments sent" and "Reviews overdue" each appeared TWICE the moment a
   * dashboard was customised: the platform widget and the tenant's copy of it
   * are two rows, and only getDashboard knows that one shadows the other.
   *
   * The legacy hook is kept as a last resort for a deployment where the global
   * dashboard row does not exist yet, and nowhere else.
   */
  const serverWidgets = Array.isArray(dash?.widgets)
    ? dash.widgets
    : (isLanding ? legacyWidgets : [])

  const widgetsLoading = dashLoading

  // ── ARRANGING IS A DRAFT, NOT A STREAM OF WRITES ──────────────────────────
  // The working copy is local, so a drag is instant and Done is a real cancel
  // rather than a second round of writes undoing the first. Order and width
  // reach the server only on Save; add and remove are immediate, because both
  // need an id back before anything else can happen to them.
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(null)
  const [picking, setPicking] = useState(false)

  const widgets = draft ?? serverWidgets
  useEffect(() => { if (!editing) setDraft(null) }, [editing])

  const isPlatform = dash?.platformProvided === true

  /**
   * Arranging a PLATFORM dashboard forks it first, silently.
   *
   * A separate Customise button made the copy an event the user had to
   * understand before they could move a card — and "Customise" gave no hint
   * that it would duplicate a dozen widgets. Nobody wants to adopt a
   * dashboard; they want to move one card.
   *
   * So the fork is a consequence of the first edit, not a prerequisite for it,
   * and the toast says plainly what happened. The copy is scoped to THIS
   * dashboard only — the module you are looking at — and never touches the
   * platform rows anyone else sees.
   */
  const customise = useMutation({
    mutationFn: () => api.post(`/v1/dashboards/${dashboardKey}/customise`),
    onSuccess: () => {
      toast.success(`${dash?.name || 'This dashboard'} is now your organisation's copy — edits stay here`)
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardKey] })
      setEditing(true)
    },
    onError: e => toast.error(e?.message || 'Could not make this dashboard editable'),
  })

  const beginArranging = () => {
    if (isPlatform) customise.mutate()
    else setEditing(true)
  }

  const saveLayout = useMutation({
    mutationFn: (rows) => api.put(`/v1/dashboards/${dash.id}/layout`, rows),
    onSuccess: () => {
      toast.success('Layout saved')
      setEditing(false); setDraft(null)
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardKey] })
    },
    onError: e => toast.error(e?.message || 'Could not save the layout'),
  })

  const removeWidget = useMutation({
    mutationFn: (id) => api.delete(`/v1/dashboards/widgets/${id}`),
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: ['dashboard', dashboardKey] }) },
    onError: e => toast.error(e?.message || 'Could not remove that widget'),
  })

  const addWidget = useMutation({
    mutationFn: (widgetKey) =>
      api.post(`/v1/dashboards/${dash.id}/widgets`, { fromWidgetKey: widgetKey }),
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: ['dashboard', dashboardKey] }) },
    onError: e => toast.error(e?.message || 'Could not add that widget'),
  })

  const { data: catalogue = [] } = useQuery({
    queryKey: ['widget-catalogue'],
    queryFn: () => api.get('/v1/dashboards/widget-catalogue'),
    enabled: picking,
  })

  // Reorder within a band. The other band keeps its order untouched, because
  // tiles and charts lay out separately and moving a chart must not disturb
  // the numbers above it.
  const onReorder = (band, from, to) => {
    const moved = [...band]
    const [row] = moved.splice(from, 1)
    moved.splice(to, 0, row)
    const keys = new Set(band.map(w => w.widgetKey))
    const others = widgets.filter(w => !keys.has(w.widgetKey))
    setDraft(band[0]?.widgetType === 'KPI_CARD' ? [...moved, ...others] : [...others, ...moved])
  }

  const onResize = (widget, cols) =>
    setDraft(widgets.map(w => w.widgetKey === widget.widgetKey ? { ...w, gridCols: cols } : w))

  const alreadyOn = useMemo(() => new Set(widgets.map(w => w.widgetKey)), [widgets])
  const { fullName } = useSelector(selectAuth)
  const userSides = useSelector(selectRoleSides)
  const { data: tasksData } = useMyTasks({ status: 'PENDING' })

  const pendingTasks = Array.isArray(tasksData) ? tasksData : (tasksData?.items ?? [])
  const pendingCount = pendingTasks.length

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
      {/* A named dashboard shows its own title; the landing page greets.
          Greeting somebody by name on the Risk Dashboard would be odd, and the
          dashboard's own description is the more useful line there. */}
      {!isLanding ? (
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            {dash?.name || 'Dashboard'}
          </h1>
          {dash?.description && (
            <p className="text-sm text-text-muted mt-0.5">{dash.description}</p>
          )}

        </div>
      ) : (
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            Good {getGreeting()}, <span className="text-brand-ink">{fullName?.split(' ')[0]}</span>
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            {pendingCount > 0
              ? `You have ${pendingCount} pending task${pendingCount > 1 ? 's' : ''} awaiting action.`
              : 'Here\'s your platform overview.'}
          </p>
        </div>
      )}


        {/* ONE control, on EVERY dashboard including the landing page.
            
            It previously lived inside the named-dashboard branch, so
            /dashboard — the one people open most — had no way to arrange
            anything at all.
            
            And it is one button, not two. A separate Customise made the fork
            something the user had to understand before they could move a card,
            and the word gave no hint that it would duplicate a dozen widgets.
            Arrange forks on demand and says so afterwards. */}
        <div className="flex items-center gap-2 shrink-0">
          {!editing && dash?.id && (
            <button onClick={beginArranging} disabled={customise.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                         border border-border text-text-secondary hover:bg-surface-overlay transition-colors">
              <Sliders size={12} /> {customise.isPending ? 'Preparing…' : 'Arrange'}
            </button>
          )}
          {editing && (
            <>
              <button onClick={() => setPicking(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                           border border-border text-text-secondary hover:bg-surface-overlay transition-colors">
                <Plus size={12} /> Add widget
              </button>
              <button onClick={() => { setEditing(false); setDraft(null) }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                           border border-border text-text-muted hover:text-text-primary transition-colors">
                <X size={12} /> Done
              </button>
              <button disabled={saveLayout.isPending}
                onClick={() => saveLayout.mutate(widgets.map(w => ({ id: w.id, gridCols: w.gridCols })))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                           bg-brand-500 text-white disabled:opacity-60">
                <Check size={12} /> {saveLayout.isPending ? 'Saving…' : 'Save layout'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Widget grid — show skeleton while loading, empty state if no widgets */}
      {widgetsLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-28 rounded-card border border-border bg-surface-raised animate-pulse" />
          ))}
        </div>
      ) : widgets.length > 0 ? (
        <DashboardGrid
          widgets={widgets} userSides={userSides}
          editing={editing}
          onRemove={w => removeWidget.mutate(w.id)}
          onResize={onResize}
          onReorder={onReorder}
        />
      ) : !isLanding ? (
        <Card>
          <CardBody>
            <p className="text-sm text-text-muted text-center py-8">
              This dashboard has no widgets you can see yet. Widgets are added in
              the Dashboard Designer.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/* Task Inbox and Action Items removed.
          
          Both duplicate a sidebar entry one click away — My Tasks and Action
          Items — and together they pushed every chart below the fold. A
          dashboard should answer "how are we doing"; a work queue answers
          "what do I do next", and mixing them means neither is read.
          
          The greeting still reports the pending count, so the number is not
          lost, just not given a third of the page. */}
      {/* Catalogue. Grouped by the module the widget reads from, because a
          flat list of sixty is not a picker. Widgets already on this dashboard
          are shown as present rather than hidden — otherwise you cannot tell
          whether you already added one. */}
      {/* Catalogue, in the app's own Modal.
          
          The first version hand-rolled a panel with bg-surface-primary, which
          is translucent in this theme — the dashboard showed straight through
          and the two sets of text overlapped. Modal already solves this with
          glass-overlay and shadow-overlay, and it was there all along.
          
          Grouped by the module each widget reads from, because a flat list of
          sixty is not a picker. Widgets already present are shown greyed rather
          than hidden, so you can tell you already added one. */}
      <Modal open={picking} onClose={() => setPicking(false)}
             title="Add a widget"
             subtitle="Pick from everything this organisation can chart"
             size="lg">
        <div className="flex-1 overflow-y-auto p-4 min-h-[240px] max-h-[60vh]">
          {catalogue.length === 0 && (
            <p className="text-xs text-text-muted text-center py-10">Nothing available to add.</p>
          )}

          {/* Grouped by the module each widget reads from. A flat list of sixty
              is not a picker, and the group is free — it comes from the
              endpoint's own path. */}
          {Object.entries(
            catalogue.reduce((acc, c) => {
              (acc[c.group] ||= []).push(c)
              return acc
            }, {})
          ).map(([group, items]) => (
            <div key={group} className="mb-5 last:mb-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted mb-2">
                {String(group).replace(/-/g, ' ')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {items.map(c => {
                  const on = alreadyOn.has(c.widgetKey)
                  return (
                    <button key={c.widgetKey} disabled={on || addWidget.isPending}
                      onClick={() => addWidget.mutate(c.widgetKey)}
                      title={c.subtitle || c.title}
                      className={cn(
                        'text-left rounded-card border overflow-hidden transition-all',
                        on
                          ? 'border-border opacity-40 cursor-default'
                          : 'border-border hover:border-brand-500/50 hover:shadow-sm')}>
                      <div className="h-[52px] bg-surface-overlay/50 border-b border-border">
                        <WidgetSketch type={c.widgetType} />
                      </div>
                      <div className="p-2">
                        <p className="text-[11px] font-medium text-text-primary truncate">{c.title}</p>
                        <p className="text-[10px] text-text-muted truncate">
                          {on ? 'Already on this dashboard'
                              : String(c.widgetType).replace(/_/g, ' ').toLowerCase()}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Modal>


    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}