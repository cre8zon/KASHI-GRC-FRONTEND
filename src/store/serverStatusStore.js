/**
 * serverStatusStore.js
 *
 * Tiny singleton store for server status — allows the axios interceptor
 * to read the current status without importing React hooks.
 *
 * Place at: src/config/serverStatusStore.js
 */
let _status = 'online'

export const serverStatusStore = {
  get: () => _status,
  set: (s) => { _status = s },
}