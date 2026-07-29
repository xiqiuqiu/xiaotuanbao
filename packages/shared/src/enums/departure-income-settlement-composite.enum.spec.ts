import { DepartureIncomeCollectionStatus } from './departure-income-collection-status.enum'
import { DepartureIncomeCommissionStatus } from './departure-income-commission-status.enum'
import {
  DepartureIncomeSettlementComposite,
  companyIncomeCents,
  deriveDepartureIncomeSettlementComposite,
  statusesForDepartureIncomeSettlementComposite,
} from './departure-income-settlement-composite.enum'

describe('deriveDepartureIncomeSettlementComposite', () => {
  it('maps the four collection×commission quadrants', () => {
    expect(
      deriveDepartureIncomeSettlementComposite({
        incomeStatus: DepartureIncomeCollectionStatus.UNCOLLECTED,
        commissionStatus: DepartureIncomeCommissionStatus.UNPAID,
      }),
    ).toBe(DepartureIncomeSettlementComposite.PENDING_SETTLE)

    expect(
      deriveDepartureIncomeSettlementComposite({
        incomeStatus: DepartureIncomeCollectionStatus.COLLECTED,
        commissionStatus: DepartureIncomeCommissionStatus.UNPAID,
      }),
    ).toBe(DepartureIncomeSettlementComposite.PENDING_COMMISSION)

    expect(
      deriveDepartureIncomeSettlementComposite({
        incomeStatus: DepartureIncomeCollectionStatus.UNCOLLECTED,
        commissionStatus: DepartureIncomeCommissionStatus.PAID,
      }),
    ).toBe(DepartureIncomeSettlementComposite.PENDING_COLLECT)

    expect(
      deriveDepartureIncomeSettlementComposite({
        incomeStatus: DepartureIncomeCollectionStatus.COLLECTED,
        commissionStatus: DepartureIncomeCommissionStatus.PAID,
      }),
    ).toBe(DepartureIncomeSettlementComposite.SETTLED)
  })

  it('round-trips with statusesForDepartureIncomeSettlementComposite', () => {
    for (const composite of Object.values(DepartureIncomeSettlementComposite)) {
      const statuses = statusesForDepartureIncomeSettlementComposite(composite)
      expect(deriveDepartureIncomeSettlementComposite(statuses)).toBe(composite)
    }
  })
})

describe('companyIncomeCents', () => {
  it('subtracts commission from amount', () => {
    expect(companyIncomeCents({ amountCents: 12_000, commissionCents: 2_000 })).toBe(10_000)
  })
})
