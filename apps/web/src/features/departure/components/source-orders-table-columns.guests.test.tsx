import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseMutationResult } from '@tanstack/react-query'
import type { SourceOrderSummary } from '@/types/api'
import { buildSourceOrdersColumns } from './source-orders-table-columns'

function baseOrder(overrides: Partial<SourceOrderSummary> = {}): SourceOrderSummary {
  return {
    id: 'order-1',
    departureId: 'departure-1',
    partnerId: 'partner-1',
    partnerName: '杭州同行',
    displayName: '杭州同行',
    guestCount: 3,
    adultGuestCount: 3,
    childGuestCount: 0,
    adultUnitPriceCents: 100000,
    childUnitPriceCents: 0,
    grossReceivableCents: 300000,
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 300000,
    collectionMode: 'guest_only',
    depositCents: 0,
    balanceCents: 300000,
    partnerCollectedCents: 0,
    guestCollectCents: 300000,
    settlementNotes: null,
    notes: null,
    guests: [],
    receivableStatus: 'not_generated',
    hasPaymentSchedule: false,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    hasIncompleteReceivablePaths: false,
    estimatedRebateCents: 0,
    rebateCents: 0,
    rebateStatus: 'not_generated',
    rebateScheduleNo: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function stubMutation(): UseMutationResult<unknown, Error, string, unknown> {
  return {
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  } as unknown as UseMutationResult<unknown, Error, string, unknown>
}

function renderTable(order: SourceOrderSummary) {
  const columns = buildSourceOrdersColumns({
    canEdit: true,
    canGenerate: true,
    deleteMutation: stubMutation(),
    generateMutation: stubMutation(),
    onOpen: vi.fn(),
    onViewReceivables: vi.fn(),
    onViewRebate: vi.fn(),
  })

  render(
    <ConfigProvider>
      <Table rowKey="id" columns={columns} dataSource={[order]} pagination={false} />
    </ConfigProvider>,
  )
}

describe('source orders guests column', () => {
  afterEach(() => {
    cleanup()
  })

  it('orders identity columns as 客户 → 总人数 → 客人名单 → 收款方式 before money columns', () => {
    const columns = buildSourceOrdersColumns({
      canEdit: true,
      canGenerate: true,
      deleteMutation: stubMutation(),
      generateMutation: stubMutation(),
      onOpen: vi.fn(),
      onViewReceivables: vi.fn(),
      onViewRebate: vi.fn(),
    })

    expect(columns.slice(0, 8).map((column) => String(column.title))).toEqual([
      '客户',
      '总人数',
      '客人名单',
      '收款方式',
      '原始应收',
      '调整净额',
      '优惠金额',
      '结算金额',
    ])
  })

  it('shows 未录入 and 应录 N 人 when guests are empty', () => {
    renderTable(baseOrder({ guestCount: 3, guests: [] }))

    expect(screen.getByText('未录入')).toBeTruthy()
    expect(screen.getByText('应录 3 人')).toBeTruthy()
  })

  it('joins guest names with顿号, ellipsizes with full title, and marks 未齐', () => {
    renderTable(
      baseOrder({
        guestCount: 3,
        guests: [
          { id: 'g1', name: '张三' },
          { id: 'g2', name: '李四' },
        ],
      }),
    )

    const names = screen.getByTitle('张三、李四')
    expect(names.textContent).toBe('张三、李四')
    expect(screen.getByText('2/3 人 · 未齐')).toBeTruthy()
  })

  it('shows recorded count without 未齐 when roster is complete', () => {
    renderTable(
      baseOrder({
        guestCount: 2,
        guests: [
          { id: 'g1', name: '王五' },
          { id: 'g2', name: '赵六' },
        ],
      }),
    )

    expect(screen.getByText('2/2 人')).toBeTruthy()
    expect(screen.queryByText(/未齐/)).toBeNull()
  })
})
