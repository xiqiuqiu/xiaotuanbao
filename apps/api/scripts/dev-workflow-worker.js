const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const entry = path.join(__dirname, '../dist/src/workflow-worker.main.js')
const POLL_MS = 400

let stopping = false
let child = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requestStop() {
  stopping = true
  if (child && !child.killed) {
    child.kill('SIGTERM')
  }
}

process.on('SIGINT', requestStop)
process.on('SIGTERM', requestStop)

async function waitForEntry() {
  while (!existsSync(entry) && !stopping) {
    await sleep(POLL_MS)
  }
}

async function runOnce() {
  await waitForEntry()
  if (stopping) {
    return 0
  }
  return new Promise((resolve) => {
    child = spawn(process.execPath, ['--watch', entry], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) => {
      child = null
      resolve(code ?? 0)
    })
  })
}

async function main() {
  console.log('[workflow-worker] 等待 API 编译 dist/src/workflow-worker.main.js …')
  while (!stopping) {
    const code = await runOnce()
    if (stopping) {
      break
    }
    console.error(`[workflow-worker] 进程退出 code=${code}，等待重新编译后重启`)
    await sleep(POLL_MS)
  }
}

void main()
