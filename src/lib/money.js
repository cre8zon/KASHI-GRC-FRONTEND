/**
 * Money at the edge of the UI.
 *
 * The API speaks minor units (paise, cents) as integers with an ISO currency.
 * These helpers are the only place that divides or multiplies by 100, so a
 * rupee never travels as a float.
 */

const LOCALE_BY_CURRENCY = { INR: 'en-IN' }

/** 12345600, 'INR' → "₹1,23,456" (no paise unless there are some). */
export function formatMoney(minor, currency = 'INR', { compact = false } = {}) {
  if (minor === null || minor === undefined || Number.isNaN(Number(minor))) return '—'
  const major = Number(minor) / 100
  const locale = LOCALE_BY_CURRENCY[currency] || 'en-US'
  try {
    if (compact) {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
      }).format(major)
    }
    const hasFraction = Math.round(major * 100) % 100 !== 0
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency,
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(major)
  } catch {
    return `${currency} ${major.toLocaleString()}`
  }
}

/** "1,23,456.50" typed by a person → 12345650. Returns null for empty / invalid. */
export function toMinor(input) {
  if (input === null || input === undefined) return null
  const s = String(input).replace(/[^0-9.-]/g, '')
  if (s === '' || s === '-' || s === '.') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** 12345650 → "123456.5" for an <input>. */
export function toMajorInput(minor) {
  if (minor === null || minor === undefined) return ''
  return String(Number(minor) / 100)
}

export const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`)

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']
