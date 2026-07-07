const { watch, utimesSync, existsSync } = require('node:fs')
const path = require('node:path')

const touchTarget = path.join(__dirname, '../src/main.ts')
const watchDir = path.join(__dirname, '../../../packages/shared/dist')

if (!existsSync(watchDir)) {
  console.error('[shared] dist 目录不存在，请先运行 pnpm --filter @xiaotuanbao/shared build')
  process.exit(1)
}

let timer

watch(watchDir, { recursive: true }, (_event, filename) => {
  if (!filename || !filename.endsWith('.js')) {
    return
  }

  clearTimeout(timer)
  timer = setTimeout(() => {
    const now = new Date()
    utimesSync(touchTarget, now, now)
    console.log('[shared] dist 已更新，触发 API 重载')
  }, 300)
})

console.log(`[shared] 监听 ${watchDir}，变更后自动触发 API 重载`)
