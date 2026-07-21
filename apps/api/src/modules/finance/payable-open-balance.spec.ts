import {
  buildOpenPayableBaseWhere,
  PAYABLE_BALANCE_OPEN_UNPAID,
  payableOpenUnpaidHref,
  payableScheduleHref,
} from './payable-open-balance'

describe('payable-open-balance', () => {
  it('builds open payable base where without due-date or overdue windows', () => {
    expect(buildOpenPayableBaseWhere('org-1')).toEqual({
      organizationId: 'org-1',
      direction: 'payable',
      voidedAt: null,
      cancelledAt: null,
    })
    expect(JSON.stringify(buildOpenPayableBaseWhere('org-1'))).not.toContain('dueDate')
    expect(JSON.stringify(buildOpenPayableBaseWhere('org-1'))).not.toContain('overdue')
  })

  it('serializes stable drill-down hrefs', () => {
    expect(payableOpenUnpaidHref()).toBe(
      `/finance/payable?payableBalance=${PAYABLE_BALANCE_OPEN_UNPAID}`,
    )
    expect(payableScheduleHref('AP/测试 001')).toBe(
      '/finance/payable?scheduleNo=AP%2F%E6%B5%8B%E8%AF%95%20001',
    )
  })
})
