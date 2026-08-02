import { describe, expect, it } from 'vitest'
import { formatReceivableBalanceAnomalyCopy } from './format-receivable-balance-anomaly'

describe('formatReceivableBalanceAnomalyCopy', () => {
  it('uses plain language when generated receivables fall short of settlement', () => {
    expect(
      formatReceivableBalanceAnomalyCopy({
        actualCents: 1_380_000,
        expectedCents: 3_330_000,
        differenceCents: -1_950_000,
      }),
    ).toEqual({
      title: '应收与结算金额不一致',
      description: '已提交应收合计 ¥13,800.00，结算金额合计 ¥33,300.00，少了 ¥19,500.00',
    })
  })

  it('says 多出 when generated receivables exceed settlement', () => {
    expect(
      formatReceivableBalanceAnomalyCopy({
        actualCents: 1_100_000,
        expectedCents: 1_000_000,
        differenceCents: 100_000,
      }),
    ).toEqual({
      title: '应收与结算金额不一致',
      description: '已提交应收合计 ¥11,000.00，结算金额合计 ¥10,000.00，多出 ¥1,000.00',
    })
  })
})
