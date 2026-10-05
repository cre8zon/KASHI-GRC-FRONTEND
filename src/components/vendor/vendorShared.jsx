/**
 * vendorShared.jsx
 *
 * Shared primitives for the vendor-assessment tabs, mirroring
 * src/components/audit/ so the two modules look and behave the same.
 *
 * ── WHY THESE ARE SHARED AND AUDIT'S ARE NOT ──────────────────────────────
 * The audit tabs each declare their own copy of UserPicker, userName,
 * flattenUsers and the eligible-users fetch. That is why the auditor and
 * auditee pickers once diverged: two copies of one rule, fixed in one of them.
 * The comment at EngagementSectionsTab line 671 is the post-mortem.
 *
 * The vendor tabs take the same shapes from one file instead. Same component,
 * same contract, one place to fix.
 *
 * ── THE PICKER IS FED BY eligible-users, NOT BY A SIDE FILTER ─────────────
 * GET /v1/workflow-instances/steps/{stepInstanceId}/eligible-users?side=X
 *
 * That endpoint is the real answer to "who can be assigned here", and it is
 * considerably more than a side filter. It has three modes:
 *
 *   ?side=X          — answers from the step in THIS workflow that actually
 *                      assigns that side, wherever the workflow currently
 *                      sits. Without it, a picker viewed during another step
 *                      offers that step's people.
 *   assignableSide   — set on the step: who does work WITHIN this step.
 *   neither          — the NEXT step's actor roles, via workflow_step_roles:
 *                      who will DO the next step. This is the pattern behind
 *                      "pick a CISO who will own step 3", and it cannot be
 *                      derived from assignable_side at all.
 *
 * It also applies the same membership scope task assignment uses, so an
 * external engagement offers only that firm's guests.
 *
 * Use this. Do not reach for /v1/users with a hardcoded side — that is the bug
 * the vendor screens currently have, and it is also, for the record, most of
 * what /v1/assessments/{id}/assignable-users reimplements: that endpoint covers
 * the middle mode only. It is still useful where there is no step instance to
 * ask about, and its assertAssignable half is the only server-side enforcement
 * that exists — but the picker should be fed from here.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  UserPlus, ChevronUp, ChevronDown, ChevronRight, Search, X, CheckCircle2, Loader2,
  Check, Minus, Layers, Paperclip, ArrowUpRight,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../config/axios.config'
import { cn } from '../../lib/cn'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import { useEntityActionItems, useMyActionItems } from '../../hooks/useActionItems'

// ═══════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════

export const fetchEligibleUsersForSide = (stepInstanceId, side) =>
  api.get(`/v1/workflow-instances/steps/${stepInstanceId}/eligible-users`,
          side ? { params: { side } } : undefined)
    .then(r => (Array.isArray(r) ? r : (r?.data?.data || r?.data || r || [])))

/**
 * Eligible users for one side of one step.
 *
 * Disabled without a stepInstanceId rather than falling back to an unfiltered
 * user list. A fallback would silently offer everybody exactly when the step
 * could not be resolved, which is indistinguishable from the bug being fixed.
 * An empty picker that says why is the honest failure.
 */
export function useEligibleUsers(stepInstanceId, side, enabled = true) {
  return useQuery({
    queryKey: ['vendor-eligible-users', stepInstanceId, side || 'any'],
    queryFn:  () => fetchEligibleUsersForSide(stepInstanceId, side),
    enabled:  !!stepInstanceId && enabled,
    staleTime: 60 * 1000,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPES
// ═══════════════════════════════════════════════════════════════════════════

export const uid = (u) => u?.userId ?? u?.id

export function userName(user) {
  if (!user) return null
  const firstLast = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null
  return user.fullName || user.name || firstLast || user.email || `User #${uid(user)}`
}

export function userInitials(user) {
  const n = userName(user) || ''
  return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

/** Unwraps the several envelope shapes the list endpoints return. */
export function flattenUsers(raw) {
  const arr = raw?.data?.data?.items || raw?.data?.items || raw?.items
           || raw?.data?.data        || raw?.data        || raw
  return Array.isArray(arr) ? arr : []
}

/** Same for a plain list payload. */
export function unwrapList(raw) {
  const arr = raw?.data?.data || raw?.data || raw
  return Array.isArray(arr) ? arr : []
}

// ═══════════════════════════════════════════════════════════════════════════
// USER PICKER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inline assignment picker.
 *
 * Ported from the audit sections tab so the two modules are the same control:
 * same trigger chip, same portal dropdown, same search, same unassign.
 *
 * The dropdown renders through a portal with fixed viewport coordinates so it
 * escapes any overflow-clipping ancestor — a section tree scrolls, and an
 * absolutely positioned menu inside it gets cut off.
 *
 * `emptyHint` is a prop rather than hardcoded text: audit's empty picker is
 * almost always the external-auditor case, and the vendor module's is almost
 * always an unseeded step. The same blank list needs a different explanation.
 *
 * `loading` and `saving` are two different states and were being run together.
 * `loading` is the eligible-users fetch — the list is not ready. `saving` is an
 * assignment in flight — the list is fine, the pick is being written. Both
 * disable the control, but only one of them should be silent: an assignment
 * takes a round trip plus a task fan-out, and a chip that greys out and says
 * nothing for two seconds reads as a dead button. So `saving` relabels the chip
 * "Assigning…" with a spinner and keeps the dropdown shut until it lands.
 */
export function UserPicker({
  users = [],
  value,
  onChange,
  placeholder = 'Assign…',
  loading,
  saving,
  savingLabel = 'Assigning…',
  excludeUserId,
  emptyHint,
  disabled,
}) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [flipUp, setFlipUp] = useState(false)
  const [coords, setCoords] = useState(null)
  const ref     = useRef(null)
  const btnRef  = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      const inBtn  = ref.current && ref.current.contains(e.target)
      const inMenu = menuRef.current && menuRef.current.contains(e.target)
      if (!inBtn && !inMenu) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close the dropdown the moment a save starts. Leaving it open over a
  // disabled trigger lets a second pick queue behind the first, and the second
  // one wins on the server while the first toast is still on screen.
  useEffect(() => { if (saving) setOpen(false) }, [saving])

  const handleToggle = (e) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setFlipUp(window.innerHeight - rect.bottom < 260)
      setCoords({
        right:  window.innerWidth - rect.right,
        top:    rect.bottom,
        bottom: window.innerHeight - rect.top,
      })
    }
    setOpen(o => !o)
  }

  const filtered = useMemo(() => {
    let list = excludeUserId ? users.filter(u => uid(u) !== excludeUserId) : users
    if (!query) return list
    const q = query.toLowerCase()
    return list.filter(u =>
      (userName(u) || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q))
  }, [users, query, excludeUserId])

  const selected = users.find(u => uid(u) === value)

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={btnRef}
        onClick={handleToggle}
        disabled={loading || saving || disabled}
        className={cn(
          'flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-ctl border transition-all',
          selected
            ? 'border-brand-500/40 bg-brand-500/10 text-brand-ink hover:bg-brand-500/15'
            : 'border-border bg-surface-overlay text-text-muted hover:text-text-secondary hover:border-border-strong',
          saving
            ? 'opacity-100 cursor-wait border-brand-500/40 bg-brand-500/10 text-brand-ink'
            : (loading || disabled) && 'opacity-50 cursor-not-allowed'
        )}
      >
        {saving ? (
          <>
            <Loader2 size={10} className="animate-spin shrink-0" />
            <span>{savingLabel}</span>
          </>
        ) : selected ? (
          <>
            <div className="h-3.5 w-3.5 rounded-full bg-brand-500/30 flex items-center justify-center text-[7px] font-bold text-brand-ink shrink-0">
              {userInitials(selected)}
            </div>
            <span className="max-w-[100px] truncate">{userName(selected)}</span>
          </>
        ) : (
          <>
            <UserPlus size={10} />
            <span>{placeholder}</span>
          </>
        )}
        {!saving && (open ? <ChevronUp size={9} /> : <ChevronDown size={9} />)}
      </button>

      {open && !saving && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            right: coords.right,
            ...(flipUp ? { bottom: coords.bottom + 4 } : { top: coords.top + 4 }),
          }}
          className="w-52 bg-surface-raised border border-border rounded-card shadow-elevated z-[9999] overflow-hidden"
        >
          <div className="p-1.5 border-b border-border">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-overlay rounded-ctl">
              <Search size={10} className="text-text-muted shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                placeholder="Search…"
                className="flex-1 bg-transparent text-[11px] text-text-primary placeholder:text-text-muted outline-none"
              />
            </div>
          </div>

          {selected && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-status-fail-fg hover:bg-status-fail-bg transition-colors"
            >
              <X size={10} /> Unassign
            </button>
          )}

          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-3 text-[10px] text-text-muted text-center">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-center">
                <p className="text-[10px] text-text-muted">No users found</p>
                {emptyHint && (
                  <p className="mt-1 text-[9px] text-text-muted leading-relaxed max-w-[16rem] mx-auto">
                    {emptyHint}
                  </p>
                )}
              </div>
            ) : filtered.map(u => (
              <button
                key={uid(u)}
                onClick={(e) => { e.stopPropagation(); onChange(uid(u)); setOpen(false); setQuery('') }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-surface-overlay text-left',
                  uid(u) === value ? 'bg-brand-500/10 text-brand-ink' : 'text-text-secondary'
                )}
              >
                <div className="h-4 w-4 rounded-full bg-surface-overlay border border-border flex items-center justify-center text-[8px] font-bold shrink-0">
                  {userInitials(u)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{userName(u)}</div>
                  {u.roleName && (
                    <div className="text-[9px] text-text-muted truncate">
                      {u.roleName.replace(/_/g, ' ')}
                    </div>
                  )}
                </div>
                {uid(u) === value && <CheckCircle2 size={10} className="text-brand-ink shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION COLLAPSE + BULK SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Open/closed state for a list of sections, with EVERY section open by default.
 *
 * The state holds the CLOSED ids, not the open ones. That is the whole trick:
 * a section that arrives later — a second page of questions, a section added
 * after a reopen — is open because it is absent from the set, with no effect
 * watching the list and no flash of a collapsed row. Tracking open ids would
 * need exactly that effect, and it would fight anyone who had just closed one.
 */
export function useSectionCollapse(sections = [], idKey = 'sectionInstanceId') {
  const [closed, setClosed] = useState(() => new Set())

  const ids = useMemo(
    () => sections.map(s => s?.[idKey]).filter(v => v !== undefined && v !== null),
    [sections, idKey])

  const isOpen  = (id) => !closed.has(id)
  const toggle  = (id) => setClosed(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const expandAll   = () => setClosed(new Set())
  const collapseAll = () => setClosed(new Set(ids))

  // "All open" is the honest reading of an empty closed-set against the
  // sections actually on screen, so the toggle's label matches what you see.
  const allOpen = ids.every(id => !closed.has(id))

  return { isOpen, toggle, expandAll, collapseAll, allOpen, toggleAll: () => (allOpen ? collapseAll() : expandAll()) }
}

/**
 * Multi-select over question instance ids.
 *
 * Deliberately id-based rather than index-based: the question list re-sorts
 * when a section is submitted and re-fetches after every save, and a selection
 * keyed on position would silently move to a different question.
 */
export function useQuestionSelection() {
  const [selected, setSelected] = useState(() => new Set())

  const isSelected = (id) => selected.has(id)
  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  // Select-all on a group is a toggle against that group only: if everything in
  // the section is already selected, clicking clears just that section and
  // leaves selections in other sections alone.
  const toggleMany = (idList = []) => setSelected(prev => {
    const next = new Set(prev)
    const allIn = idList.length > 0 && idList.every(id => next.has(id))
    idList.forEach(id => (allIn ? next.delete(id) : next.add(id)))
    return next
  })
  const clear = () => setSelected(new Set())
  const asArray = () => [...selected]

  return { selected, isSelected, toggle, toggleMany, clear, asArray, count: selected.size }
}

/** A square tri-state checkbox. `some` renders the partial mark. */
export function SelectBox({ checked, some, onChange, disabled, title, className }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange?.() }}
      className={cn(
        'shrink-0 h-3.5 w-3.5 rounded-[3px] border flex items-center justify-center transition-colors',
        checked || some
          ? 'border-brand-500/60 bg-brand-500/20 text-brand-ink'
          : 'border-border bg-surface-overlay text-transparent hover:border-border-strong',
        disabled && 'opacity-40 cursor-not-allowed',
        className
      )}
    >
      {checked ? <Check size={9} strokeWidth={3} />
               : some ? <Minus size={9} strokeWidth={3} /> : null}
    </button>
  )
}

/**
 * The bar that appears once something is selected.
 *
 * Renders fixed to the bottom of the viewport rather than inline. A selection
 * spanning several sections means the person has scrolled, and an inline bar at
 * the top of the list is off screen exactly when they want it.
 *
 * It reuses UserPicker rather than declaring a second dropdown, so bulk assign
 * and single assign are fed by the same eligible-users answer and narrow to the
 * same role. Two pickers offering different people on one screen is the bug
 * this whole drop is about.
 */
export function BulkAssignBar({
  count, users = [], loading, saving, onAssign, onClear,
  label = 'Assign selected to…', emptyHint,
  itemNoun = 'question',
}) {
  if (!count) return null
  return createPortal(
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-3
                    px-3 py-2 rounded-card border border-border bg-surface-raised shadow-elevated">
      <span className="text-[11px] text-text-primary font-medium whitespace-nowrap">
        {count} {itemNoun}{count === 1 ? '' : 's'} selected
      </span>
      <span className="h-4 w-px bg-border" />
      <UserPicker
        users={users}
        loading={loading}
        saving={saving}
        savingLabel="Assigning…"
        value={null}
        onChange={(userId) => { if (userId) onAssign?.(userId) }}
        placeholder={label}
        emptyHint={emptyHint}
      />
      <button
        onClick={onClear}
        disabled={saving}
        className="text-[10px] text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
      >
        Clear
      </button>
    </div>,
    document.body
  )
}

/**
 * The header strip above a section's questions.
 *
 * One control carrying three things that belong together: the open/closed
 * chevron, the select-all-in-this-section box, and the section's own status.
 * `onSelectAll` omitted hides the box entirely — the Review tab shows it only
 * to somebody who may assign, and a checkbox that does nothing is worse than
 * no checkbox.
 */
export function SectionHeader({
  name, open, onToggle, locked, lockedLabel = 'Submitted',
  total, selectedCount, onSelectAll, right, children,
}) {
  const some = selectedCount > 0 && selectedCount < total
  const all  = total > 0 && selectedCount === total
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface-overlay/60 border-y border-border">
      <button
        onClick={onToggle}
        aria-label={open ? 'Collapse section' : 'Expand section'}
        className="text-text-muted hover:text-text-secondary shrink-0"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {onSelectAll && (
        <SelectBox
          checked={all}
          some={some}
          onChange={onSelectAll}
          title={all ? 'Clear this section' : 'Select every question in this section'}
        />
      )}

      <Layers size={11} className="text-text-muted shrink-0" />
      <span className="text-[11px] font-medium text-text-primary truncate">{name}</span>

      {typeof total === 'number' && (
        <span className="text-[9px] text-text-muted shrink-0">
          {total} question{total === 1 ? '' : 's'}
        </span>
      )}
      {locked && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-status-pass-bg text-status-pass-fg shrink-0">
          {lockedLabel}
        </span>
      )}
      {children}
      <span className="flex-1" />
      {right}
    </div>
  )
}

/**
 * Expand all / collapse all, plus select-every-question-in-the-assessment.
 *
 * The second one is the "assign all questions of all sections" case. It is a
 * separate control from the per-section box on purpose: selecting 60 questions
 * across 6 sections by accident, because a click landed one row higher than
 * intended, is not a recoverable mistake once the assign lands.
 */
// ═══════════════════════════════════════════════════════════════════════════
// ONE INVALIDATION LIST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Everything that has to move when a question's answer or verdict changes.
 *
 * ── WHY THIS IS A FUNCTION AND NOT THREE COPIES ───────────────────────────
 *
 * It was three: the fill tab's save, QuestionDrawer's save, and
 * ResponderActions. Each listed the keys whoever wrote it happened to know
 * about, and the module tabs arrived after two of them — so Accept and Override
 * invalidated only the hardcoded pages' caches, reached the server, changed the
 * answer, and left the screen exactly as it was. Twice now that has been
 * reported as "the button does nothing", and twice the server log showed the
 * write had succeeded.
 *
 * A write path that forgets a key fails silently and looks like a dead control,
 * which is the worst failure mode available: nothing errors, nothing logs, and
 * the only symptom is a user pressing the button again.
 *
 * Both families are listed deliberately. The hardcoded pages are still deployed
 * and a key nothing is subscribed to invalidates nothing, so carrying all of
 * them costs one no-op per call and loses nobody. When those pages go, delete
 * the second block and nothing else changes.
 *
 * @param qc                 the query client
 * @param assessmentId       the assessment whose lists must refetch
 * @param questionInstanceId optional — also refreshes that question's action
 *                           items and comments, which is what makes an
 *                           obligation resolve on screen
 */
export function invalidateAssessment(qc, assessmentId, questionInstanceId) {
  if (!qc) return
  // Module tabs
  qc.invalidateQueries({ queryKey: ['assessment-my-sections',     assessmentId] })
  qc.invalidateQueries({ queryKey: ['assessment-my-questions',    assessmentId] })
  qc.invalidateQueries({ queryKey: ['assessment-detail-sections', assessmentId] })
  qc.invalidateQueries({ queryKey: ['assessment-reviewer-sections', assessmentId] })
  qc.invalidateQueries({ queryKey: ['module-detail'] })
  // Hardcoded pages, still deployed
  qc.invalidateQueries({ queryKey: ['my-sections-fill',           assessmentId] })
  qc.invalidateQueries({ queryKey: ['my-sections-review',         assessmentId] })
  qc.invalidateQueries({ queryKey: ['assessment-responder-review', assessmentId] })
  qc.invalidateQueries({ queryKey: ['assessment-fill',            assessmentId] })
  qc.invalidateQueries({ queryKey: ['my-contributor-questions',   assessmentId] })
  // Per question
  if (questionInstanceId != null) {
    qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
    qc.invalidateQueries({ queryKey: ['q-comments', questionInstanceId] })
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// WHO IS THIS QUESTION WITH
// ═══════════════════════════════════════════════════════════════════════════

export const ASSIGN_ALL       = 'all'
export const ASSIGN_SELF      = 'self'       // nobody was delegated — the owner answers it
export const ASSIGN_DELEGATED = 'delegated'  // delegated to anyone

/**
 * Does this question match the chosen assignment filter?
 *
 * `field` is the assignment that matters on this side: assignedUserId on the
 * vendor side (who answers it), reviewerAssignedUserId on the organisation side
 * (who evaluates it). Same control, same predicate, one argument apart — which
 * is the only reason this lives here rather than in the tab that needed it
 * first.
 */
export function matchesAssignment(question, value, field = 'assignedUserId') {
  if (!value || value === ASSIGN_ALL) return true
  const who = question?.[field]
  if (value === ASSIGN_SELF)      return who == null
  if (value === ASSIGN_DELEGATED) return who != null
  if (value.startsWith('user:'))  return String(who ?? '') === value.slice(5)
  return true
}

/** The distinct people a loaded set of sections has questions assigned to. */
export function assigneesInSections(sections, field = 'assignedUserId',
                                    nameField = 'assignedUserName') {
  const byId = new Map()
  for (const s of sections || []) {
    for (const q of s.questions || []) {
      const id = q?.[field]
      if (id == null) continue
      if (!byId.has(String(id))) byId.set(String(id), q?.[nameField] || `User ${id}`)
    }
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The filter control itself.
 *
 * A select rather than chips: the number of options is the number of people
 * delegated to plus three, which is unbounded, and a row of chips that wraps
 * onto a second line pushes the whole list down.
 *
 * Counts are deliberately not shown per option — they would need the predicate
 * run once per option on every render of a 90-question list, and the list
 * already says how many it is showing.
 */
export function AssignmentFilter({ value, onChange, people = [], selfLabel, delegatedLabel }) {
  return (
    <select
      value={value}
      onChange={e => onChange?.(e.target.value)}
      title="Filter by who this question is with"
      className="text-[10px] bg-surface-overlay border border-border rounded-ctl px-1.5 py-1 text-text-secondary outline-none focus:border-border-strong"
    >
      <option value={ASSIGN_ALL}>All questions</option>
      <option value={ASSIGN_SELF}>{selfLabel || 'Not delegated'}</option>
      <option value={ASSIGN_DELEGATED}>{delegatedLabel || 'Delegated'}</option>
      {people.length > 0 && <option disabled>──────────</option>}
      {people.map(p => (
        <option key={p.id} value={`user:${p.id}`}>{p.name}</option>
      ))}
    </select>
  )
}


export function ListToolbar({
  allOpen, onToggleAll, totalQuestions, selectedCount, onSelectAllQuestions, left, right,
  // The sections tab selects sections, not questions. Same control, same
  // behaviour, different noun — passed rather than branched on, so there is
  // still one toolbar and not a second one that drifts.
  selectAllLabel,
}) {
  const all  = totalQuestions > 0 && selectedCount === totalQuestions
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface-overlay/40">
      {left}
      <span className="flex-1" />
      {onSelectAllQuestions && totalQuestions > 0 && (
        <button
          onClick={onSelectAllQuestions}
          className="flex items-center gap-1 text-[9px] text-text-muted hover:text-brand-ink transition-colors"
        >
          <SelectBox checked={all} some={selectedCount > 0 && !all} onChange={onSelectAllQuestions} />
          {all ? 'Clear all' : (selectAllLabel || `Select all ${totalQuestions}`)}
        </button>
      )}
      <button
        onClick={onToggleAll}
        className="text-[9px] text-text-muted hover:text-brand-ink transition-colors"
      >
        {allOpen ? 'Collapse all' : 'Expand all'}
      </button>
      {right}
    </div>
  )
}

/**
 * "Evidence required" marker.
 *
 * Distinct from the mandatory asterisk, which means the ANSWER is required.
 * A question can want a policy document attached and still be optional to
 * answer, and the two were indistinguishable before because only one of them
 * existed. Driven by requiresEvidence on the question instance; `satisfied`
 * flips it from a warning to a settled state once something is attached.
 */
export function EvidenceRequiredBadge({ required, satisfied, className }) {
  if (!required) return null
  return (
    <span
      title={satisfied
        ? 'Evidence is required for this question and has been attached.'
        : 'Evidence is required for this question. Attach a file before submitting the section.'}
      className={cn(
        'inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap',
        satisfied
          ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
          : 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg',
        className
      )}
    >
      <Paperclip size={8} />
      {satisfied ? 'Evidence attached' : 'Evidence required'}
    </span>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// PER-QUESTION OBLIGATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assignment items — the obligation itself, as opposed to work raised ON it.
 *
 * Every screen filtered these out as "bookkeeping", which was the mistake.
 * They are the per-question record of who was asked and whether they are done,
 * and the server already maintains them: answering a question resolves the
 * contributor's item ("Question answered by contributor"), saving a verdict
 * resolves the assistant's ("Question evaluated by review assistant").
 *
 * So per-question completion was never missing — it was just never shown, and
 * a contributor hunting for a submit button was looking for something the act
 * of answering had already done.
 */
export const ASSIGNMENT_TYPES = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT']
export const LIVE_STATUSES    = ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'PENDING_VALIDATION']

const OBLIGATION_TONE = {
  todo:    'bg-status-warn-bg text-status-warn-fg border-status-warn-bd',
  waiting: 'bg-status-info-bg text-status-info-fg border-status-info-bd',
  done:    'bg-status-pass-bg text-status-pass-fg border-status-pass-bd',
}

/**
 * What this question is waiting on, FOR THIS VIEWER, in three words.
 *
 * Precedence is deliberate: live work raised on the question — a revision, a
 * remediation, a clarification — outranks the assignment, because an item in
 * that state is the reason to look at the question at all. Only when nothing
 * is outstanding does the assignment's own state show, and then it is the
 * reassurance that the work registered.
 */
export function questionObligationState(items = [], viewerId) {
  const isMine = (i) => String(i.assignedTo ?? '') === String(viewerId ?? '\u0000')

  // ── WHOSE STATE, AND WHY IT IS NOT ONLY MINE ────────────────────────────
  //
  // This filtered to the viewer's own items, which meant a responder who had
  // just requested a revision saw nothing at all on the question: the item is
  // assigned to the CONTRIBUTOR, so to the person who raised it the question
  // looked untouched. They pressed a button, the page refreshed, and the list
  // said the same thing it had said before.
  //
  // A question has ONE state and everyone looking at it should see it. What
  // changes with the viewer is the wording — whether it is yours to act on, or
  // something you are waiting on from somebody else.
  const live = items.filter(i => LIVE_STATUSES.includes(i.status))

  const liveRaised = live.find(i => !ASSIGNMENT_TYPES.includes(i.remediationType))
  if (liveRaised) {
    const mine  = isMine(liveRaised)
    const who   = liveRaised.assignedToName || liveRaised.assignedGroupRole
    const t     = liveRaised.remediationType
    // "with X" rather than "assigned to X": the reader is the person who
    // raised it, and what they want to know is where the ball is.
    const withWhom = (!mine && who) ? ` · with ${who}` : ''

    if (t === 'REMEDIATION_REQUEST') {
      // ── AN ESCALATED FINDING POINTS AT ITS ISSUE ────────────────────────
      //
      // Once linkedIssueId is set, the remediation workflow — fix, evidence,
      // validate, close — lives on the Issue, and the questionnaire is no
      // longer where this gets dealt with. The submitted answer stays as the
      // record of what was found; it is not edited to clear the finding.
      //
      // So the chip stops saying "requested" (which reads as "answer me
      // again") and names the destination instead. It becomes a link in the
      // component below — the id is carried here rather than the label being
      // pre-rendered, because the state function has no business knowing what
      // a route looks like.
      const issueId = liveRaised.linkedIssueId ?? null
      if (issueId) {
        return {
          tone:  mine ? 'todo' : 'waiting',
          label: `Remediation · Issue #${issueId}`,
          title: 'The fix, its evidence and the sign-off happen on the issue. '
               + 'This answer stays as the record of what was found.',
          issueId,
        }
      }
      return liveRaised.status === 'PENDING_VALIDATION'
        ? { tone: 'waiting', label: 'Remediation awaiting validation' }
        : { tone: mine ? 'todo' : 'waiting', label: `Remediation requested${withWhom}` }
    }

    if (t === 'CLARIFICATION')
      return { tone: mine ? 'todo' : 'waiting', label: `Clarification requested${withWhom}` }

    // sourceType COMMENT with no remediationType is the responder→contributor
    // revision request — see ItemActionItems, which groups it the same way.
    if (liveRaised.status === 'PENDING_REVIEW')
      return { tone: 'waiting',
               label: mine ? 'Re-answered, awaiting review' : 'Re-answered — needs your review' }
    return { tone: mine ? 'todo' : 'waiting', label: `Revision requested${withWhom}` }
  }

  // No live work raised on it. Fall back to the assignment, which says whether
  // the person it was given to has finished.
  const assignment = items.find(i => ASSIGNMENT_TYPES.includes(i.remediationType))
  if (!assignment) return null

  const mine = isMine(assignment)
  const who  = assignment.assignedToName

  if (assignment.status === 'RESOLVED') {
    const verb = assignment.remediationType === 'REVIEWER_ASSIGNMENT' ? 'Evaluated' : 'Answered'
    return {
      tone:  'done',
      label: mine ? `${verb} · reported` : `${verb}${who ? ` by ${who}` : ''}`,
      title: assignment.resolutionNote || undefined,
    }
  }
  if (assignment.status === 'IN_PROGRESS') {
    return { tone: mine ? 'todo' : 'waiting',
             label: mine ? 'In progress' : `In progress${who ? ` · ${who}` : ''}` }
  }
  return { tone: mine ? 'todo' : 'waiting',
           label: mine ? 'Assigned to you' : `Assigned${who ? ` to ${who}` : ''}` }
}

/**
 * Does the VIEWER hold a live obligation on this question?
 *
 * The server lifts a section lock for exactly this — assertUserHasActiveTask's
 * open-obligation bypass, and submitAnswer's section check, both let a person
 * edit a locked question when they owe work on it. The UI locked anyway, so a
 * contributor sent a revision on a section they had already locked could read
 * the request and not answer it.
 */
export function hasLiveObligation(items = [], viewerId) {
  return items.some(i =>
    String(i.assignedTo ?? '') === String(viewerId ?? '\u0000')
    && LIVE_STATUSES.includes(i.status)
    && !ASSIGNMENT_TYPES.includes(i.remediationType))
}

/**
 * The OTHER half: does this person hold an open ASSIGNMENT on this question?
 *
 * hasLiveObligation above deliberately excludes ASSIGNMENT_TYPES, because an
 * assignment is not a reason to reopen an answer the responder has locked —
 * a revision request is. That is the right rule for the responder's lock and
 * the wrong one for the person's OWN lock, which is a different record:
 *
 *   assessment_section_instances.submitted_at   the RESPONDER locked it
 *   contributor_section_submissions row         the CONTRIBUTOR locked it
 *   reviewer_assistant_section_submissions row  the ASSISTANT locked it
 *
 * submitAnswer only ever checks the first. The contributor's own lock is a
 * client-side state with no server enforcement at all, so when they are
 * assigned a new question in a section they personally locked — the responder
 * not having locked it — the server accepts the answer and only the UI was
 * refusing to let them type it.
 *
 * Kept as a separate predicate rather than widening hasLiveObligation, because
 * widening it would also change what happens under the RESPONDER's lock, and
 * that is a policy question nobody has asked for.
 */
export function hasOpenAssignment(items = [], viewerId) {
  return items.some(i =>
    String(i.assignedTo ?? '') === String(viewerId ?? '\u0000')
    && LIVE_STATUSES.includes(i.status)
    && ASSIGNMENT_TYPES.includes(i.remediationType))
}

/**
 * Which questions this viewer still owes an ASSIGNMENT on, as a Set of question
 * instance ids.
 *
 * Built from useMyActionItems — the viewer's own list, which the app already
 * fetches for the inbox badge and keeps fresh over the user's WS topic. So this
 * costs no request, and when the assigner creates an item the set updates on
 * its own rather than waiting for a reload.
 *
 * NOT read from ActionItemsBulkProvider, although that map holds the same rows:
 * the fill and review tabs MOUNT that provider inside their own return, so a
 * hook called in the tab body would read the context from above it and get
 * null every time. A section-level control needs the answer in the tab body,
 * where no hook per question can be called either.
 *
 * The id type is whatever the API returns for entityId; callers hold question
 * ids from a different payload, so both sides are stringified on the way in and
 * `has` is wrapped below rather than left to the caller to remember.
 */
export function useOwedAssignmentIds(viewerId) {
  const { items = [] } = useMyActionItems()
  return useMemo(() => {
    const owed = new Set()
    for (const i of items) {
      if (i?.entityType !== 'QUESTION_RESPONSE') continue
      if (i?.entityId == null) continue
      if (hasOpenAssignment([i], viewerId)) owed.add(String(i.entityId))
    }
    return {
      has:  (questionInstanceId) => owed.has(String(questionInstanceId)),
      size: owed.size,
    }
  }, [items, viewerId])
}

/**
 * The chip. Reads its own items so a caller only passes an id — the bulk
 * provider on the page means this is a cache read, not a request per question.
 */
export function QuestionObligationChip({ questionInstanceId, className }) {
  const { userId } = useSelector(selectAuth)
  const { data: items = [] } = useEntityActionItems('QUESTION_RESPONSE', questionInstanceId, {
    enabled: !!questionInstanceId,
  })
  const state = useMemo(() => questionObligationState(items, userId), [items, userId])
  if (!state) return null

  const cls = cn(
    'inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap',
    OBLIGATION_TONE[state.tone], className)

  // An escalated finding is the one state with somewhere else to be, so it is
  // the one chip that clicks. stopPropagation because this sits on a question
  // card whose own click opens the drawer, and a chip that opened both would
  // be a chip nobody trusts.
  if (state.issueId) {
    return (
      <Link
        to={`/module/issue/${state.issueId}`}
        onClick={(e) => e.stopPropagation()}
        title={state.title}
        className={cn(cls, 'hover:underline')}
      >
        <ArrowUpRight size={8} />
        {state.label}
      </Link>
    )
  }

  return (
    <span
      title={state.title}
      className={cls}
    >
      {state.label}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What this user may do on this tab, from the view context.
 *
 * The same rule the audit tabs apply, in one place instead of restated per
 * file:
 *
 *   canAct      — holds the live task.
 *   canOverride — right side AND override rights. Side-scoped, not blanket:
 *                 an ORGANIZATION admin looking at a VENDOR-side assign step
 *                 fails the side check and correctly sees nothing.
 *
 * Either counts as standing. Both are computed by the backend's view-context
 * endpoint, so no component here decides who anybody is.
 */
/**
 * @param obligation  true when the viewer holds an OPEN ACTION ITEM on this
 *                    assessment — a contributor's assigned question, a review
 *                    assistant's, a revision request, a KashiGuard finding.
 *
 * ── THE UI WAS STRICTER THAN THE SERVER, AGAIN ───────────────────────────
 *
 * Standing was `canAct || canOverride`, both of which come from holding a
 * workflow TASK. A contributor holds no task — assigning a question creates an
 * ActionItem and nothing else; the sub-task that used to exist is gone and the
 * code that cleans up after it is literally labelled "Legacy sub-task cleanup".
 *
 * So the contributor the Questionnaire tab exists for was shown "View only —
 * you do not hold an active task on this assessment" on the one screen they are
 * meant to work in, and every radio button was disabled.
 *
 * The server does not agree with that. assertUserHasActiveTask ends with:
 *
 *     if (!hasActiveTask) {
 *         if (hasOpenActionItemForAssessment(userId, assessmentId, tenantId)) {
 *             log.info("[ASSESSMENT-GUARD] Open obligation bypass ...");
 *             return;                       // ← allowed
 *         }
 *         throw new BusinessException("ACCESS_DENIED", ...)
 *     }
 *
 * An open obligation IS standing, server-side, and has been all along. This is
 * the third time in this module I have gated the UI on something narrower than
 * the endpoint behind it — the reviewer picker, workflow:task:act, and now
 * this. The rule I keep relearning: read the guard, then mirror it.
 *
 * `onStep` is skipped for obligation standing, deliberately. The step check
 * asks "is the current workflow step the one this screen is for", and somebody
 * working from an obligation has no step — vc.stepAction is empty, so requiring
 * a match would re-close the door this opens.
 */
export function useStanding(vc = {}, requiredStepAction, { obligation = false } = {}) {
  const perms = vc.permissions || []
  const taskStanding = vc.canAct === true || vc.canOverride === true
  const hasStanding  = taskStanding || obligation === true
  const stepAction   = (vc.stepAction || '').toUpperCase()
  const onStep = obligation === true
    ? true
    : (requiredStepAction ? stepAction === requiredStepAction.toUpperCase() : true)
  return {
    perms,
    hasStanding,
    /** Where the standing came from — the empty states say different things. */
    viaObligation: !taskStanding && obligation === true,
    stepAction,
    /** Standing, on the right step, holding the permission. All three. */
    can: (code) => hasStanding && onStep && perms.includes(code),
    /** Permission alone — for actions not gated on a particular step. */
    has: (code) => perms.includes(code),
  }
}

/**
 * Permission codes for the vendor-assessment tabs.
 *
 * Named here rather than typed as strings at each call site, because a typo in
 * a permission code fails OPEN in the reading direction — perms.includes()
 * simply returns false and the control disappears, which looks like a
 * configuration problem rather than a bug.
 *
 * ── THESE WERE COLON STYLE AND THE SEEDS ARE DOT STYLE ───────────────────
 * This file used module:entity:action — 'assessment:section:reopen' — which is
 * the convention LibraryMappingTab's comment calls "every permission this
 * platform actually seeds". It is not the only one. UniversalModulePage's
 * create gate reads
 *
 *     vc.permissions.includes(`${bp.entityType.toLowerCase()}.create`)
 *
 * which is dot style and cannot be anything else, Permission.java's own javadoc
 * says "Dot-notation permission code: risk.create, audit.approve", and
 * audit_project.create already exists that way. So the platform carries both
 * conventions and they disagree.
 *
 * The seeds settle it as dot, and these constants now match them. A code that
 * does not exist as a row fails OPEN in the reading direction —
 * perms.includes() returns false and the control simply disappears — so a
 * mismatch here looks like a configuration problem rather than a bug, which is
 * exactly why it went unnoticed.
 *
 * Every code below must exist in `permissions` AND be granted, or the control
 * stays hidden. sql/65 seeds the capability codes; sql/67 seeds the four
 * operational ones this file was already using.
 */
/**
 * Which QuestionDrawer mode this caller gets on this question.
 *
 * The drawer takes one of four: contributor | responder | reviewer | readonly.
 * Every tab resolved this differently, or not at all — the sections tab
 * hardcoded 'readonly', and fill and review never opened the drawer. One
 * function so the three agree, and so the rule is written down once.
 *
 * ── READONLY IS A REAL MODE, NOT A FAILURE ────────────────────────────────
 * It is the mode for someone watching: a VRM, an observer, anyone without a
 * task on this step. They get every tab — both comment channels, the action
 * items including KashiGuard findings, the evidence list, the activity trail —
 * and can post none of it. QuestionDrawer gates writing on `mode !== 'readonly'`
 * and reading on nothing, which is exactly right: seeing what is going on with
 * a question is not a privileged act, and hiding it is how people end up
 * asking in Slack what a red badge means.
 *
 * ── WHY canAct AND NOT A ROLE NAME ────────────────────────────────────────
 * canAct comes from the view-context endpoint, which already knows the side,
 * the step, the task and the permissions. A role-name check here would be a
 * fourth answer to a question the backend has already answered three times.
 *
 * @param {string}  userSide   'VENDOR' | 'ORGANIZATION' | ... from the page
 * @param {object}  vc         view context
 * @param {object}  question   the question instance, for the assignment test
 * @param {boolean} isContributorView  true when the tab is in contributor mode
 */
/**
 * @param obligation  same meaning as in useStanding — an open action item is
 *                    standing. Without it a contributor got 'readonly' and the
 *                    drawer showed "Not answered yet." with nothing to answer
 *                    with, because canAnswerInDrawer requires mode
 *                    'contributor'.
 */
export function resolveDrawerMode(userSide, vc = {}, question = null,
                                  isContributorView = false, obligation = false) {
  const canAct = vc.canAct === true || vc.canOverride === true || obligation === true

  if (userSide === 'ORGANIZATION' || userSide === 'SYSTEM') {
    // Reviewer mode is what unlocks Validate and Accept risk on a remediation
    // inside the Actions tab, so it is gated on standing rather than side
    // alone — an org user with no task on this step is watching, not reviewing.
    return canAct ? 'reviewer' : 'readonly'
  }

  if (userSide === 'VENDOR') {
    if (!canAct) return 'readonly'
    if (isContributorView) return 'contributor'
    // A responder looking at a question they assigned away gets the command
    // block — accept, request revision, override. QuestionDrawer renders it on
    // `mode === 'responder' && question.assignedUserId && resp`, so passing
    // 'responder' on an unassigned question costs nothing and passing
    // 'contributor' on an assigned one would hide it.
    return 'responder'
  }

  // AUDITOR, AUDITEE, or a side we do not model: watching.
  return 'readonly'
}

/**
 * The KashiGuard tag on a question, as a badge.
 *
 * questionTagSnapshot is taken at instantiation and never joined back to the
 * library — AssessmentExecutionService:206 calls that load-bearing, because
 * GuardEvaluator reads the snapshot and editing the library question later must
 * not retroactively change what fired.
 *
 * Most questions are untagged and GuardEvaluator exits on null before touching
 * the database, so this renders nothing far more often than it renders
 * something. That is the point: a tag means rules can fire here.
 *
 * Styled to match the admin library's badge (QuestionLibraryPage:270) so the
 * same string looks the same wherever it appears.
 */
export function GuardTagBadge({ tag, className }) {
  if (!tag) return null
  return (
    <span
      title={`KashiGuard tag — automated rules can fire on this question (${tag})`}
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[9px]',
        'bg-brand-500/10 text-brand-ink shrink-0',
        className)}
    >
      {tag}
    </span>
  )
}

export const P = {
  // Operational — seeded by sql/67.
  ASSIGN_RESPONDER:     'assessment.section.assign_responder',
  ASSIGN_CONTRIBUTOR:   'assessment.question.assign_contributor',
  // ── VENDOR-SIDE vs ORG-SIDE ASSIGNMENT ARE DIFFERENT PERMISSIONS ────────
  //
  // ASSIGN_CONTRIBUTOR is granted to VENDOR_CISO and VENDOR_RESPONDER — it is
  // the vendor deciding who inside their own org answers a question. An
  // ORGANIZATION user will never hold it, and should not.
  //
  // The Review tab's picker does the opposite thing: an org reviewer
  // delegating a question to an org REVIEW_ASSISTANT, through
  // reviewerAssignQuestion. Gating that on the vendor-side code meant the
  // control was invisible to every single person who could use it — and
  // invisible is how a permission mismatch always fails, so it read as a
  // missing feature rather than a wrong code. Seeded by sql/76.
  ASSIGN_REVIEWER:      'assessment.question.assign_reviewer',
  SECTION_SUBMIT:       'assessment.section.submit',
  ANSWER_SUBMIT:        'assessment.question.answer',
  REVIEW_EVALUATE:      'assessment.question.evaluate',

  // Capability — seeded by sql/65.
  SECTION_REOPEN:       'assessment.section.reopen',
  REVIEWER_REOPEN:      'assessment.section.reviewer_reopen',
  REMEDIATION_VALIDATE: 'assessment.remediation.validate',
  REMEDIATION_ESCALATE: 'assessment.remediation.escalate',
  FINDINGS_EDIT:        'assessment.findings.edit',
  RISK_RATING:          'assessment.risk_rating.assign',
  STEP_SEND_BACK:       'assessment.step.send_back',
  SECTIONS_VIEW_ALL:    'assessment.sections.view_all',
}

/*
 * ── TWO CODES DELIBERATELY REMOVED ────────────────────────────────────────
 *
 * assessment:comment:internal   and   assessment:question:attach-evidence
 *
 * Both were here before I found that the comment and document modules already
 * own these decisions — CommentService resolves which threads a caller may read
 * and write from their side and role, and the document module enforces its own
 * rules on link and unlink.
 *
 * Keeping local codes for them would have created a second gate in front of a
 * working one, with the failure mode running the wrong way: a permission row
 * nobody seeded would hide a control the server was perfectly willing to allow,
 * and it would look like a platform bug rather than a missing row.
 *
 * So the chat and evidence tabs gate on standing only, and let the module that
 * owns the rule apply it. One rule, one place — the same reason the pickers
 * call eligible-users instead of re-deriving a side.
 */
// ═══════════════════════════════════════════════════════════════════════════
// VERDICTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The reviewer verdict vocabulary — PASS, PARTIAL, FAIL. Nothing else.
 *
 * ── THIS WAS WRONG, AND IT WAS WRONG IN A WAY THAT LOOKED RIGHT ───────────
 *
 * AssessmentReviewTab shipped with ACCEPTED / NEEDS_CLARIFICATION / REJECTED.
 * Those are real values in this codebase — VendorItemActionController writes
 * ACCEPTED and OVERRIDDEN when a vendor RESPONDER passes judgement on a
 * CONTRIBUTOR's answer, inside the vendor's own side. They are not the org
 * reviewer's verdicts.
 *
 * The org-side endpoint is
 *   PUT /v1/assessments/{id}/questions/{qiId}/reviewer-eval
 * and its first act is
 *   if (!Set.of("PASS","PARTIAL","FAIL").contains(verdict.toUpperCase()))
 *       throw new ValidationException(...)
 * so every click of Accept / Clarify / Reject on the v2 Review tab returned a
 * 400 and saved nothing. The toast said "Could not save the verdict" and the
 * row stayed pending, which reads as a flaky network rather than a wrong word.
 *
 * These three values are also load-bearing for the score, not just labels:
 * AssessmentResponseRepositoryImpl's CASE maps FAIL → 0.0 and PARTIAL → half
 * weight, and every compliance percentage on every screen is computed from it.
 * A fourth value would score as a full PASS silently.
 *
 * Do not add to this list without adding to the Set in saveReviewerEval first.
 */
export const VERDICTS = [
  { key: 'PASS',    label: 'Pass',    tone: 'pass',
    cls: 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg' },
  { key: 'PARTIAL', label: 'Partial', tone: 'warn',
    cls: 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg' },
  { key: 'FAIL',    label: 'Fail',    tone: 'fail',
    cls: 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg' },
]

export const VERDICT_BY_KEY = Object.fromEntries(VERDICTS.map(v => [v.key, v]))

/** PENDING and '' both mean "not evaluated yet". */
export const isEvaluated = (v) => !!v && v !== 'PENDING'

/**
 * Reviewer-adjusted compliance, the same arithmetic the server does.
 * PASS scores the full weight, PARTIAL half, FAIL nothing, and a question with
 * no answer scores nothing — the hardcoded page calls that "auto-FAIL".
 */
export function verdictScore(verdict, weight = 0) {
  if (verdict === 'PASS')    return weight
  if (verdict === 'PARTIAL') return weight * 0.5
  return 0
}

export function VerdictChip({ verdict, className }) {
  const cfg = VERDICT_BY_KEY[verdict]
  if (!cfg) return null
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold',
      cfg.cls, className)}>
      {cfg.label}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-QUESTION ACTIONS, DRIVEN BY ui_actions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ── WHY THIS IS NOT A CHANGE TO UniversalModulePage ───────────────────────
 *
 * The obvious move is to widen the token map in the module page's action
 * executor. It already substitutes {id}, {entityId}, {engagementId}, {taskId},
 * {stepInstanceId} and {workflowInstanceId} — one more for
 * {questionInstanceId} looks like a one-line change.
 *
 * It is not, for two reasons.
 *
 * 1. Those tokens all resolve from ONE entity: the record the page is showing.
 *    A question instance is a row inside a tab of that record, and there are
 *    two hundred of them on screen at once. There is no "the" question at the
 *    page level to substitute, so the executor would need a row context it has
 *    no concept of — which is a structural change to a 4,500-line file that
 *    every module in the product renders through.
 *
 * 2. ui_actions rows are fetched per screen_key. Question actions want their
 *    own screen_key ('vendor_assessment_question') precisely so they do NOT
 *    land on the assessment header alongside View report and Recalculate.
 *    Once the rows are fetched separately, executing them separately is the
 *    smaller design, not the larger one.
 *
 * So this is a small executor of its own, local to the vendor module, reading
 * the same table through the same endpoint. /v1/ui-config/actions/{screenKey}
 * already filters by role side and permission server-side, so nothing new is
 * needed on the backend at all.
 *
 * Tokens available here:
 *   {assessmentId} {questionInstanceId} {sectionInstanceId} {taskId}
 *   {stepInstanceId} {id}  — {id} is an alias for the question instance, since
 *                            that is the record the button is on.
 */
export function useQuestionActions(entityStatus) {
  return useQuery({
    queryKey: ['ui-actions', 'vendor_assessment_question', entityStatus || 'any'],
    queryFn:  () => api.get('/v1/ui-config/actions/vendor_assessment_question',
                            { params: { entityStatus: entityStatus || undefined } }),
    staleTime: 5 * 60 * 1000,
    // A screen_key with no rows seeded is the normal state until sql/72 runs,
    // and a 404 or an empty list must both render nothing rather than an error.
    retry: false,
    select: (r) => unwrapList(r),
  })
}

export function substituteQuestionTokens(str, ctx) {
  if (!str) return str
  return String(str)
    .replace(/\{assessmentId\}/g,       ctx.assessmentId ?? '')
    .replace(/\{questionInstanceId\}/g, ctx.questionInstanceId ?? '')
    .replace(/\{sectionInstanceId\}/g,  ctx.sectionInstanceId ?? '')
    .replace(/\{stepInstanceId\}/g,     ctx.stepInstanceId ?? '')
    .replace(/\{taskId\}/g,             ctx.taskId ?? '')
    .replace(/\{id\}/g,                 ctx.questionInstanceId ?? '')
}

/**
 * Renders the ui_actions rows for one question as buttons.
 *
 * Three payload conventions, the same three the module page understands, so a
 * screen designer does not have to learn a second vocabulary:
 *
 *   plain endpoint              → http_method + api_endpoint, tokens substituted
 *   {"__navRoute": "/..."}      → client-side navigation, tokens substituted
 *   {"__confirm": "message"}    → confirm before firing (also honoured via
 *                                 requires_confirmation / confirmation_message)
 *
 * Anything else in payload_template_json is sent as the request body, with
 * tokens substituted inside string values.
 *
 * An action whose allowed_statuses_json does not include the question's current
 * verdict is filtered out here rather than rendered disabled — a button that
 * can only fail is worse than no button, which is the same rule Gate 0 applies
 * on the module page.
 */
export function QuestionActionBar({
  question,
  assessmentId,
  taskId,
  stepInstanceId,
  // ── THE THREE GATES THIS USED TO IGNORE ────────────────────────────────
  //
  // ui_actions carries requires_assignment, requires_section_gate and
  // requires_remarks, and the module page honours all three. This executor
  // honoured none of them: its filter checked is_active, duplicate action_key
  // and allowed_statuses_json, and nothing else.
  //
  // Nothing exploits that today — sql/86 set requires_section_gate on exactly
  // two actions, both on screen_key 'vendor_assessment_detail', and no
  // question-level row carries either flag. So this is a latent hole rather
  // than a live one. It is worth closing anyway, because the first person to
  // tick "requires assignment" on a question action in the Screen Designer
  // would get a button that renders for everyone and fails for most of them,
  // and nothing would tell them why.
  //
  // Both are passed in rather than derived here, because the answer depends on
  // which side the host tab is: on the fill tab "assigned to me" means
  // question.assignedUserId, on the review tab it means
  // question.reviewerAssignedUserId, and a bar that guessed would let a
  // vendor's contributor assignment satisfy an organisation-side action.
  //
  // Undefined is treated as NOT satisfied — fail closed. A host that has not
  // been taught to answer does not get to show an assignment-scoped button.
  assignedToViewer,   // boolean | undefined
  hasSections,        // boolean | undefined — viewContext.hasSections
  // viewContext.stepAction, for ui_actions.allowed_step_actions. Same filter
  // the module page applies to header actions, so one row behaves the same
  // wherever it is rendered.
  stepAction,         // string | undefined
  onDone,          // () => void, called after a successful action
  className,
}) {
  const verdict = question?.currentResponse?.reviewerStatus || 'PENDING'
  const { data: actions } = useQuestionActions(verdict)
  const [busy, setBusy] = useState(null)
  const navigate = useNavigate()

  const ctx = {
    assessmentId,
    questionInstanceId: question?.questionInstanceId,
    sectionInstanceId:  question?.sectionInstanceId,
    stepInstanceId,
    taskId,
  }

  const visible = useMemo(() => {
    const rows = Array.isArray(actions) ? actions : []
    const seen = new Set()
    return rows.filter(a => {
      if (a.isActive === false) return false
      if (seen.has(a.actionKey)) return false
      seen.add(a.actionKey)
      // Assignment-scoped: only the person the question is assigned to. The
      // module page's equivalent lets a held task stand in for assignment
      // (`requiresAssignment && !taskId`), and that is deliberately NOT copied
      // here — a task on this assessment is held by the responder for the whole
      // section, so honouring it would make every question's assignment gate
      // open for them, which is the opposite of what the flag is for.
      if (a.requiresAssignment && assignedToViewer !== true) return false
      // Section-gated: an action that fires a section event is only offered on
      // a step that has sections. Same rule as sql/86 section A, same input
      // (viewContext.hasSections).
      if (a.requiresSectionGate && hasSections !== true) return false
      // Step-scoped: only offered on the step the action belongs to. Skipped
      // entirely when there is no step in play, for the same reason the module
      // page skips it — a question opened from the record rather than from a
      // task has no step action to match against.
      if (a.allowedStepActions && String(a.allowedStepActions).trim() && stepAction) {
        const allowed = String(a.allowedStepActions)
          .split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        if (allowed.length && !allowed.includes(String(stepAction).toUpperCase())) return false
      }
      if (a.allowedStatusesJson) {
        try {
          const allowed = JSON.parse(a.allowedStatusesJson)
          if (Array.isArray(allowed) && allowed.length && !allowed.includes(verdict)) return false
        } catch { /* malformed JSON must not hide the button */ }
      }
      return true
    })
  }, [actions, verdict, assignedToViewer, hasSections, stepAction])

  if (!visible.length) return null

  const run = async (a) => {
    let meta = {}
    try { meta = a.payloadTemplateJson ? JSON.parse(a.payloadTemplateJson) : {} } catch {}

    const confirmMsg = a.confirmationMessage || meta.__confirm
    if ((a.requiresConfirmation || meta.__confirm) && confirmMsg
        && !window.confirm(substituteQuestionTokens(confirmMsg, ctx))) return

    // ── requires_remarks ────────────────────────────────────────────────
    //
    // The module page collects this in its confirm dialog and sends it as
    // payload.remarks — same key here, so one ui_actions row behaves the same
    // whichever surface renders it.
    //
    // window.prompt rather than a modal, for the reason documented at the top
    // of RemediationPanel in AssessmentReviewTab: an ancestor of these tabs
    // carries a CSS transform, so position:fixed resolves against that
    // ancestor rather than the viewport, and two of the three in-page modals
    // in this module had to be rewritten as inline panels because of it. The
    // executor already uses window.confirm for the confirmation case; this
    // keeps the pair consistent rather than introducing a third pattern that
    // would need a portal.
    //
    // Cancel returns null and an empty answer is not a remark, so both abort.
    // The flag means the server needs the text — sending the action without it
    // would be a 400 the person cannot interpret.
    let remarks = null
    if (a.requiresRemarks) {
      remarks = window.prompt(
        substituteQuestionTokens(a.confirmationMessage || `${a.label} — add a remark`, ctx))
      if (remarks == null || !String(remarks).trim()) return
      remarks = String(remarks).trim()
    }

    if (meta.__navRoute) {
      navigate(substituteQuestionTokens(meta.__navRoute, ctx))
      return
    }
    if (!a.apiEndpoint) {
      toast.error(`${a.label} has no endpoint configured`)
      return
    }

    // Tokens inside body values too, so a payload can carry
    // {"questionInstanceId": "{questionInstanceId}"} without a special case.
    const body = Object.fromEntries(
      Object.entries(meta)
        .filter(([k]) => !k.startsWith('__'))
        .map(([k, v]) => [k, typeof v === 'string' ? substituteQuestionTokens(v, ctx) : v]))
    // After the template, so a payload_template_json that names `remarks`
    // cannot overwrite what the person actually typed.
    if (remarks) body.remarks = remarks

    // A token that resolves to nothing leaves an empty query value behind —
    // '?taskId={taskId}' with no task becomes '?taskId=', and Spring answers a
    // @RequestParam Long with a 400 ("Failed to convert value of type String
    // to Long") rather than treating it as absent. Strip empty pairs, then
    // tidy up a query string that is now empty or starts with '&'.
    const url = substituteQuestionTokens(a.apiEndpoint, ctx)
      .replace(/([?&])[^=&?]+=(?=&|$)/g, '$1')
      .replace(/[?&]+$/, '')
      .replace(/\?&+/, '?')
      .replace(/&&+/g, '&')
    const method = (a.httpMethod || 'POST').toUpperCase()

    setBusy(a.actionKey)
    try {
      if (method === 'GET')         await api.get(url)
      else if (method === 'PUT')    await api.put(url, body)
      else if (method === 'PATCH')  await api.patch(url, body)
      else if (method === 'DELETE') await api.delete(url)
      else                          await api.post(url, body)
      toast.success(`${a.label} done`)
      onDone?.()
    } catch (e) {
      toast.error(e?.response?.data?.error?.message || e?.message || `${a.label} failed`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {visible.map(a => {
        const Icon = a.icon ? (LucideIcons[a.icon] || LucideIcons[a.icon + 'Icon']) : null
        return (
          <button
            key={a.id ?? a.actionKey}
            type="button"
            disabled={busy === a.actionKey}
            onClick={(e) => { e.stopPropagation(); run(a) }}
            title={a.label}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-ctl border text-[11px] font-medium',
              'transition-colors disabled:opacity-50 disabled:cursor-wait',
              a.variant === 'danger'
                ? 'border-status-fail-bd text-status-fail-fg hover:bg-status-fail-bg'
                : a.variant === 'primary'
                  ? 'border-brand-500 bg-brand-500 text-white hover:opacity-90'
                  : 'border-border text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
            )}>
            {Icon && <Icon size={11} />}
            {a.label}
          </button>
        )
      })}
    </div>
  )
}