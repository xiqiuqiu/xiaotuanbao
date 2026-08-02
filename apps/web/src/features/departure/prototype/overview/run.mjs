#!/usr/bin/env node
/**
 * PROTOTYPE launcher — prints the question + URL, then starts the web app.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..')

console.log(`
╔════════════════════════════════════════════════════════════╗
║  PROTOTYPE · 发团详情概览（throwaway）                       ║
╠════════════════════════════════════════════════════════════╣
║  Question:                                                 ║
║    概览如何更清晰呈现经营与资金进度？                          ║
║                                                            ║
║    prod 正式概览                                           ║
║    A 强化主指标带                                           ║
║    B 损益纵轴 · 进度环                                      ║
║    C 报表清单 · 无卡片                                      ║
║                                                            ║
║  打开发团详情概览，底部黑色条切换；或：                        ║
║    /departure/<id>?tab=overview&variant=A                  ║
╚════════════════════════════════════════════════════════════╝
`)

const child = spawn('pnpm', ['--filter', 'web', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => process.exit(code ?? 0))
