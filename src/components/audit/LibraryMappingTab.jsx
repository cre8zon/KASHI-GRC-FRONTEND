/**
 * LibraryMappingTab.jsx
 *
 * Reusable tab for showing and managing library-level mappings.
 * Used in THREE places:
 *
 *   1. Test detail page → Controls tab
 *      entityType="TEST"  entityId={testId}
 *      → GET  /v1/audit/library/tests/{testId}/controls
 *      → POST /v1/audit/library/controls/{controlId}/tests/{testId}
 *      → DEL  /v1/audit/library/controls/{controlId}/tests/{testId}
 *
 *   2. Policy detail page → Controls tab
 *      entityType="POLICY"  entityId={policyId}
 *      → GET  /v1/audit/library/policies/{policyId}/controls
 *      → POST /v1/audit/library/controls/{controlId}/policies/{policyId}
 *      → DEL  /v1/audit/library/controls/{controlId}/policies/{policyId}
 *
 *   3. Control detail page → Tests tab  (entityType="CONTROL", linkedType="TEST")
 *      entityType="CONTROL"  entityId={controlId}
 *      → GET  /v1/audit/library/controls/{controlId}/tests
 *      → POST /v1/audit/library/controls/{controlId}/tests/{testId}
 *      → DEL  /v1/audit/library/controls/{controlId}/tests/{testId}
 *
 *   4. Control detail page → Policies tab  (entityType="CONTROL", linkedType="POLICY")
 *
 * HOW TO USE in Screen Designer + UniversalModulePage:
 *
 *   1. In Screen Designer, add a custom tab with key "controls" to audit_test_detail.
 *      The CustomTabContent component in UniversalModulePage checks for "controls" key
 *      and renders this component instead of the generic field grid.
 *
 *   2. The same applies to "tests" and "policies" tabs on a control detail screen.
 *
 * This file is imported by CustomTabContent in UniversalModulePage.
 */

import { useState, useMemo }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, Trash2, Plus, Search, X, ExternalLink,
         Shield, Zap, FileText, AlertTriangle,
         Building2, Lock, EyeOff }                from 'lucide-react'
import { useNavigate }             from 'react-router-dom'
import { cn }                      from '../../lib/cn'
import api                         from '../../config/axios.config'
import toast                       from 'react-hot-toast'
import { Modal }                   from '../ui/Modal'
import { Button }                  from '../ui/Button'

// ─── API helpers (direct — avoids circular import from audit.api.js) ──────────

const libraryApi = {
  // Tests
  getTestControls:      (testId)              => api.get(`/v1/audit/library/tests/${testId}/controls`),
  // Policies
  getPolicyControls:    (policyId)            => api.get(`/v1/audit/library/policies/${policyId}/controls`),
  // Controls → tests / policies
  getControlTests:      (controlId)           => api.get(`/v1/audit/library/controls/${controlId}/tests`),
  getControlPolicies:   (controlId)           => api.get(`/v1/audit/library/controls/${controlId}/policies`),
  // Link
  linkTestControl:      (controlId, testId)   => api.post(`/v1/audit/library/controls/${controlId}/tests/${testId}`),
  linkPolicyControl:    (controlId, policyId) => api.post(`/v1/audit/library/controls/${controlId}/policies/${policyId}`),
  // Unlink
  unlinkTestControl:    (controlId, testId)   => api.delete(`/v1/audit/library/controls/${controlId}/tests/${testId}`),
  unlinkPolicyControl:  (controlId, policyId) => api.delete(`/v1/audit/library/controls/${controlId}/policies/${policyId}`),
  // Deletes the tenant EXCLUSION row, bringing the platform mapping back into
  // scope. The global row itself was never touched, so nothing is recreated.
  restorePolicyExclusion: (controlId, policyId) =>
    api.delete(`/v1/audit/library/controls/${controlId}/policies/${policyId}/exclusion`),
  // Search targets
  searchControls: (q)  => api.get('/v1/audit/library/controls', { params: { search: q, take: 20 } }),
  searchTests:    (q)  => api.get('/v1/audit/library/tests',    { params: { search: q, take: 20 } }),
  searchPolicies: (q)  => api.get('/v1/audit/library/policies', { params: { search: q, take: 20 } }),
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {string}  entityType   — "TEST" | "POLICY" | "CONTROL"
 * @param {number}  entityId     — the primary entity's ID
 * @param {string}  linkedType   — only for CONTROL: "TEST" | "POLICY" (which items to show)
 * @param {boolean} canEdit      — from viewContext.canEdit
 */
export function LibraryMappingTab({ entityType, entityId, linkedType, canEdit,
                                    origin, supersedes }) {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)

  // ── Derive query key and fetcher based on entity/linked types ─────────────
  const { queryKey, queryFn, addLabel, linkedEntityType } = useMemo(() => {
    if (entityType === 'TEST') {
      return {
        queryKey: ['lib-mapping', 'test-controls', entityId],
        queryFn:  () => libraryApi.getTestControls(entityId),
        addLabel: 'Link control',
        linkedEntityType: 'CONTROL',
      }
    }
    if (entityType === 'POLICY') {
      return {
        queryKey: ['lib-mapping', 'policy-controls', entityId],
        queryFn:  () => libraryApi.getPolicyControls(entityId),
        addLabel: 'Link control',
        linkedEntityType: 'CONTROL',
      }
    }
    if (entityType === 'CONTROL' && linkedType === 'TEST') {
      return {
        queryKey: ['lib-mapping', 'control-tests', entityId],
        queryFn:  () => libraryApi.getControlTests(entityId),
        addLabel: 'Link test',
        linkedEntityType: 'TEST',
      }
    }
    // CONTROL + POLICY
    return {
      queryKey: ['lib-mapping', 'control-policies', entityId],
      queryFn:  () => libraryApi.getControlPolicies(entityId),
      addLabel: 'Link policy',
      linkedEntityType: 'POLICY',
    }
  }, [entityType, entityId, linkedType])

  const { data, isLoading } = useQuery({
    queryKey, queryFn,
    enabled: !!entityId,
    staleTime: 30_000,
  })

  const items = useMemo(() => {
    if (!data) return []
    // axios interceptor unwraps ApiResponse: response.data?.data ?? response.data
    // So data IS the array when backend returns ApiResponse<List<...>>
    if (Array.isArray(data)) return data
    // Fallback for other shapes
    if (Array.isArray(data?.data)) return data.data
    if (Array.isArray(data?.items)) return data.items
    return []
  }, [data])

  // The list carries active mappings AND this tenant's exclusions of platform
  // policies; they render in two different places, so split once here.
  const activeItems   = useMemo(() => items.filter(i => !i.excluded), [items])
  const excludedItems = useMemo(() => items.filter(i =>  i.excluded), [items])
  const [showExcluded, setShowExcluded] = useState(false)

  // Restoring deletes the tenant EXCLUSION row, which brings the platform
  // mapping back into scope. The global row was never touched, so there is
  // nothing to recreate.
  const restore = useMutation({
    mutationFn: (policyId) => libraryApi.restorePolicyExclusion(entityId, policyId),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success('Platform policy restored') },
    onError:   (e) => toast.error(e?.message || 'Failed to restore'),
  })

  // ── Unlink mutation ───────────────────────────────────────────────────────
  const unlinkMut = useMutation({
    mutationFn: ({ controlId, linkedId }) => {
      if (entityType === 'TEST'    || (entityType === 'CONTROL' && linkedType === 'TEST'))
        return libraryApi.unlinkTestControl(controlId, linkedId)
      return libraryApi.unlinkPolicyControl(controlId, linkedId)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success('Unlinked') },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const handleUnlink = (item) => {
    if (!window.confirm('Remove this mapping?')) return
    const controlId = entityType === 'CONTROL' ? entityId : item.controlId
    const linkedId  = entityType === 'CONTROL' ? item.testId || item.policyId : entityId
    unlinkMut.mutate({ controlId, linkedId })
  }

  const icon = { TEST: Zap, POLICY: FileText, CONTROL: Shield }
  const MappingIcon = icon[linkedEntityType] || Link2

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Linked {linkedEntityType === 'CONTROL' ? 'Controls' : linkedEntityType === 'TEST' ? 'Tests' : 'Policies'}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            {linkedEntityType === 'CONTROL'
              ? 'Controls this item covers — used at engagement activation to create instances.'
              : `Library ${linkedEntityType.toLowerCase()}s linked to this control.`}
          </p>

          {/* What actually happens at engagement creation.
              A tenant who customises a platform policy has no way to tell whether
              their copy or the original will be used — both are mapped to the same
              controls, and the answer lives in snapshotPolicies. Say it here, on
              the screen where they are editing the mappings. */}
          {origin === 'ORG' && (
            <p className="text-xs text-brand-ink mt-1.5 flex items-start gap-1.5">
              <Building2 size={11} className="shrink-0 mt-0.5" />
              <span>
                This is your organisation&apos;s own policy. Engagements you create will
                snapshot <strong>this</strong> version
                {supersedes ? ' instead of the platform policy it was copied from' : ''}
                {' '}— once it is Approved or Under review.
              </span>
            </p>
          )}
          {origin === 'GLOBAL' && (
            <p className="text-xs text-text-muted mt-1.5 flex items-start gap-1.5">
              <Lock size={11} className="shrink-0 mt-0.5" />
              <span>
                Platform policy — these mappings are maintained centrally. Customise it
                to map your own controls.
              </span>
            </p>
          )}
        </div>
        {canEdit && (
          <Button size="sm" icon={Plus} variant="secondary" onClick={() => setAddOpen(true)}>
            {addLabel}
          </Button>
        )}
      </div>

      {/* Excluded platform policies — collapsed, restorable.

          Deliberately NOT hidden outright. "Why is the platform Acceptable Use
          Policy not on this control?" is a question an auditor asks, and a
          silent gap is a finding. One collapsed line answers it; an invisible
          exclusion does not. */}
      {excludedItems.length > 0 && (
        <div className="rounded-card border border-border bg-surface-overlay/30">
          <button onClick={() => setShowExcluded(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left">
            <Lock size={12} className="text-text-muted" />
            <span className="text-xs text-text-secondary">
              {excludedItems.length} platform {excludedItems.length === 1 ? 'policy' : 'policies'} excluded
            </span>
            <span className="ml-auto text-[10px] text-text-muted">
              {showExcluded ? 'hide' : 'show'}
            </span>
          </button>
          {showExcluded && (
            <div className="px-3 pb-3 space-y-2">
              {excludedItems.map(item => (
                <div key={item.mappingId}
                  className="flex items-center gap-3 p-2.5 rounded-ctl border border-border bg-background">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono text-text-muted">{item.policyRef}</span>
                    <p className="text-sm text-text-secondary truncate line-through decoration-text-muted/50">
                      {item.policyTitle}
                    </p>
                    {item.mappingNote && (
                      <p className="text-[10px] text-text-muted mt-0.5">{item.mappingNote}</p>
                    )}
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="ghost"
                      onClick={() => restore.mutate(item.policyId)}
                      disabled={restore.isPending}>
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mapping list */}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-text-muted">Loading…</div>
      ) : activeItems.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-border rounded-card">
          <MappingIcon size={24} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm font-medium text-text-secondary">
            No {linkedEntityType === 'CONTROL' ? 'controls' : linkedEntityType === 'TEST' ? 'tests' : 'policies'} linked
          </p>
          <p className="text-xs text-text-muted mt-1">
            {canEdit ? `Click "${addLabel}" to create the first mapping.` : 'No mappings configured.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeItems.map((item, i) => (
            <MappingRow
              key={item.id || i}
              item={item}
              linkedEntityType={linkedEntityType}
              canEdit={canEdit}
              onUnlink={() => handleUnlink(item)}
            />
          ))}
        </div>
      )}

      {/* Add mapping modal */}
      {addOpen && (
        <AddMappingModal
          entityType={entityType}
          entityId={entityId}
          linkedEntityType={linkedEntityType}
          linkedType={linkedType}
          existingIds={items.map(i => i.controlId || i.testId || i.policyId)}
          queryKey={queryKey}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}

// ─── MappingRow ───────────────────────────────────────────────────────────────

function MappingRow({ item, linkedEntityType, canEdit, onUnlink }) {
  const navigate = useNavigate()
  const icon = { TEST: Zap, POLICY: FileText, CONTROL: Shield }
  const RowIcon = icon[linkedEntityType] || Link2

  // item shapes vary: {controlId, controlName, controlRef} or {testId, testRef, name} etc.
  const ref   = item.controlCode || item.controlRef || item.testRef || item.policyRef || `#${item.id}`
  const name  = item.controlName || item.testName || item.policyTitle || item.name || item.title || '—'
  const tag   = item.controlTag  || item.frameworkRef || ''

  // Ownership of the LINKED item — currently supplied only for policies mapped
  // to a control. A tenant MAY add their own policy to a global control (the
  // mapping row is tenant-scoped) but may NOT unlink a platform policy, because
  // the server guards that with requireOwnedPolicy. An enabled bin icon on those
  // rows was a guaranteed 403.
  // Deep link target. The mapping rows name a real record — a control, a test or
  // a policy — and clicking them did nothing, so the only way to read the thing
  // you just linked was to navigate the library by hand.
  const linkedId   = item.controlId || item.testId || item.policyId
  const linkedPath = linkedEntityType === 'CONTROL' ? 'audit_control'
                   : linkedEntityType === 'TEST'    ? 'audit_test'
                   : 'audit_policy'

  const rowOrigin  = item.policyOrigin
  const unlinkable = item.policyUnlinkable !== false
  const supersedes = item.supersedesPolicyId != null

  return (
    <div className="flex items-center gap-3 p-3 rounded-card border border-border bg-background hover:border-border-strong transition-colors group">
      <div className="w-8 h-8 rounded-ctl bg-surface-overlay border border-border flex items-center justify-center shrink-0">
        <RowIcon size={14} className="text-text-muted" />
      </div>
      {/* Deep link. Opens the linked record's detail page rather than leaving
          the user to find it in the library by hand. Not an <a> because the row
          also carries action buttons — a nested interactive element inside an
          anchor is invalid and swallows their clicks. */}
      <div className="flex-1 min-w-0 cursor-pointer"
        role="link" tabIndex={0}
        onClick={() => linkedId && navigate(`/module/${linkedPath}/${linkedId}`)}
        onKeyDown={(e) => {
          if (linkedId && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault(); navigate(`/module/${linkedPath}/${linkedId}`)
          }
        }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted">{ref}</span>
          {tag && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-ink">
              {tag}
            </span>
          )}
          {rowOrigin && (
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border',
              rowOrigin === 'GLOBAL'
                ? 'bg-surface-overlay border-border text-text-muted'
                : 'bg-brand-500/10 border-brand-500/20 text-brand-ink')}>
              {rowOrigin === 'GLOBAL' ? 'Platform' : 'Custom'}
            </span>
          )}
          {supersedes && (
            <span title="Replaces the platform policy it was copied from when an engagement is created"
              className="text-[9px] px-1.5 py-0.5 rounded bg-status-warn-bg border border-status-warn-bd text-status-warn-fg">
              Supersedes platform
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-text-primary truncate">{name}</p>
      </div>
      {/* A PLATFORM row is no longer locked. unlinkControlPolicy records an
          EXCLUSION for it — a tenant-owned row saying "not applicable to us" —
          which is reversible and leaves the global mapping untouched. The lock
          icon was correct only while that was impossible.

          Different icon and wording so the two are not confused: removing your
          own mapping deletes it; excluding a platform one hides it for your
          organisation and can be restored below. */}
      {canEdit && (unlinkable ? (
        <button
          onClick={onUnlink}
          title="Remove mapping"
          className="p-1.5 text-text-muted hover:text-status-fail-fg opacity-0 group-hover:opacity-100 transition-all rounded">
          <Trash2 size={13} />
        </button>
      ) : (
        <button
          onClick={onUnlink}
          title="Not applicable to us — exclude this platform policy from this control. Reversible."
          className="p-1.5 text-text-muted hover:text-status-warn-fg opacity-0 group-hover:opacity-100 transition-all rounded">
          <EyeOff size={13} />
        </button>
      ))}
    </div>
  )
}

// ─── AddMappingModal ──────────────────────────────────────────────────────────

function AddMappingModal({ entityType, entityId, linkedEntityType, linkedType, existingIds, queryKey, onClose }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  // Search results
  const { data: searchRes, isLoading: searching } = useQuery({
    queryKey: ['lib-mapping-search', linkedEntityType, search],
    queryFn: () => {
      if (linkedEntityType === 'CONTROL') return libraryApi.searchControls(search)
      if (linkedEntityType === 'TEST')    return libraryApi.searchTests(search)
      return libraryApi.searchPolicies(search)
    },
    staleTime: 15_000,
  })

  const results = useMemo(() => {
    const raw = Array.isArray(searchRes) ? searchRes
               : Array.isArray(searchRes?.data) ? searchRes.data
               : searchRes?.items || searchRes?.data?.items || []
    return raw.filter(r => !existingIds.includes(r.id))
  }, [searchRes, existingIds])

  const linkMut = useMutation({
    mutationFn: () => {
      if (!selected) return Promise.reject(new Error('Select an item first'))
      const controlId = entityType === 'CONTROL' ? entityId : selected.id
      const linkedId  = entityType === 'CONTROL' ? selected.id : entityId
      if (linkedEntityType === 'TEST'   || (entityType === 'CONTROL' && linkedType === 'TEST'))
        return libraryApi.linkTestControl(controlId, linkedId)
      return libraryApi.linkPolicyControl(controlId, linkedId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      toast.success('Linked successfully')
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to link'),
  })

  const getItemLabel = (item) => item.controlRef || item.testRef || item.policyRef || `#${item.id}`
  const getItemName  = (item) => item.controlName || item.name || item.title || '—'

  return (
    <Modal
      open
      onClose={onClose}
      title={`Link ${linkedEntityType.charAt(0) + linkedEntityType.slice(1).toLowerCase()}`}
      subtitle={`Search and select a ${linkedEntityType.toLowerCase()} to link`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!selected} loading={linkMut.isPending} onClick={() => linkMut.mutate()}>
            Link {selected ? getItemLabel(selected) : '—'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${linkedEntityType.toLowerCase()}s…`}
            autoFocus
            className="w-full pl-9 pr-3 h-9 text-sm bg-surface-overlay border border-border rounded-card text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto space-y-1">
          {searching && (
            <div className="py-6 text-center text-sm text-text-muted">Searching…</div>
          )}
          {!searching && results.length === 0 && (
            <div className="py-6 text-center text-sm text-text-muted">
              {search ? 'No results found' : 'Type to search'}
            </div>
          )}
          {results.map(item => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-card border text-left transition-all',
                selected?.id === item.id
                  ? 'border-brand-500 bg-brand-500/8'
                  : 'border-border hover:border-brand-500/30 bg-background'
              )}
            >
              <span className="text-xs font-mono text-text-muted shrink-0">{getItemLabel(item)}</span>
              <span className="text-sm text-text-primary font-medium flex-1 truncate">{getItemName(item)}</span>
              {item.controlTag && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-text-muted shrink-0">
                  {item.controlTag}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}