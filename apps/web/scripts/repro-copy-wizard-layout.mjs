/**
 * Feedback loop for copy-departure wizard layout bug.
 *
 * Symptom: with step rail hidden (copy mode), wizardBody still uses
 * `grid-template-columns: 240px minmax(0, 1fr)`, so the sole child
 * (workspace) is placed in the 240px first track and looks crushed.
 *
 * Run: node apps/web/scripts/repro-copy-wizard-layout.mjs
 * Exit 1 = bug present (red). Exit 0 = fixed (green).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cssPath = join(__dirname, '../src/features/departure/components/CreateDepartureWizard.module.css')
const tsxPath = join(__dirname, '../src/features/departure/components/CreateDepartureWizard.tsx')
const css = readFileSync(cssPath, 'utf8')
const tsx = readFileSync(tsxPath, 'utf8')

if (!css.includes('.wizardBodyNoRail')) {
  console.error('RED: CreateDepartureWizard.module.css missing .wizardBodyNoRail')
  process.exit(1)
}
if (!tsx.includes('wizardBodyNoRail')) {
  console.error('RED: CreateDepartureWizard.tsx does not apply wizardBodyNoRail in copy/no-rail layout')
  process.exit(1)
}

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
${css}
body { margin: 0; }
.card { width: 1200px; border: 1px solid #ddd; }
</style>
</head>
<body>
  <!-- Mirrors copy mode: no .stepRail, single-column body class -->
  <div class="card">
    <div class="wizardBody wizardBodyNoRail" id="copyBody">
      <main class="workspace" id="copyWorkspace">
        <div id="probe" style="background:#fee;min-height:80px">form content</div>
      </main>
    </div>
  </div>

  <!-- Control: create mode with both columns -->
  <div class="card" style="margin-top:24px">
    <div class="wizardBody" id="createBody">
      <aside class="stepRail">steps</aside>
      <main class="workspace" id="createWorkspace">
        <div style="background:#efe;min-height:80px">form content</div>
      </main>
    </div>
  </div>
</body>
</html>`

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_PATH ||
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
})
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.setContent(html, { waitUntil: 'load' })

const metrics = await page.evaluate(() => {
  const copyWs = document.getElementById('copyWorkspace')
  const createWs = document.getElementById('createWorkspace')
  const copyBody = document.getElementById('copyBody')
  return {
    copyWorkspaceWidth: copyWs.getBoundingClientRect().width,
    createWorkspaceWidth: createWs.getBoundingClientRect().width,
    copyBodyWidth: copyBody.getBoundingClientRect().width,
    copyGridColumns: getComputedStyle(copyBody).gridTemplateColumns,
  }
})

await browser.close()

console.log(JSON.stringify(metrics, null, 2))

// Bug: copy workspace is stuck in the 240px track (allow small float tolerance)
const stuckInFirstTrack = metrics.copyWorkspaceWidth < 300
const createLooksNormal = metrics.createWorkspaceWidth > 800

if (!createLooksNormal) {
  console.error('Control layout unexpected — harness invalid')
  process.exit(2)
}

if (stuckInFirstTrack) {
  console.error(
    `RED: copy-mode workspace width=${metrics.copyWorkspaceWidth.toFixed(1)}px (expected ~full card width; squeezed into 240px track)`,
  )
  process.exit(1)
}

console.log(
  `GREEN: copy-mode workspace width=${metrics.copyWorkspaceWidth.toFixed(1)}px`,
)
process.exit(0)
