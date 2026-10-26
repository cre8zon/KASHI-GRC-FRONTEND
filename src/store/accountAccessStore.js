import { useSyncExternalStore } from 'react'

/**
 * Whether the signed-in organisation is read-only right now.
 *
 * A suspended organisation keeps read access for a grace period, then is
 * blocked (AccountAccessService on the server). Every API response during
 * that time carries `X-Account-Access: READ_ONLY` and, when known,
 * `X-Account-Access-Until`; the axios interceptor feeds them here and the app
 * shell shows a banner. Writes are refused by the server with TENANT_READ_ONLY.
 *
 *   { readOnly: boolean, until: string | null }   until = ISO date-time
 */
let state = { readOnly: false, until: null }
const listeners = new Set()

export const accountAccessStore = {
  get: () => state,
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
  /** From a response's headers (axios lower-cases them). */
  fromHeaders(headers) {
    const access = headers?.['x-account-access'] || null
    const until = headers?.['x-account-access-until'] || null
    const readOnly = access === 'READ_ONLY'
    if (readOnly === state.readOnly && until === state.until) return
    state = { readOnly, until: readOnly ? until : null }
    listeners.forEach(l => l())
  },
  reset() {
    if (!state.readOnly) return
    state = { readOnly: false, until: null }
    listeners.forEach(l => l())
  },
}

export const useAccountAccess = () => useSyncExternalStore(accountAccessStore.subscribe, accountAccessStore.get)
