/**
 * vite-design-guard — runs the prebuild guards while you develop:
 *   tools/check-design-system.mjs  (hardcoded colours / radii)
 *   tools/check-import-case.mjs    (import spelling vs file-name case)
 *
 * WHY: the guard only ran in `prebuild`, so a hardcoded colour written during
 * `npm run dev` stayed invisible until `npm run build` failed. This
 * plugin runs the same scripts (same rules, same baseline) when the dev server
 * starts and again whenever a file under src/ is saved, so a violation shows up
 * the moment it is written:
 *   - in the terminal, with the file, rule and line;
 *   - in the browser, as Vite's error overlay (dismissable; the app keeps running).
 *
 * Dev only (apply: 'serve'). The build is still gated by `prebuild`, unchanged.
 */
import { spawn } from 'child_process'

const SCRIPTS = ['tools/check-design-system.mjs', 'tools/check-import-case.mjs']

function runScript(script, root) {
  return new Promise(res => {
    let out = ''
    const p = spawn(process.execPath, [script], { cwd: root })
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { out += d })
    p.on('close', code => res({ ok: code === 0, out: out.trim() }))
  })
}

export default function designGuard() {
  let timer = null
  let running = false
  let again = false

  async function run(server) {
    if (running) { again = true; return }
    running = true
    const results = await Promise.all(SCRIPTS.map(f => runScript(f, server.config.root)))
    running = false
    const failed = results.filter(r => !r.ok).map(r => r.out).join('\n\n')
    if (failed) {
      server.config.logger.error('\n' + failed + '\n', { timestamp: true })
      server.ws.send({
        type: 'error',
        err: {
          message: 'Build guard: npm run build will fail until these are fixed (see DESIGN.md).\n\n' + failed,
          stack: '',
          plugin: 'design-guard',
        },
      })
    }
    if (again) { again = false; run(server) }
  }

  return {
    name: 'design-guard',
    apply: 'serve',
    configureServer(server) {
      run(server)
      const onFile = file => {
        if (!/[\\/]src[\\/].*\.(jsx?|tsx?|mjs)$/.test(file)) return
        clearTimeout(timer)
        timer = setTimeout(() => run(server), 400)
      }
      // add/unlink too: a rename (e.g. changing a file name's case) arrives as those.
      server.watcher.on('change', onFile)
      server.watcher.on('add', onFile)
      server.watcher.on('unlink', onFile)
    },
  }
}
