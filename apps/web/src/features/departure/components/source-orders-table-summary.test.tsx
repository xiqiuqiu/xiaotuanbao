import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { afterEach, describe, expect, it } from 'vitest'
import type { SourceOrderSummary } from '@/types/api'
import { formatCents } from '../catalog'
import { buildSourceOrdersColumns } from './source-orders-table-columns'
import {
  aggregateSourceOrdersTableTotals,
  renderSourceOrdersTableSummary,
} from './source-orders-table-summary'

function baseOrder(overrides: Partial<SourceOrderSummary> = {}): SourceOrderSummary {
  return {
    id: 'order-1',
    departureId: 'departure-1',
    partnerId: 'partner-1',
    partnerName: '苏州水乡地接社',
    displayName: '苏州水乡地接社',
    guestCount: 25,
    adultGuestCount: 25,
    childGuestCount: 0,
    adultUnitPriceCents: 98000,
    childUnitPriceCents: 0,
    grossReceivableCents: 2450000,
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 2450000,
    collectionMode: 'guest_only',
    depositCents: 0,
    balanceCents: 2450000,
    partnerCollectedCents: 0,
    guestCollectCents: 2450000,
    settlementNotes: null,
    notes: null,
    receivableStatus: 'pending',
    hasPaymentSchedule: true,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    estimatedRebateCents: 0,
    rebateCents: 0,
    rebateStatus: 'not_generated',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('aggregateSourceOrdersTableTotals', () => {
  it('sums guest and money columns across the current page', () => {
    const totals = aggregateSourceOrdersTableTotals([
      baseOrder(),
      baseOrder({
        id: 'order-2',
        guestCount: 20,
        grossReceivableCents: 1960000,
        discountCents: 10000,
        netReceivableCents: 1950000,
        partnerCollectedCents: 50000,
        guestCollectCents: 1900000,
      }),
      baseOrder({
        id: 'order-3',
        guestCount: 10,
        grossReceivableCents: 980000,
        discountCents: 0,
        netReceivableCents: 980000,
        partnerCollectedCents: 0,
        guestCollectCents: 980000,
      }),
    ])

    expect(totals).toEqual({
      guestCount: 55,
      grossReceivableCents: 5390000,
      fareAdjustmentNetCents: 0,
      discountCents: 10000,
      netReceivableCents: 5380000,
      partnerCollectedCents: 50000,
      guestCollectCents: 5330000,
      rebateDisplayCents: 0,
    })
  })

  it('returns zeros for an empty page', () => {
    expect(aggregateSourceOrdersTableTotals([])).toEqual({
      guestCount: 0,
      grossReceivableCents: 0,
      fareAdjustmentNetCents: 0,
      discountCents: 0,
      netReceivableCents: 0,
      partnerCollectedCents: 0,
      guestCollectCents: 0,
      rebateDisplayCents: 0,
    })
  })
})

describe('renderSourceOrdersTableSummary', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a 合计 footer aligned with numeric columns', () => {
    const items = [
      baseOrder(),
      baseOrder({
        id: 'order-2',
        partnerName: '杭州西湖旅行社',
        guestCount: 20,
        grossReceivableCents: 1960000,
        netReceivableCents: 1960000,
        guestCollectCents: 1960000,
      }),
    ]
    const totals = aggregateSourceOrdersTableTotals(items)
    const columns = buildSourceOrdersColumns({
      canEdit: true,
      canGenerate: true,
      deleteMutation: {
        isPending: false,
        variables: undefined,
        mutate: () => undefined,
      } as never,
      generateMutation: {
        isPending: false,
        variables: undefined,
        mutate: () => undefined,
      } as never,
      onOpen: () => undefined,
      onOpenGuests: () => undefined,
      onViewReceivables: () => undefined,
      onViewRebate: () => undefined,
    })

    render(
      <ConfigProvider>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          pagination={false}
          summary={renderSourceOrdersTableSummary}
        />
      </ConfigProvider>,
    )

    const summaryRow = screen.getByText('合计').closest('tr')
    expect(summaryRow).toBeTruthy()
    expect(summaryRow?.textContent).toContain(String(totals.guestCount))
    expect(summaryRow?.textContent).toContain(formatCents(totals.grossReceivableCents))
    expect(summaryRow?.textContent).toContain(formatCents(totals.fareAdjustmentNetCents))
    expect(summaryRow?.textContent).toContain(formatCents(totals.discountCents))
    expect(summaryRow?.textContent).toContain(formatCents(totals.netReceivableCents))
    expect(summaryRow?.textContent).toContain(formatCents(totals.partnerCollectedCents))
    expect(summaryRow?.textContent).toContain(formatCents(totals.guestCollectCents))
  })

  it('omits the footer when the page has no rows', () => {
    render(
      <ConfigProvider>
        <Table
          rowKey="id"
          columns={[{ title: '客户', dataIndex: 'partnerName' }]}
          dataSource={[]}
          pagination={false}
          summary={renderSourceOrdersTableSummary}
        />
      </ConfigProvider>,
    )

    expect(screen.queryByText('合计')).toBeNull()
  })
})
