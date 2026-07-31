import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 财务工作台队列布局契约（对齐 antd 内容布局规范 + 同页计调 SettlementQueueCard）：
 * - 块级垂直列表用 Flex，不用 Space（Space 会给每个子项加包裹层，适合行内间距）
 * - 长标题 / 次要信息用 Typography.Text + ellipsis.tooltip，不用手写 -webkit-line-clamp
 *
 * jsdom 不计算省略布局，故以源码契约锁定真实症状（窄列长文换行撑破、无 tooltip）。
 */
function source(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8')
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('财务工作台队列符合 antd 内容布局组件规范', () => {
  const funds = stripComments(source('./FinanceFundsModule.tsx'))
  const receivables = stripComments(source('./FinanceReceivablesModule.tsx'))
  const homeCss = source('./HomePage.module.css')

  it('待核销流水 / 待提交账款：块级列表用 Flex，标题与 meta 用 Typography.Text ellipsis', () => {
    expect(funds).toMatch(/<Flex\s+vertical\b[^>]*className=\{styles\.queueList\}/)
    expect(funds).not.toMatch(/<\s*Space\b/)

    expect(funds).toMatch(/Typography\.Text[\s\S]*?ellipsis=\{\{\s*tooltip:/)
    expect(funds).toMatch(/type=["']secondary["'][\s\S]*?ellipsis=\{\{\s*tooltip:/)
  })

  it('应收跟进：块级列表用 Flex，标题与 meta 用 Typography.Text ellipsis', () => {
    expect(receivables).toMatch(/<Flex\s+vertical\b[^>]*className=\{styles\.queueList\}/)
    expect(receivables).not.toMatch(
      /className=\{styles\.queueList\}[\s\S]*?<\s*Space\b/,
    )

    expect(receivables).toMatch(
      /queueList[\s\S]*?Typography\.Text[\s\S]*?ellipsis=\{\{\s*tooltip:/,
    )
    expect(receivables).toMatch(
      /queueMeta[\s\S]*?ellipsis=\{\{\s*tooltip:|ellipsis=\{\{\s*tooltip:[\s\S]*?queueMeta/,
    )
  })

  it('队列标题样式交给 Typography 省略（不再手写 -webkit-line-clamp）', () => {
    const titleBlock = homeCss.match(/\.queueTitle\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(titleBlock).toMatch(/min-width:\s*0/)
    expect(titleBlock).toMatch(/flex:\s*1/)
    expect(titleBlock).not.toMatch(/-webkit-line-clamp/)
  })
})
