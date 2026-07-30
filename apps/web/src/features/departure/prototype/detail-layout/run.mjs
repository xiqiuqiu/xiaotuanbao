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
║  PROTOTYPE · 发团详情导航 + 执行安排布局（throwaway）         ║
╠════════════════════════════════════════════════════════════╣
║  Question:                                                 ║
║    1) 业务/财务 Tab 放哪里更便于操作？                        ║
║    2) 发团级资源 vs 按日资源如何拆布局？                      ║
║                                                            ║
║    A 顶栏页签 · 「全程」伪日段                                ║
║    B 两级导航 · 横向日程轴                                   ║
║    C 窄图标轨 · 种类×日期矩阵                                ║
║                                                            ║
║  1) 等 Vite 起来后登录（admin / admin123）                   ║
║  2) 打开任意发团详情，访问：                                  ║
║     /departure/<id>?tab=execution&variant=A                ║
║  3) 底部切换条 / ← → 切换方案                                ║
╚════════════════════════════════════════════════════════════╝
`)

const child = spawn('pnpm', ['--filter', 'web', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => process.exit(code ?? 0))
