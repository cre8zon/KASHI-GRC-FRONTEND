import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Users, ShieldAlert } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * SodRulesModal — structured editor for WorkflowStep.sodRulesJson.
 *
 * Supported rule types:
 *   EXCLUDE_ENTITY_OWNER   — entity owner cannot act on this step
 *   EXCLUDE_PREVIOUS_ACTOR — whoever acted on the previous step cannot act here
 *   EXCLUDE_ROLE           — users holding a specific role cannot act here (requires roleId)
 *
 * Usage:
 *   <SodRulesModal
 *     open={sodModalOpen}
 *     onClose={() => setSodModalOpen(false)}
 *     value={step.sodRulesJson}
 *     onChange={(json) => onChange?.({ ...step, sodRulesJson: json })}
 *   />
 */

const RULE_TYPES = [
  {
    type: 'EXCLUDE_ENTITY_OWNER',
    label: 'Exclude entity owner',
    description: 'The person who owns this record (e.g. issue owner) cannot act on this step. Prevents validating your own work.',
    hasRoleId: false,
  },
  {
    type: 'EXCLUDE_PREVIOUS_ACTOR',
    label: 'Exclude previous actor',
    description: 'Whoever acted on the immediately preceding step cannot act here. Enforces four-eyes principle.',
    hasRoleId: false,
  },
  {
    type: 'EXCLUDE_ROLE',
    label: 'Exclude role',
    description: 'All users holding a specific role cannot act on this step.',
    hasRoleId: true,
  },
]

function parseRules(json) {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}

export function SodRulesModal({ open, onClose, value, onChange }) {
  const [rules, setRules] = useState([])
  const [addingType, setAddingType] = useState(null)
  const [newRoleId, setNewRoleId] = useState('')
  const [newReason, setNewReason] = useState('')

  useEffect(() => {
    if (open) {
      setRules(parseRules(value))
      setAddingType(null)
      setNewRoleId('')
      setNewReason('')
    }
  }, [open, value])

  const addRule = () => {
    if (!addingType) return
    const typeDef = RULE_TYPES.find(t => t.type === addingType)
    if (!typeDef) return
    if (typeDef.hasRoleId && !newRoleId) return

    const rule = {
      type: addingType,
      ...(newReason ? { reason: newReason } : {}),
      ...(typeDef.hasRoleId ? { roleId: parseInt(newRoleId) } : {}),
    }

    // Prevent duplicates for non-role types
    const exists = rules.some(r => r.type === addingType && (!typeDef.hasRoleId || r.roleId === parseInt(newRoleId)))
    if (!exists) setRules(r => [...r, rule])

    setAddingType(null)
    setNewRoleId('')
    setNewReason('')
  }

  const removeRule = (idx) => setRules(r => r.filter((_, i) => i !== idx))

  const handleSave = () => {
    onChange(rules.length > 0 ? JSON.stringify(rules) : null)
  }

  const handleClear = () => {
    setRules([])
    onChange(null)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-primary border border-border rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={16} className="text-orange-400" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">SOD Rules</h2>
              <p className="text-xs text-text-muted mt-0.5">Segregation of Duties — restrict who can act on this step</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Active rules */}
          {rules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">Active rules</p>
              {rules.map((rule, idx) => {
                const typeDef = RULE_TYPES.find(t => t.type === rule.type)
                return (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/8 border border-orange-500/20">
                    <Users size={14} className="text-orange-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary">{typeDef?.label || rule.type}</p>
                      {rule.roleId && (
                        <p className="text-[10px] text-text-muted mt-0.5">Role ID: {rule.roleId}</p>
                      )}
                      {rule.reason && (
                        <p className="text-[10px] text-text-muted mt-0.5 italic">"{rule.reason}"</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeRule(idx)}
                      className="text-text-muted hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {rules.length === 0 && !addingType && (
            <div className="text-center py-8 text-text-muted">
              <ShieldAlert size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">No SOD rules configured. Any user with the actor role can act on this step.</p>
            </div>
          )}

          {/* Add rule */}
          {!addingType ? (
            <div>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Add rule</p>
              <div className="space-y-1.5">
                {RULE_TYPES.map(typeDef => {
                  const alreadyAdded = !typeDef.hasRoleId && rules.some(r => r.type === typeDef.type)
                  return (
                    <button
                      key={typeDef.type}
                      disabled={alreadyAdded}
                      onClick={() => setAddingType(typeDef.type)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg border transition-colors',
                        alreadyAdded
                          ? 'border-border bg-surface-overlay opacity-40 cursor-not-allowed'
                          : 'border-border hover:border-orange-500/40 hover:bg-orange-500/5 cursor-pointer'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-text-primary">{typeDef.label}</p>
                        {alreadyAdded
                          ? <span className="text-[10px] text-text-muted">Already active</span>
                          : <Plus size={12} className="text-orange-400" />
                        }
                      </div>
                      <p className="text-[10px] text-text-muted mt-0.5">{typeDef.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="border border-orange-500/30 rounded-lg p-4 bg-orange-500/5 space-y-3">
              <p className="text-xs font-semibold text-orange-400">
                {RULE_TYPES.find(t => t.type === addingType)?.label}
              </p>

              {RULE_TYPES.find(t => t.type === addingType)?.hasRoleId && (
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Role ID *</label>
                  <input
                    type="number"
                    value={newRoleId}
                    onChange={e => setNewRoleId(e.target.value)}
                    placeholder="e.g. 29"
                    className="mt-1 w-full px-3 py-1.5 text-xs rounded-md bg-surface-overlay border border-border text-text-primary focus:outline-none focus:border-brand-500"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] text-text-muted uppercase tracking-wide">Reason (optional)</label>
                <input
                  type="text"
                  value={newReason}
                  onChange={e => setNewReason(e.target.value)}
                  placeholder="e.g. Cannot validate own remediation"
                  className="mt-1 w-full px-3 py-1.5 text-xs rounded-md bg-surface-overlay border border-border text-text-primary focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={addRule}
                  className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                >
                  Add rule
                </button>
                <button
                  onClick={() => { setAddingType(null); setNewRoleId(''); setNewReason('') }}
                  className="px-3 py-1.5 text-xs rounded-md border border-border text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button
            onClick={handleClear}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Clear all rules
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-md border border-border text-text-muted hover:text-text-primary transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-medium rounded-md bg-brand-500 text-white hover:bg-brand-600 transition-colors"
            >
              Save rules
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}