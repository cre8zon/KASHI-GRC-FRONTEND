import { z } from 'zod'

/**
 * The password policy — a mirror of the backend's
 * com.kashi.grc.common.security.PasswordPolicy. Keep the two identical.
 *
 *   12–128 characters, no spaces, upper + lower + digit + any symbol.
 *
 * Before this file the four password screens each had their own idea: the
 * reset page asked for 8 characters, Settings for 8, the first-login page for
 * 12 with only !@#$%^&* counted as symbols, and the server for 12 with only
 * @$!%*?& — so passwords the UI accepted were rejected by the server with a
 * generic "Request validation failed".
 */
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${PASSWORD_MIN} characters`,      test: (p) => p.length >= PASSWORD_MIN },
  { id: 'upper',  label: 'An uppercase letter (A–Z)',                 test: (p) => /[A-Z]/.test(p) },
  { id: 'lower',  label: 'A lowercase letter (a–z)',                  test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'A number (0–9)',                            test: (p) => /\d/.test(p) },
  { id: 'symbol', label: 'A symbol (e.g. ! @ # - _ .)',               test: (p) => /[^A-Za-z0-9\s]/.test(p) },
  { id: 'space',  label: 'No spaces',                                 test: (p) => p.length > 0 && !/\s/.test(p) },
]

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{12,128}$/

/** zod rule for a NEW password, with the first unmet requirement as the message. */
export const newPasswordSchema = z.string()
  .min(1, 'Enter a new password')
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)
  .superRefine((p, ctx) => {
    const failed = PASSWORD_RULES.find(r => !r.test(p))
    if (failed) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Password needs: ${failed.label.toLowerCase()}` })
  })

/** 0–4 score + label. Rules met, with a bonus for length beyond the minimum. */
export function passwordStrength(p = '') {
  if (!p) return { score: 0, label: 'Not set', tone: 'none' }
  const met = PASSWORD_RULES.filter(r => r.test(p)).length
  const all = met === PASSWORD_RULES.length
  let score = met <= 2 ? 1 : met <= 4 ? 2 : all ? 3 : 2
  if (all && p.length >= 16) score = 4
  return [
    { score: 0, label: 'Not set', tone: 'none' },
    { score: 1, label: 'Weak',    tone: 'fail' },
    { score: 2, label: 'Fair',    tone: 'warn' },
    { score: 3, label: 'Good',    tone: 'info' },
    { score: 4, label: 'Strong',  tone: 'pass' },
  ][score]
}

/**
 * Turns an API error (as shaped by the axios interceptor) into
 * { form: string|null, fields: { [name]: message } } so a page can show the
 * server's verdict next to the right input instead of a generic toast.
 */
export function parseApiError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return { form: null, fields: {}, code: null }
  const fields = { ...(err.fieldErrors || {}) }
  const field = err.details?.field
  if (field && err.message) fields[field] = err.message
  const code = err.code || null
  let form = null
  if (!Object.keys(fields).length) {
    form = code === 'NETWORK_ERROR'
      ? "Can't reach the server. Check your connection and try again."
      : (err.message || fallback)
  }
  return { form, fields, code, details: err.details || null }
}
