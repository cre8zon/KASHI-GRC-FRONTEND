/**
 * KashiGRC "Registry" — Tailwind theme extension.
 * Merge into tailwind.config.js → theme.extend.
 * Class names match what the codebase already uses
 * (bg-surface-raised, text-text-primary, border-border, brand-500 …)
 * so existing markup re-skins automatically.
 */
export const registryTheme = {
  colors: {
    brand: {
      50:  'rgb(var(--color-brand-50) / <alpha-value>)',
      100: 'rgb(var(--color-brand-100) / <alpha-value>)',
      200: 'rgb(var(--color-brand-200) / <alpha-value>)',
      300: 'rgb(var(--color-brand-300) / <alpha-value>)',
      400: 'rgb(var(--color-brand-400) / <alpha-value>)',
      500: 'rgb(var(--color-brand-500) / <alpha-value>)',
      600: 'rgb(var(--color-brand-600) / <alpha-value>)',
      700: 'rgb(var(--color-brand-700) / <alpha-value>)',
      800: 'rgb(var(--color-brand-800) / <alpha-value>)',
      900: 'rgb(var(--color-brand-900) / <alpha-value>)',
    },
    accent: 'rgb(var(--color-accent) / <alpha-value>)',
    ink: { 900: '#0E1F33' },

    surface: {
      DEFAULT: 'var(--surface)',
      raised:  'var(--surface-raised)',
      overlay: 'var(--surface-overlay)',
      inset:   'var(--surface-inset)',
    },
    text: {
      primary:   'var(--text-primary)',
      secondary: 'var(--text-secondary)',
      muted:     'var(--text-muted)',
      faint:     'var(--text-faint)',
    },
    border: {
      DEFAULT: 'var(--border)',
      subtle:  'var(--border-subtle)',
      strong:  'var(--border-strong)',
    },

    // Semantic status — the ONLY colors allowed for state.
    status: {
      'pass-bg': 'var(--status-pass-bg)',    'pass-fg': 'var(--status-pass-fg)',    'pass-bd': 'var(--status-pass-bd)',
      'fail-bg': 'var(--status-fail-bg)',    'fail-fg': 'var(--status-fail-fg)',    'fail-bd': 'var(--status-fail-bd)',
      'warn-bg': 'var(--status-warn-bg)',    'warn-fg': 'var(--status-warn-fg)',    'warn-bd': 'var(--status-warn-bd)',
      'info-bg': 'var(--status-info-bg)',    'info-fg': 'var(--status-info-fg)',    'info-bd': 'var(--status-info-bd)',
      'pending-bg': 'var(--status-pending-bg)', 'pending-fg': 'var(--status-pending-fg)', 'pending-bd': 'var(--status-pending-bd)',
      'tag-bg':  'var(--status-tag-bg)',     'tag-fg':  'var(--status-tag-fg)',     'tag-bd':  'var(--status-tag-bd)',
    },
  },

  borderRadius: {
    badge: 'var(--radius-badge)',
    ctl:   'var(--radius-ctl)',
    card:  'var(--radius-card)',
    modal: 'var(--radius-modal)',
  },

  boxShadow: {
    elevated: 'var(--shadow-elevated)',
    hover:    'var(--shadow-hover)',
    overlay:  'var(--shadow-overlay)',
  },

  fontFamily: {
    sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
    mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
  },
}
