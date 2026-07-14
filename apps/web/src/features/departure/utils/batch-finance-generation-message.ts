import type { BatchFinanceGenerationResult } from '@xiaotuanbao/shared'

/** 批量生成应收/应付二次确认弹窗正文（含本次候选条数）。 */
export function formatBatchFinanceGenerationConfirmContent(
  candidateCount: number,
  noun: '应收' | '应付',
): string {
  const count = Math.max(0, Math.floor(Number(candidateCount) || 0))
  return `确认后将生成 ${count} 条${noun}记录`
}

/** 将批量生成应收/应付结果收成一句 Toast 文案。 */
export function formatBatchFinanceGenerationMessage(
  result: BatchFinanceGenerationResult,
  noun: '应收' | '应付',
): string {
  if (result.attempted === 0) {
    return `没有可生成的未生成${noun}`
  }

  const parts = [`成功 ${result.succeeded}`]
  if (result.skipped > 0) {
    parts.push(`跳过 ${result.skipped}`)
  }
  if (result.failed > 0) {
    parts.push(`失败 ${result.failed}`)
  }

  const failedSample = result.items
    .filter((item) => item.outcome === 'failed' && item.reason)
    .slice(0, 2)
    .map((item) => `${item.sourceLabel}：${item.reason}`)

  const summary = `${noun}批量生成完成：${parts.join(' · ')}`
  if (failedSample.length === 0) {
    return summary
  }
  return `${summary}。${failedSample.join('；')}`
}
