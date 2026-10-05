/**
 * EntityTreeView — hierarchy view for modules with supports_tree.
 *
 * Used by Personnel (reporting lines) and Asset Inventory (composition). It was
 * written for audit template segregation, never wired up there — TemplateSectionsTab
 * has its own recursive renderer — and those two are its first real consumers,
 * which is why this rewrite can be thorough without regressing anything.
 *
 * ── WHAT WAS WRONG, AND WHY IT MATTERED ───────────────────────────────────
 * The previous version built its tree from the PAGINATED page:
 *
 *     if (!pid || !byId.has(pid)) roots.push(node)
 *
 * With take=20 and 45 people, a node whose manager sat on page 2 failed
 * byId.has() and was promoted to a root. The chart was not merely truncated —
 * it was structurally WRONG, drawing people as top-level who reported to
 * somebody, with no error anywhere. A hierarchy cannot be paginated and remain
 * a hierarchy.
 *
 * It now fetches {apiBasePath}/tree, which returns every node unpaginated, and
 * falls back to the page only when that endpoint is absent — loudly, because
 * silence about a wrong structure is how the original survived.
 *
 * ── WHAT ELSE IT LACKED ───────────────────────────────────────────────────
 * No row actions, no way to add a child in place, no search, no expand/collapse,
 * and orphans silently mixed in with genuine roots. The comparable tools treat a
 * hierarchy as a VIEW of a list rather than a replacement for one, which is why
 * the list toggle is here: a tree is the right way to understand a structure and
 * the wrong way to find one person among forty-five.
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight, ChevronDown, Plus, Pencil, RefreshCw,
  Minus, AlertTriangle, ListTree, Rows3, Unlink,
} from 'lucide-react'
import api from '../../config/axios.config'
import { DynamicBadge } from '../ui/Badge'

/** Depth guard. A cycle should be impossible — both services check on reparent
 *  — but a malformed import must not hang the browser. */
const MAX_DEPTH = 32

export default function EntityTreeView({
  items,
  bp,
  screenConfig,
  onRowClick,
  loading,
  emptyMessage,
  // New, all optional, so any existing caller is unaffected.
  onAddChild,
  onEdit,
  canEdit = false,
  onSwitchToList,
  // The SAME columns the table renders, so a module describes itself once.
  columns = null,
  // The header's search box. The tree used to draw its own underneath, which
  // duplicated the control and read as bolted on.
  search = '',
}) {
  const [expanded, setExpanded] = useState(() => new Set())
  const [touchedExpansion, setTouchedExpansion] = useState(false)
  const query = search || ''

  const apiBasePath = bp?.apiBasePath

  const { data: treeRes, isLoading: treeLoading } = useQuery({
    queryKey: ['entity-tree', apiBasePath],
    queryFn: () => api.get(`${apiBasePath}/tree`),
    enabled: !!apiBasePath,
    retry: false,          // a module without /tree should fall back, not retry
    staleTime: 30_000,
  })

  const truncated = treeRes?.truncated === true

  const nodes = useMemo(() => {
    if (truncated) return []
    const fromTree = treeRes?.nodes
    return Array.isArray(fromTree) && fromTree.length ? fromTree : (items || [])
  }, [treeRes, truncated, items])

  const usingPage = !treeRes?.nodes?.length && (items || []).length > 0

  /**
   * The module's own columns, minus any Actions column the table appends —
   * the tree has its own hover actions and would otherwise render an empty one.
   *
   * Falls back to a single Name column so a module that turns on supports_tree
   * without a layout still renders something coherent.
   */
  const cols = useMemo(() => {
    const base = Array.isArray(columns) && columns.length
      ? columns.filter(c => c.key !== '__actions' && c.key !== '__adopt')
      : [{ key: '__name', label: 'Name' }]
    return base
  }, [columns])

  // The WHOLE screenConfig, exactly as DataTable receives it. Re-wrapping a
  // fragment of it is how the shape assumption crept in: DynamicBadge expects
  // config.components[key].options and nothing less.
  const config = screenConfig?.data || screenConfig || null

  const labelOf = useCallback(
    (n) => n.fullName || n.name || n.title || n.label || `#${n.id}`, [])
  const subOf = useCallback(
    (n) => n.jobTitle || n.assetType || n.personRef || n.assetRef || '', [])
  const countOf = useCallback(
    (n) => n.directReportCount ?? n.childCount ?? 0, [])

  /**
   * Builds the forest, and — unlike before — separates genuine roots from
   * ORPHANS: nodes whose parent id points at something not present. Folding
   * those into the roots is exactly what made the old chart quietly wrong, so
   * they get their own labelled group where they can be seen and fixed.
   */
  const { roots, orphans, byId, total } = useMemo(() => {
    const map = new Map()
    for (const n of nodes) map.set(n.id, { ...n, _children: [] })

    const r = [], o = []
    for (const node of map.values()) {
      const pid = node.parentId ?? node.parent_id ?? null
      if (pid == null) { r.push(node); continue }
      const parent = map.get(pid)
      if (parent) parent._children.push(node)
      else o.push(node)
    }

    const byLabel = (a, b) => labelOf(a).localeCompare(labelOf(b))
    r.sort(byLabel); o.sort(byLabel)
    for (const n of map.values()) n._children.sort(byLabel)

    return { roots: r, orphans: o, byId: map, total: map.size }
  }, [nodes, labelOf])

  /** Ids matching the search, plus every ancestor, so a match stays reachable. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const keep = new Set()
    for (const n of byId.values()) {
      const hay = `${labelOf(n)} ${subOf(n)} ${n.department || ''} ${n.assetRef || ''} ${n.personRef || ''}`
      if (!hay.toLowerCase().includes(q)) continue
      keep.add(n.id)
      let pid = n.parentId ?? n.parent_id ?? null
      let hops = 0
      while (pid != null && hops++ < MAX_DEPTH) {
        keep.add(pid)
        pid = byId.get(pid)?.parentId ?? null
      }
    }
    return keep
  }, [query, byId, labelOf, subOf])

  // Searching expands to reveal matches; clearing restores roots-open, unless
  // the user has set their own expansion, which is theirs to keep.
  useEffect(() => {
    if (visible) setExpanded(new Set(visible))
    else if (!touchedExpansion) setExpanded(new Set(roots.map(r => r.id)))
  }, [visible, roots, touchedExpansion])

  const toggle = (id) => {
    setTouchedExpansion(true)
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const expandAll = () => { setTouchedExpansion(true); setExpanded(new Set([...byId.keys()])) }
  const collapseAll = () => { setTouchedExpansion(true); setExpanded(new Set()) }

  if (loading || treeLoading) return (
    <div className="py-12 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  // Past the node limit the server declines to build a chart, because a
  // 500-node tree is not one. Say so and point at the view that works.
  if (truncated) return (
    <div className="py-12 flex flex-col items-center gap-2 text-center">
      <AlertTriangle size={18} className="text-text-muted opacity-60" />
      <p className="text-sm text-text-primary">{treeRes?.message || 'Too many records to chart.'}</p>
      {onSwitchToList && (
        <button onClick={onSwitchToList}
          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                     border border-border text-text-secondary hover:bg-surface-overlay transition-colors">
          <Rows3 size={12} /> Switch to the list
        </button>
      )}
    </div>
  )

  if (!total) {
    // emptyMessage may be a NODE — UniversalModulePage passes a DynamicState.
    // Wrapping that in the dash-circle produced two stacked empty states and a
    // <div> inside a <p>.
    if (emptyMessage && typeof emptyMessage !== 'string') {
      return <div className="py-4">{emptyMessage}</div>
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-surface-overlay flex items-center justify-center">
          <Minus size={16} className="text-text-muted" />
        </div>
        <p className="text-sm text-text-muted">{emptyMessage || 'Nothing to show'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={expandAll}
          className="px-2.5 py-1.5 text-[11px] rounded-ctl border border-border text-text-muted hover:text-text-primary transition-colors">
          Expand all
        </button>
        <button onClick={collapseAll}
          className="px-2.5 py-1.5 text-[11px] rounded-ctl border border-border text-text-muted hover:text-text-primary transition-colors">
          Collapse all
        </button>
        {onSwitchToList && (
          <button onClick={onSwitchToList}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-ctl
                       border border-border text-text-muted hover:text-text-primary transition-colors">
            <Rows3 size={12} /> List
          </button>
        )}
      </div>

      {/* Deliberately loud: a chart built from one page is WRONG rather than
          incomplete, and saying nothing about that is how the original bug
          lasted this long. */}
      {usingPage && (
        <p className="flex items-start gap-1.5 text-[11px] text-status-warn-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Built from the current page only — this module has no /tree endpoint, so anyone whose
          parent sits on another page is drawn at the top level. Treat the structure as unreliable.
        </p>
      )}

      <div className="flex items-center gap-2 text-[11px] text-text-muted">
        <ListTree size={12} />
        {total} {total === 1 ? 'record' : 'records'}
        {orphans.length > 0 && <span>· {orphans.length} unassigned</span>}
        {query && visible && <span>· {visible.size} matching</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              {cols.map((c, i) => (
                <th key={c.key}
                    className="py-2 pr-3 text-[10px] font-medium uppercase tracking-wide text-text-muted whitespace-nowrap"
                    style={{ ...(c.width ? { width: c.width } : {}), ...(i === 0 ? { paddingLeft: '8px' } : {}) }}>
                  {c.label || c.key}
                </th>
              ))}
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {roots.map(n => (
              <Node key={n.id} node={n} depth={0}
                    expanded={expanded} toggle={toggle} visible={visible}
                    labelOf={labelOf} subOf={subOf} countOf={countOf}
                    onRowClick={onRowClick} onAddChild={onAddChild} onEdit={onEdit}
                    canEdit={canEdit} columns={cols} config={config} />
            ))}
          </tbody>
        </table>
      </div>

      {orphans.length > 0 && (
        <div className="mt-2 pt-3 border-t border-border overflow-x-auto">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted mb-1.5">
            <Unlink size={12} />
            Not under anything
            <span className="font-normal opacity-70">
              — their parent is missing, filtered out, or was removed
            </span>
          </p>
          <table className="w-full text-left">
            <tbody>
              {orphans.map(n => (
                <Node key={n.id} node={n} depth={0}
                      expanded={expanded} toggle={toggle} visible={visible}
                      labelOf={labelOf} subOf={subOf} countOf={countOf}
                      onRowClick={onRowClick} onAddChild={onAddChild} onEdit={onEdit}
                      canEdit={canEdit} columns={cols} config={config} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Node({ node, depth, expanded, toggle, visible, labelOf, subOf, countOf,
                onRowClick, onAddChild, onEdit, canEdit, columns, config }) {
  if (depth > MAX_DEPTH) return null
  if (visible && !visible.has(node.id)) return null

  const kids = node._children || []
  const isOpen = expanded.has(node.id)
  const count = countOf(node)

  return (
    <>
      <tr
        className="group border-b border-border/40 hover:bg-surface-overlay transition-colors cursor-pointer"
        onClick={() => onRowClick?.(node)}>

        {/* The hierarchy lives in the FIRST cell only. Indenting the whole row
            would break column alignment, which is the thing that makes a tree
            table readable at all — every other column stays in its lane. */}
        <td className="py-1.5 pr-3" style={{ paddingLeft: `${depth * 18 + 8}px` }}>
          <div className="flex items-center gap-1.5">
            {kids.length > 0 ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggle(node.id) }}
                className="p-0.5 rounded text-text-muted hover:text-text-primary shrink-0">
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <span className="text-xs text-text-primary truncate">{labelOf(node)}</span>
            {count > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-overlay text-text-muted shrink-0">
                {count}
              </span>
            )}
          </div>
        </td>

        {/* Every remaining column from columns_json, rendered by the SAME
            renderCell the table uses — so badges, dates, numbers and the
            progress bar all behave identically in both views, and a column
            added to the layout appears here without touching this file. */}
        {columns.slice(1).map(col => (
          <td key={col.key} className="py-1.5 pr-3 align-middle"
              style={col.width ? { width: col.width } : undefined}>
            {renderTreeCell(col, node, config)}
          </td>
        ))}

        <td className="py-1.5 pr-2 text-right">
          <span className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && onAddChild && (
              <button
                title="Add under this one"
                onClick={(e) => { e.stopPropagation(); onAddChild(node) }}
                className="p-1 rounded text-text-muted hover:text-brand-ink hover:bg-brand-500/10">
                <Plus size={11} />
              </button>
            )}
            {canEdit && onEdit && node.editable !== false && (
              <button
                title="Open"
                onClick={(e) => { e.stopPropagation(); onEdit(node) }}
                className="p-1 rounded text-text-muted hover:text-text-primary">
                <Pencil size={11} />
              </button>
            )}
          </span>
        </td>
      </tr>

      {isOpen && kids.map(k => (
        <Node key={k.id} node={k} depth={depth + 1}
              expanded={expanded} toggle={toggle} visible={visible}
              labelOf={labelOf} subOf={subOf} countOf={countOf}
              onRowClick={onRowClick} onAddChild={onAddChild} onEdit={onEdit}
              canEdit={canEdit} columns={columns} config={config} />
      ))}
    </>
  )
}

/**
 * Cell rendering for the tree.
 *
 * ── DO NOT HAND-ROLL THE BADGE LOOKUP ─────────────────────────────────────
 * The first version did `config.components[col.componentKey].find(...)`,
 * assuming components mapped a key to an ARRAY of options. It does not — the
 * shape is `components[key].options`, an object wrapping the array — so .find
 * was undefined and every badge column threw, taking the whole tree down with
 * it. DataTable gets this right by delegating to DynamicBadge, which already
 * reads colorTag and label from the same config, so the tree delegates too.
 *
 * The remaining branches mirror DataTable's own: date, number, boolean, then a
 * plain-value default. Anything DataTable renders specially and this does not
 * degrades to text rather than breaking.
 */
function renderTreeCell(col, row, config) {
  const val = row[col.key]
  if (val === null || val === undefined || val === '') {
    return <span className="text-text-muted">—</span>
  }

  const badgeKey = col.componentKey || col.key
  const hasOptions = config?.components?.[badgeKey]?.options?.length > 0
  if (hasOptions) {
    return <DynamicBadge value={val} componentKey={badgeKey} config={config} />
  }

  if (col.type === 'date') {
    const d = new Date(val)
    return (
      <span className="font-mono text-[11px] text-text-secondary">
        {isNaN(d.getTime()) ? String(val) : d.toLocaleDateString()}
      </span>
    )
  }

  if (col.type === 'number') {
    return <span className="font-mono text-[11px] tabular-nums text-text-secondary">{val}</span>
  }

  if (typeof val === 'boolean') {
    return <span className="text-[11px] text-text-secondary">{val ? 'Yes' : 'No'}</span>
  }

  return <span className="text-[11px] text-text-secondary truncate">{String(val)}</span>
}