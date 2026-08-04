import { PaymentScheduleDirection } from '@prisma/client'
import {
  PaymentScheduleSourceType,
  SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES,
} from '@xiaotuanbao/shared'
import { DepartureFinanceFacade } from './departure-finance-facade.service'

/**
 * Seam: DepartureFinanceFacade finance presence
 * (blocksRemoval / isGenerated — ADR-0004 presence query).
 */
describe('DepartureFinanceFacade finance presence', () => {
  function createFacade(findMany: jest.Mock) {
    const facade = Object.create(DepartureFinanceFacade.prototype) as DepartureFinanceFacade
    ;(facade as unknown as { prisma: { paymentSchedule: { findMany: jest.Mock } } }).prisma = {
      paymentSchedule: { findMany },
    }
    return facade
  }

  it('source order with no schedules is not generated and does not block removal', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const facade = createFacade(findMany)

    await expect(
      facade.getSourceOrderFinancePresence('org-1', 'so-1'),
    ).resolves.toEqual({ blocksRemoval: false, isGenerated: false })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          sourceId: { in: ['so-1'] },
          direction: PaymentScheduleDirection.receivable,
          sourceType: { in: [...SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES] },
        }),
      }),
    )
  })

  it('source order with a receivable path schedule blocks removal and is generated', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        sourceId: 'so-1',
        sourceType: SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES[0],
        voidedAt: null,
      },
    ])
    const facade = createFacade(findMany)

    await expect(
      facade.getSourceOrderFinancePresence('org-1', 'so-1'),
    ).resolves.toEqual({ blocksRemoval: true, isGenerated: true })
  })

  it('voided payable blocks removal but is not generated', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        sourceId: 'res-1',
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        voidedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])
    const facade = createFacade(findMany)

    await expect(
      facade.getResourceFinancePresence('org-1', {
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        sourceId: 'res-1',
      }),
    ).resolves.toEqual({ blocksRemoval: true, isGenerated: false })
  })

  it('batch source-order presence returns a map keyed by sourceOrderId', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        sourceId: 'so-2',
        sourceType: SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES[0],
        voidedAt: null,
      },
    ])
    const facade = createFacade(findMany)

    const map = await facade.getSourceOrderFinancePresences('org-1', [
      'so-1',
      'so-2',
    ])
    expect(map.get('so-1')).toEqual({ blocksRemoval: false, isGenerated: false })
    expect(map.get('so-2')).toEqual({ blocksRemoval: true, isGenerated: true })
  })
})
