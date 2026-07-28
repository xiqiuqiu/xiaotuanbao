import { formatCents } from '../catalog'

export type ReceivableBalanceAnomalyAmounts = {
  actualCents: number
  expectedCents: number
  differenceCents: number
}

/**
 * 概览「receivable_balance」异常的产品文案。
 * 避免「守恒 / 组成合计」等内部术语；用少了/多出表达差额方向。
 */
export function formatReceivableBalanceAnomalyCopy(
  anomaly: ReceivableBalanceAnomalyAmounts,
): { title: string; description: string } {
  const shortfallCents = anomaly.expectedCents - anomaly.actualCents
  const gapPhrase =
    shortfallCents > 0
      ? `少了 ${formatCents(shortfallCents)}`
      : shortfallCents < 0
        ? `多出 ${formatCents(-shortfallCents)}`
        : '金额一致'

  return {
    title: '应收与结算金额不一致',
    description: `已生成应收合计 ${formatCents(anomaly.actualCents)}，结算金额合计 ${formatCents(anomaly.expectedCents)}，${gapPhrase}`,
  }
}
