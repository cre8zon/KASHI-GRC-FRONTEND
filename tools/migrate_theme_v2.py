#!/usr/bin/env python3
"""
KashiGRC Calm v3 theme codemod — v2 (comprehensive).

Handles EVERY class of hardcoded styling found in the audit:
  1. Tailwind palette classes      text-red-400        -> text-status-fail-fg
  2. Neutral palette classes       bg-slate-800        -> bg-surface-raised
  3. Raw hexes                     #6b7280             -> var(--text-muted)
  4. rgb()/rgba() literals         rgb(51 65 85 / .5)  -> rgb(var(--color-border) / .5)
  5. white/black utilities         bg-white            -> bg-surface-raised
     ...context-aware:             bg-brand-500 text-white -> text-brand-900  (TONAL)
     ...dark-chrome alpha:         bg-white/10         -> bg-on-dark/10
  6. Gradients                     bg-gradient-to-br   -> flat token
  7. Legacy radii                  rounded-lg          -> rounded-card / rounded-ctl
  8. Report pages                  hexes               -> var(--rpt-*)  (print-stable)
  9. Chart colors                  CHART_COLORS        -> var(--chart-1..8)

SAFETY / WHAT IT NEVER TOUCHES:
  - colorTag DATA  ({ color: 'green' }) — semantic tags routed via COLOR_MAP
  - Vendor brand hexes (Okta/AWS/MS/Google) in EngagementIntegrationTab
  - BrandingAdminPage swatch data (its hexes are content, not style)
  - Line endings: CRLF files stay CRLF, LF stay LF (newline='' preserved)

USAGE:
  python3 tools/migrate_theme_v2.py            # dry-run report, no writes
  python3 tools/migrate_theme_v2.py --apply    # write changes
  python3 tools/migrate_theme_v2.py --apply --path src/pages/reports  # scoped

Run on a clean git branch. Review `git diff` before committing.
"""
import re, sys, os, collections

# ─────────────────────────── configuration ───────────────────────────

HUE_FAMILY = {
    'red': 'fail', 'rose': 'fail', 'pink': 'fail',
    'green': 'pass', 'emerald': 'pass', 'lime': 'pass',
    'amber': 'warn', 'yellow': 'warn', 'orange': 'warn',
    'blue': 'info', 'cyan': 'info', 'sky': 'info',
    'purple': 'tag', 'indigo': 'tag', 'violet': 'tag',
}
NEUTRALS = {'gray', 'slate', 'zinc', 'neutral', 'stone'}

STATUS_UTIL = {
    'bg': 'bg-status-{f}-bg', 'text': 'text-status-{f}-fg',
    'border': 'border-status-{f}-bd', 'ring': 'ring-status-{f}-bd',
    'stroke': 'stroke-status-{f}-fg', 'fill': 'fill-status-{f}-fg',
    'outline': 'outline-status-{f}-bd', 'decoration': 'decoration-status-{f}-fg',
    'caret': 'caret-status-{f}-fg', 'accent': 'accent-status-{f}-fg',
    'divide': 'divide-border', 'shadow': 'shadow-elevated',
}

# Files whose hexes are DATA or third-party brand identity — never touched.
# Whole-file skip: only for the tool itself and preset seed data.
SKIP_FILES = ('migrate_theme_v2',)

# HEX-ONLY protection: these files keep their hexes (data / brand identity)
# but still get class + radius migration like everything else.
HEX_PROTECTED = (
    'BrandingAdminPage',   # colour-picker swatch data — hexes ARE content
    'brandPresets',        # pastel preset seed definitions
)

# Vendor brand hexes live inside arbitrary values (text-[#007DC1]) and are
# never in the hex tables, so they survive automatically. Third-party logo
# colours must not follow the app theme.

# Report pages use the print-stable palette, never the pastel theme.
REPORT_DIR = '/reports/'

RPT_HEX = {
    '#166534': 'var(--rpt-pass-fg)', '#dcfce7': 'var(--rpt-pass-bg)',
    '#f0fdf4': 'var(--rpt-pass-bg)', '#16a34a': 'var(--rpt-pass-bd)',
    '#22c55e': 'var(--rpt-pass-bd)', '#bbf7d0': 'var(--rpt-pass-bd)',
    '#065f46': 'var(--rpt-pass-fg)',
    '#92400e': 'var(--rpt-warn-fg)', '#fef3c7': 'var(--rpt-warn-bg)',
    '#d97706': 'var(--rpt-warn-bd)', '#f59e0b': 'var(--rpt-warn-bd)',
    '#fde68a': 'var(--rpt-warn-bg)', '#fef9c3': 'var(--rpt-warn-bg)',
    '#a16207': 'var(--rpt-warn-bd)', '#78350f': 'var(--rpt-warn-fg)',
    '#9a3412': 'var(--rpt-high-fg)', '#fed7aa': 'var(--rpt-high-bg)',
    '#ffedd5': 'var(--rpt-high-bg)', '#ea580c': 'var(--rpt-high-bd)',
    '#fff7ed': 'var(--rpt-high-bg)', '#7c2d12': 'var(--rpt-high-fg)',
    '#991b1b': 'var(--rpt-crit-fg)', '#fee2e2': 'var(--rpt-crit-bg)',
    '#dc2626': 'var(--rpt-crit-bd)', '#ef4444': 'var(--rpt-crit-bd)',
    '#1d4ed8': 'var(--rpt-accent)', '#6366f1': 'var(--rpt-accent)',
    '#eff6ff': 'var(--rpt-accent-bg)', '#312e81': 'var(--rpt-accent)',
    '#4338ca': 'var(--rpt-accent)', '#6d28d9': 'var(--rpt-accent)',
    '#e0e7ff': 'var(--rpt-accent-bg)', '#ede9fe': 'var(--rpt-accent-bg)',
    '#c4b5fd': 'var(--rpt-accent-bg)', '#bfdbfe': 'var(--rpt-accent-bg)',
    '#e9d5ff': 'var(--rpt-accent-bg)', '#f5f3ff': 'var(--rpt-accent-bg)',
    '#1a1a2e': 'var(--rpt-ink)', '#1e1b4b': 'var(--rpt-ink)',
    '#1a1a1a': 'var(--rpt-ink)', '#3730a3': 'var(--rpt-accent)',
    '#fafafa': 'var(--rpt-paper)', '#f8faff': 'var(--rpt-paper)',
    '#475569': 'var(--rpt-muted)', '#64748b': 'var(--rpt-muted)',
    '#1a2233': 'var(--rpt-ink)', '#d9e0e8': 'var(--rpt-border)',
    # report neutrals (print-stable greys — NOT theme tokens)
    '#f3f4f6': 'var(--rpt-bg-soft)', '#6b7280': 'var(--rpt-muted)',
    '#e5e7eb': 'var(--rpt-border)',  '#9ca3af': 'var(--rpt-muted)',
    '#f9fafb': 'var(--rpt-paper)',   '#ffffff': 'var(--rpt-white)',
    '#374151': 'var(--rpt-ink)',     '#d1d5db': 'var(--rpt-border)',
    '#f1f5f9': 'var(--rpt-bg-soft)', '#e2e8f0': 'var(--rpt-border)',
    '#f8fafc': 'var(--rpt-paper)',
}

APP_HEX = {
    # neutrals -> surface/text/border
    '#111827': 'var(--surface)', '#0f172a': 'var(--surface)',
    '#1f2937': 'var(--surface-raised)', '#1e293b': 'var(--surface-raised)',
    '#374151': 'var(--surface-overlay)', '#334155': 'var(--surface-overlay)',
    '#4b5563': 'var(--text-faint)', '#64748b': 'var(--text-muted)',
    '#6b7280': 'var(--text-muted)', '#9ca3af': 'var(--text-muted)',
    '#94a3b8': 'var(--text-muted)', '#475569': 'var(--text-secondary)',
    '#d1d5db': 'var(--border)', '#cbd5e1': 'var(--border)',
    '#e5e7eb': 'var(--border)', '#e2e8f0': 'var(--border-subtle)',
    '#f3f4f6': 'var(--surface-overlay)', '#f1f5f9': 'var(--surface-overlay)',
    '#f9fafb': 'var(--surface)', '#f8fafc': 'var(--surface)',
    '#0a0f1e': 'var(--sidebar-dark)', '#0a0f1a': 'var(--sidebar-dark)',
    # semantic
    '#6366f1': 'var(--status-tag-fg)', '#8b5cf6': 'var(--status-tag-fg)',
    '#7c3aed': 'var(--status-tag-fg)', '#a855f7': 'var(--status-tag-fg)',
    '#ef4444': 'var(--status-fail-fg)', '#dc2626': 'var(--status-fail-fg)',
    '#e11d48': 'var(--status-fail-fg)', '#ec4899': 'var(--status-fail-fg)',
    '#f59e0b': 'var(--status-warn-fg)', '#d97706': 'var(--status-warn-fg)',
    '#f97316': 'var(--status-warn-fg)', '#fef3c7': 'var(--status-warn-bg)',
    '#22c55e': 'var(--status-pass-fg)', '#10b981': 'var(--status-pass-fg)',
    '#059669': 'var(--status-pass-fg)', '#16a34a': 'var(--status-pass-fg)',
    '#3b82f6': 'var(--status-info-fg)', '#0ea5e9': 'rgb(var(--color-brand-500))',
    '#0284c7': 'rgb(var(--color-brand-600))', '#38bdf8': 'rgb(var(--color-brand-400))',
}

# rgb()/rgba() literals -> tokenised equivalents
RGB_LITERAL = {
    'rgb(14 165 233)':      'rgb(var(--color-brand-500))',
    'rgb(51 65 85)':        'rgb(var(--color-border))',
    'rgb(51 65 85 / 0.5)':  'rgb(var(--color-border) / 0.5)',
    'rgb(22 33 56)':        'rgb(var(--color-surface-raised))',
    'rgb(100 116 139)':     'rgb(var(--color-text-muted))',
    'rgb(241 245 249)':     'rgb(var(--color-text-primary))',
    'rgb(15 23 42)':        'rgb(var(--color-surface))',
    'rgba(255,255,255,.3)': 'rgb(var(--color-on-dark) / .3)',
    'rgba(0,0,0,0.25)':     'rgb(0 0 0 / 0.25)',   # neutral scrim — fine as-is
}

# Legacy radii -> shape tokens. Order matters (longest first).
RADIUS_MAP = [
    ('rounded-2xl', 'rounded-modal'),
    ('rounded-xl',  'rounded-card'),
    ('rounded-lg',  'rounded-card'),
    ('rounded-md',  'rounded-ctl'),
    ('rounded-sm',  'rounded-ctl'),
    # rounded-full intentionally preserved (pills/avatars are already correct)
]

CLASS_RE = re.compile(
    r'(?P<prefix>(?:[a-zA-Z-]+:)*)'
    r'(?P<util>bg|text|border|ring|stroke|fill|divide|shadow|outline|decoration|caret|accent)'
    r'-(?P<hue>red|rose|pink|green|emerald|lime|amber|yellow|orange|blue|cyan|sky|purple|indigo|violet|teal|gray|slate|zinc|neutral|stone)'
    r'-(?P<shade>[0-9]{2,3})'
    r'(?P<op>/[0-9]{1,3})?'
)
HEX_RE = re.compile(r'#[0-9a-fA-F]{6}\b')
# Quoted segments WITHIN A SINGLE LINE. Class lists are always single-line in
# this codebase. Whole-file quote matching is unsafe: an apostrophe inside a
# comment ("doesn't") breaks pairing and silently skips the rest of the file.
SEGMENT_RE = re.compile(r"""(['"`])((?:(?!\1)[^\\])*?)\1""")
COMMENT_LINE_RE = re.compile(r'^\s*(//|/\*|\*)')


def _map_line_segments(line, fn):
    """Apply fn(body) to each quoted segment on a non-comment line."""
    if COMMENT_LINE_RE.match(line):
        return line
    return SEGMENT_RE.sub(lambda m: f'{m.group(1)}{fn(m.group(2))}{m.group(1)}', line)


def neutral_repl(util, shade):
    shade = int(shade)
    if util == 'text':
        if shade <= 200: return 'text-text-primary'
        if shade == 300: return 'text-text-secondary'
        if shade <= 500: return 'text-text-muted'
        return 'text-text-faint'
    if util == 'bg':
        if shade >= 900: return 'bg-surface'
        if shade >= 800: return 'bg-surface-raised'
        if shade >= 600: return 'bg-surface-overlay'
        if shade <= 100: return 'bg-surface-overlay'
        return 'bg-surface-inset'
    if util == 'border':
        return 'border-border-subtle' if shade <= 200 else 'border-border'
    if util == 'ring':   return 'ring-border'
    if util == 'divide': return 'divide-border'
    if util in ('stroke', 'fill'): return f'{util}-text-muted'
    if util == 'shadow': return 'shadow-elevated'
    return None


def repl_class(m, stats):
    prefix, util, hue, shade, op = (m.group('prefix'), m.group('util'),
                                    m.group('hue'), m.group('shade'), m.group('op') or '')
    if hue == 'teal':
        stats['brand'] += 1
        return f'{prefix}{util}-brand-{shade}{op}'
    if hue in NEUTRALS:
        r = neutral_repl(util, shade)
        if r is None:
            stats['skipped'] += 1
            return m.group(0)
        stats['neutral'] += 1
        return f'{prefix}{r}'
    fam = HUE_FAMILY[hue]
    tmpl = STATUS_UTIL.get(util)
    if tmpl is None:
        stats['skipped'] += 1
        return m.group(0)
    stats['status'] += 1
    # Opacity dropped: status tokens are pre-mixed opaque pastels.
    return f'{prefix}{tmpl.format(f=fam)}'


def fix_white_and_radii(text, stats):
    """Context-aware white/black + radius handling, line by line.

    - `text-white` in a segment that also sets `bg-brand-*` -> `text-brand-900`
      (TONAL — white on a pastel brand surface is unreadable; the live bug).
    - other whites are dark-chrome ink -> `on-dark` tokens (constant in BOTH
      themes, because the dark sidebar stays dark in light mode).
    - solid `bg-white` is a surface -> `bg-surface-raised`.
    - legacy radii -> shape tokens.
    """
    out_lines = []
    for line in text.split('\n'):
        def per_segment(body):
            new = body
            if 'white' in new or 'black' in new:
                if re.search(r'\b(bg|text|border|ring|hover|flex|px|py|rounded)\b', new):
                    if re.search(r'bg-brand-[0-9]', new):
                        before = new
                        new = re.sub(r'(?<![\w-])text-white(?![/\w-])', 'text-brand-900', new)
                        if new != before:
                            stats['tonal'] += 1
                    b2 = new
                    new = re.sub(r'(?<![\w/-])bg-white(?![/\w-])', 'bg-surface-raised', new)
                    new = re.sub(r'(?<![\w-])(bg|text|border|ring|divide)-white/(\d{1,3})',
                                 r'\1-on-dark/\2', new)
                    new = re.sub(r'(?<![\w-])(bg|text|border|ring|divide)-black/(\d{1,3})',
                                 r'\1-on-dark-inv/\2', new)
                    new = re.sub(r'(?<![\w-])text-white(?![/\w-])', 'text-on-dark', new)
                    new = re.sub(r'(?<![\w-])border-white(?![/\w-])', 'border-on-dark', new)
                    new = re.sub(r'(?<![\w-])bg-black(?![/\w-])', 'bg-on-dark-inv', new)
                    if new != b2:
                        stats['white'] += 1
            if 'rounded-' in new:
                for old, tok in RADIUS_MAP:
                    if re.search(rf'(?<![\w-]){old}(?![\w-])', new):
                        new = re.sub(rf'(?<![\w-]){old}(?![\w-])', tok, new)
                        stats['radius'] += 1
            return new
        out_lines.append(_map_line_segments(line, per_segment))
    return '\n'.join(out_lines)


def flatten_gradients(text, stats):
    """Gradients -> flat tokens.

    CRITICAL: the colour-stop pattern must be [^\s"'`]+ and NOT \S+ — \S+ is
    greedy across the closing quote and silently destroys the className string
    (`to-purple-800"` swallows the `"`). That produced a real build break.
    """
    if 'bg-gradient-to' in text:
        stop = r'[^\s"\'`]+'
        n = len(re.findall(r'bg-gradient-to-', text))
        text = re.sub(rf'bg-gradient-to-\w+\s+from-{stop}\s+via-{stop}\s+to-{stop}',
                      'bg-surface', text)
        text = re.sub(rf'bg-gradient-to-\w+\s+from-{stop}\s+to-{stop}',
                      'bg-brand-500', text)
        stats['gradient'] += n
    return text


def process(path, text, stats):
    norm = path.replace('\\', '/')
    is_report = REPORT_DIR in norm
    hex_table = RPT_HEX if is_report else APP_HEX
    hex_protected = any(h in norm for h in HEX_PROTECTED)

    # Gradients FIRST: flattening 'bg-gradient-to-r from-x to-y text-white'
    # into 'bg-brand-500 text-white' must happen before the tonal pass, or the
    # white text never gets converted to brand ink.
    text = flatten_gradients(text, stats)
    text = CLASS_RE.sub(lambda m: repl_class(m, stats), text)
    text = fix_white_and_radii(text, stats)

    if not hex_protected:
        def hx(m):
            v = m.group(0).lower()
            if v in hex_table:
                stats['hex'] += 1
                return hex_table[v]
            stats['hex_unmapped'] += 1
            return m.group(0)
        text = HEX_RE.sub(hx, text)

    # Redundant dark: variants — the base token is already theme-aware, so a
    # dark: duplicate is dead weight (and drifts out of sync). Strip them.
    before = text
    text = re.sub(r'\s+dark:(?:bg|text|border|ring)-(?:surface|text|border|brand|status|on-dark)[\w-]*', '', text)
    if text != before:
        stats['dark_stripped'] += 1

    for lit, tok in RGB_LITERAL.items():
        if lit in text:
            n = text.count(lit)
            text = text.replace(lit, tok)
            stats['rgb'] += n

    return text


def main():
    apply = '--apply' in sys.argv
    root = 'src'
    if '--path' in sys.argv:
        root = sys.argv[sys.argv.index('--path') + 1]

    stats = collections.Counter()
    changed_files = []

    for dp, _, fs in os.walk(root):
        for fn in fs:
            if not fn.endswith(('.jsx', '.js')):
                continue
            if any(s in fn for s in SKIP_FILES):
                stats['files_skipped'] += 1
                continue
            path = os.path.join(dp, fn)
            # newline='' preserves CRLF vs LF exactly as found
            with open(path, encoding='utf-8', newline='') as f:
                original = f.read()
            updated = process(path, original, stats)
            if updated != original:
                changed_files.append(path)
                if apply:
                    with open(path, 'w', encoding='utf-8', newline='') as f:
                        f.write(updated)

    mode = 'APPLIED' if apply else 'DRY-RUN (no files written — pass --apply)'
    print(f'=== KashiGRC Calm v3 codemod — {mode} ===')
    print(f'Files changed:            {len(changed_files)}')
    print(f'Files skipped (by rule):  {stats["files_skipped"]}')
    print('---')
    print(f'Status palette classes:   {stats["status"]}')
    print(f'Neutral palette classes:  {stats["neutral"]}')
    print(f'teal -> brand:            {stats["brand"]}')
    print(f'white/black class lists:  {stats["white"]}')
    print(f'  of which TONAL fixes:   {stats["tonal"]}  (white-on-pastel bug)')
    print(f'Legacy radii -> tokens:   {stats["radius"]}')
    print(f'Hexes -> vars:            {stats["hex"]}')
    print(f'rgb()/rgba() -> vars:     {stats["rgb"]}')
    print(f'Gradients flattened:      {stats["gradient"]}')
    print('---')
    print(f'Hexes left unmapped:      {stats["hex_unmapped"]}  (review these)')
    print(f'Classes left unmapped:    {stats["skipped"]}')
    if not apply:
        print('\nRe-run with --apply to write.')


if __name__ == '__main__':
    main()
