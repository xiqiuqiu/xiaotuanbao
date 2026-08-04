#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..')

console.log('线路视图收入/成本模式原型')
console.log('')
console.log('启动 web dev 后访问：')
console.log('  http://localhost:5173/prototype/route-ledger-mode')
console.log('')

const child = spawn('pnpm', ['--filter', 'web', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', (code) => process.exit(code ?? 0))
