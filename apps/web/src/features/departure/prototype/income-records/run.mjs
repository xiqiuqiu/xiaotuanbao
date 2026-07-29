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
║  PROTOTYPE · 团内增收记录 UI（throwaway）                    ║
╠════════════════════════════════════════════════════════════╣
║  Question: 增收记录页签应以何种信息架构呈现？                 ║
║    A 统计+表格+抽屉                                         ║
║    B 结算泳道推进                                           ║
║    C 类型优先录入台                                         ║
║                                                            ║
║  1) 等 Vite 起来后登录（admin / admin123）                   ║
║  2) 打开任意发团详情 → 页签「增收记录」                      ║
║  3) 或访问：                                                ║
║     /departure/<id>?tab=incomeRecords&variant=A            ║
║  4) 底部切换条 / ← → 切换方案                               ║
╚════════════════════════════════════════════════════════════╝
`)

const child = spawn('pnpm', ['--filter', 'web', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => process.exit(code ?? 0))
