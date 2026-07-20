import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * 后端「命令式鉴权必须登记」静态守卫（配合 ADR-0023 / ADR-0024 与权限矩阵 e2e）。
 *
 * 权限矩阵 e2e 只能看见**声明式**守卫（@RequireMenu / PlatformAdminGuard）——它遍历路由
 * 元数据。凡是在 controller / service 方法体内**命令式**调用 `authService.getMenuKeysForUser`
 * 或 `getPermissionKeysForUser` 再抛 403 的鉴权，矩阵一律看不见，会成为「UI 能点、API 403」
 * 或「本该拒绝却放行」的盲区（finance-reference 的计调 403 bug 正源于此）。
 *
 * 命令式鉴权并非永远错：当所需权限 key 取决于运行时数据（如按记录 direction 选
 * /finance/receivable 或 /finance/payable）时，静态装饰器表达不了，命令式是合理的。
 * 因此本守卫是**强制登记**而非一律禁止：任何命令式鉴权点都必须在 IMPERATIVE_AUTH_ALLOWLIST
 * 里带理由登记，否则变红，逼其显式暴露给评审、并由专属单测/文档兜底。
 */

// 调用点（前置 `.`）而非定义处；auth.service 的方法定义 `async getMenuKeysForUser(` 不带点，天然排除。
const IMPERATIVE_AUTH_CALL = /\.\s*(getMenuKeysForUser|getPermissionKeysForUser)\s*\(/

/** 允许命令式鉴权的文件（相对 apps/api/src）→ 理由。新增命令式鉴权未登记 → 变红。 */
const IMPERATIVE_AUTH_ALLOWLIST: Record<string, string> = {
  'modules/finance/payment-schedule.service.ts':
    'cancel/reopen/adjustAmount 所需 key 取决于节点 direction（应收→/finance/receivable、应付→/finance/payable），@RequireMenu 单键静态表达不了；controller 已挂 /finance/receivable，service 内按 direction 做运行时精确校验作更细防线。',
}

const SRC_ROOT = resolve(__dirname, '../..')

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (
      (entry.name.endsWith('.controller.ts') || entry.name.endsWith('.service.ts')) &&
      !entry.name.endsWith('.spec.ts')
    ) {
      out.push(full)
    }
  }
  return out
}

function filesWithImperativeAuth(): string[] {
  return collectSourceFiles(SRC_ROOT)
    .filter((file) => IMPERATIVE_AUTH_CALL.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC_ROOT, file))
    .sort()
}

describe('命令式鉴权必须登记 静态守卫 (ADR-0024)', () => {
  it('controller/service 内任何命令式 getMenuKeysForUser/getPermissionKeysForUser 都已登记', () => {
    const detected = filesWithImperativeAuth()
    const registered = new Set(Object.keys(IMPERATIVE_AUTH_ALLOWLIST))
    const unregistered = detected.filter((path) => !registered.has(path))
    expect(unregistered).toEqual([])
  })

  it('保鲜：allowlist 无失效条目（登记文件仍确有命令式鉴权）', () => {
    const detected = new Set(filesWithImperativeAuth())
    const stale = Object.keys(IMPERATIVE_AUTH_ALLOWLIST).filter((path) => !detected.has(path))
    expect(stale).toEqual([])
  })
})
