/**
 * Minimal JWT helpers — read-only, no signature check (the server does that).
 *
 * Used to schedule session work from the token's own `exp` claim. The
 * session.expiresAt field the API returns is a zone-less LocalDateTime in the
 * SERVER's time zone; a browser in IST reading a UTC server's value is 5½
 * hours off. `exp` is seconds since the epoch, so it is the same everywhere.
 */
export function decodeJwt(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Expiry of a JWT in epoch ms, or null when it cannot be read. */
export function jwtExpiryMs(token) {
  const p = decodeJwt(token)
  return p && typeof p.exp === 'number' ? p.exp * 1000 : null
}

/** True when the token is missing, unreadable, or expires within `skewMs`. */
export function isJwtExpired(token, skewMs = 0) {
  const exp = jwtExpiryMs(token)
  return !exp || Date.now() + skewMs >= exp
}
