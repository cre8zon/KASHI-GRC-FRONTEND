/**
 * EntityTreeView — recursive tree renderer for blueprint modules with supportsTree=true.
 *
 * NEW FILE — does not modify any existing component.
 *
 * Renders a collapsible tree from flat API data that has { id, parentId, ... } shape.
 * Drop-in replacement for DataTable in UniversalModulePage when bp.supportsTree is true.
 *
 * CONFIGURATION (zero code per module):
 *   In Module Blueprints UI, toggle supportsTree = true.
 *   The API for that module must return items with a `parentId` field (null = root).
 *   The tree renderer uses `name` field by default — configure `treeLabelField` in
 *   the blueprint's fieldsSchemaJson to use a different field.
 *
 * PROPS:
 *   items          — flat array of records from the API
 *   bp             — ModuleBlueprint object
 *   screenConfig   — screen config from Screen Designer (for column config)
 *   onRowClick     — called with (item) when a row is clicked
 *   loading        — show skeleton
 *
 * TREE BEHAVIOUR:
 *   - Root nodes: parentId === null or parentId === undefined
 *   - Depth-0 nodes are bold; depth-1+ are indented progressively
 *   - All nodes collapsed by default beyond depth 1
 *   - Click anywhere on the row to open the entity (calls onRowClick)
 *   - Chevron click expands/collapses without triggering onRowClick
 *   - "No children" leaf nodes show a dot instead of chevron
 *
 * CUSTOMISATION via blueprint fieldsSchemaJson:
 *   {
 *     "treeConfig": {
 *       "labelField":  "name",         // field to show as the node label (default: "name")
 *       "codeField":   "sectionCode",  // optional prefix shown in mono text (default: null)
 *       "statusField": "status",       // optional — shows a badge next to the label
 *       "countField":  "controlCount"  // optional — shows "(N)" count suffix
 *     }
 *   }
 */
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Minus, Loader2 } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { cn }   from '../../lib/cn'

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(items) {
  if (!items?.length) return []
  const byId  = new Map(items.map(item => [item.id, { ...item, _children: [] }]))
  const roots = []
  for (const node of byId.values()) {
    const pid = node.parentId ?? node.parent_id ?? null
    if (!pid || !byId.has(pid)) {
      roots.push(node)
    } else {
      byId.get(pid)._children.push(node)
    }
  }
  const sort = (nodes) => {
    nodes.sort((a, b) => (a.orderNo ?? a.order_no ?? a.sortOrder ?? 0)
                       - (b.orderNo ?? b.order_no ?? b.sortOrder ?? 0)
                       || String(a.name ?? '').localeCompare(String(b.name ?? '')))
    nodes.forEach(n => sort(n._children))
    return nodes
  }
  return sort(roots)
}

// ── Status color map (semantic fallback) ──────────────────────────────────────

const STATUS_COLOR = {
  DRAFT: 'gray', ACTIVE: 'green', PUBLISHED: 'green', OPEN: 'blue',
  IN_PROGRESS: 'indigo', PLANNING: 'amber', COMPLETED: 'green',
  CANCELLED: 'red', ON_HOLD: 'amber', CLOSED: 'gray',
  FIELDWORK: 'blue', EVIDENCE_REVIEW: 'purple', DRAFT_REPORT: 'purple',
  FINAL_REPORT: 'teal', EFFECTIVE: 'green', INEFFECTIVE: 'red',
  NOT_TESTED: 'gray', PARTIALLY_EFFECTIVE: 'amber',
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function TreeNode({ node, depth, treeConfig, onRowClick }) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren     = node._children.length > 0

  const labelField  = treeConfig?.labelField  || 'name'
  const codeField   = treeConfig?.codeField   || null
  const statusField = treeConfig?.statusField || 'status'
  const countField  = treeConfig?.countField  || null

  const label  = node[labelField]  ?? node.name ?? node.title ?? `#${node.id}`
  const code   = codeField ? node[codeField] : null
  const status = node[statusField]
  const count  = countField ? node[countField] : null

  const indent = 16 + depth * 20  // px left padding

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-2 pr-4 rounded-ctl transition-colors group cursor-pointer',
          'hover:bg-surface-overlay',
          depth === 0 && 'font-medium',
        )}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => onRowClick?.(node)}
      >
        {/* Expand / collapse chevron */}
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          className={cn(
            'shrink-0 h-5 w-5 flex items-center justify-center rounded transition-colors',
            hasChildren
              ? 'text-text-muted hover:text-text-primary hover:bg-surface-overlay'
              : 'text-transparent cursor-default',
          )}
        >
          {hasChildren
            ? open
              ? <ChevronDown  size={13} />
              : <ChevronRight size={13} />
            : <Minus size={9} className="text-border" />}
        </button>

        {/* Code prefix (e.g. A.9.1) */}
        {code && (
          <span className="font-mono text-[10px] text-text-muted shrink-0">{code}</span>
        )}

        {/* Label */}
        <span className={cn(
          'flex-1 min-w-0 text-sm truncate',
          depth === 0 ? 'text-text-primary font-semibold' : 'text-text-secondary',
        )}>
          {label}
        </span>

        {/* Count badge */}
        {count != null && (
          <span className="text-[10px] text-text-muted font-mono shrink-0">
            ({count})
          </span>
        )}

        {/* Status badge */}
        {status && (
          <Badge
            colorTag={STATUS_COLOR[status] || 'gray'}
            size="sm"
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {String(status).replace(/_/g, ' ')}
          </Badge>
        )}
      </div>

      {/* Children */}
      {open && hasChildren && (
        <div>
          {node._children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              treeConfig={treeConfig}
              onRowClick={onRowClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TreeSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-4">
      {[0, 1, 2, 0, 1, 1, 2, 0].map((depth, i) => (
        <div
          key={i}
          className="h-8 rounded-ctl bg-surface-overlay animate-pulse"
          style={{ marginLeft: `${16 + depth * 20}px` }}
        />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {object[]}      props.items        - flat list of records with id + parentId
 * @param {object}        props.bp           - ModuleBlueprint
 * @param {object|null}   [props.screenConfig] - Screen Designer config
 * @param {function}      [props.onRowClick] - called with (item) on row click
 * @param {boolean}       [props.loading]
 * @param {string}        [props.emptyMessage]
 */
export default function EntityTreeView({
  items,
  bp,
  screenConfig,
  onRowClick,
  loading = false,
  emptyMessage,
}) {
  // Parse treeConfig from blueprint's fieldsSchemaJson
  const treeConfig = useMemo(() => {
    try {
      const schema = JSON.parse(bp?.fieldsSchemaJson || '{}')
      return schema.treeConfig || null
    } catch {
      return null
    }
  }, [bp?.fieldsSchemaJson])

  const tree = useMemo(() => buildTree(items ?? []), [items])

  if (loading) return <TreeSkeleton />

  if (!tree.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-surface-overlay flex items-center justify-center">
          <Minus size={16} className="text-text-muted" />
        </div>
        <p className="text-sm text-text-muted">
          {emptyMessage || `No ${bp?.displayNamePlural?.toLowerCase() || 'records'} found`}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-border bg-surface-raised overflow-hidden">
      {/* Column header strip */}
      <div className="flex items-center px-4 py-2 border-b border-border bg-surface-overlay">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          {bp?.displayNamePlural || 'Records'}
        </span>
        <span className="ml-auto text-[10px] text-text-muted">
          {items?.length ?? 0} total
        </span>
      </div>

      {/* Tree */}
      <div className="divide-y divide-border/30">
        {tree.map(root => (
          <TreeNode
            key={root.id}
            node={root}
            depth={0}
            treeConfig={treeConfig}
            onRowClick={onRowClick}
          />
        ))}
      </div>
    </div>
  )
}