/**
 * AutomationPayloadView — renders the raw_payload an integration check recorded.
 *
 * For an API-collected control this payload IS the evidence: the equivalent of
 * a screenshot for a manually-evidenced control. An auditor asking "how do you
 * know every bucket is encrypted?" needs the bucket list and the algorithm, not
 * a green badge and a one-line summary.
 *
 * The payload shape is per-check (AwsS3EncryptionCheck writes `buckets`,
 * AwsCloudTrailCheck writes `trails`, and so on), so nothing here is hardcoded
 * to a vendor: scalars render as a fact grid, the first array of objects renders
 * as a table, and the untouched JSON stays one click away.
 */
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Code2, Check, X } from 'lucide-react'
import { cn } from '../../lib/cn'

const HIDE_KEYS = new Set(['checkKey', 'checkedAt'])

function prettyKey(k) {
  return k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase())
}

function BoolCell({ value }) {
  return value
    ? <Check size={10} className="text-status-pass-fg" />
    : <X size={10} className="text-status-fail-fg" />
}

function renderValue(v) {
  if (v === null || v === undefined || v === '') return <span className="text-text-muted">—</span>
  if (typeof v === 'boolean') return <BoolCell value={v} />
  return String(v)
}

export function AutomationPayloadView({ payload, className }) {
  const [showRaw, setShowRaw] = useState(false)

  const parsed = useMemo(() => {
    if (!payload) return null
    if (typeof payload === 'object') return payload
    try { return JSON.parse(payload) } catch { return null }
  }, [payload])

  if (!payload) return null

  // Unparseable payload — show it verbatim rather than hiding it. Evidence the
  // reviewer cannot see is not evidence.
  if (!parsed || typeof parsed !== 'object') {
    return (
      <pre className={cn('text-[9px] font-mono text-text-muted whitespace-pre-wrap break-all', className)}>
        {String(payload)}
      </pre>
    )
  }

  const scalars = Object.entries(parsed).filter(
    ([k, v]) => !HIDE_KEYS.has(k) && (v === null || typeof v !== 'object'),
  )
  const tableEntry = Object.entries(parsed).find(
    ([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null,
  )
  const columns = tableEntry
    ? [...new Set(tableEntry[1].flatMap(row => Object.keys(row)))]
    : []

  return (
    <div className={cn('space-y-2', className)}>

      {scalars.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
          {scalars.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <p className="text-[8px] uppercase tracking-wide text-text-muted truncate">{prettyKey(k)}</p>
              <p className="text-[10px] text-text-primary truncate">{renderValue(v)}</p>
            </div>
          ))}
        </div>
      )}

      {tableEntry && (
        <div className="overflow-x-auto">
          <p className="text-[8px] uppercase tracking-wide text-text-muted mb-1">
            {prettyKey(tableEntry[0])} ({tableEntry[1].length})
          </p>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/40">
                {columns.map(c => (
                  <th key={c} className="text-left font-medium text-text-muted py-1 pr-3 whitespace-nowrap">
                    {prettyKey(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableEntry[1].slice(0, 25).map((row, i) => (
                <tr key={i} className="border-b border-border/20 last:border-0">
                  {columns.map(c => (
                    <td key={c} className="py-1 pr-3 text-text-primary whitespace-nowrap">
                      {renderValue(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {tableEntry[1].length > 25 && (
            <p className="text-[9px] text-text-muted mt-1">
              Showing first 25 of {tableEntry[1].length} — full set in the raw payload.
            </p>
          )}
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); setShowRaw(v => !v) }}
        className="flex items-center gap-1 text-[9px] text-text-muted hover:text-text-primary"
      >
        {showRaw ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        <Code2 size={9} />
        Raw API response
      </button>

      {showRaw && (
        <pre className="text-[9px] font-mono text-text-muted bg-surface-overlay rounded-ctl p-2 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default AutomationPayloadView