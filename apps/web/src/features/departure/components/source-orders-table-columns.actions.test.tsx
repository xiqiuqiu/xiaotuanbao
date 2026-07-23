import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    guestCount: 10,
    adultGuestCount: 10,
    childGuestCount: 0,
    adultUnitPriceCents: 100000,
    childUnitPriceCents: 0,
    grossReceivableCents: 1000000,
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 1000000,
    collectionMode: 'guest_only',
    partnerCollectedCents: 0,
    guestCollectCents: 1000000,
    settlementNotes: null,
    notes: null,
    receivableStatus: 'not_generated',
    hasPaymentSchedule: false,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
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

function renderActions(
  order: SourceOrderSummary,
  options: {
    canEdit?: boolean
    canGenerate?: boolean
    onViewReceivables?: (record: SourceOrderSummary) => void
  } = {},
) {
  const onViewReceivables = options.onViewReceivables ?? vi.fn()
  const columns = buildSourceOrdersColumns({
    canEdit: options.canEdit ?? true,
    canGenerate: options.canGenerate ?? true,
    deleteMutation: stubMutation(),
    generateMutation: stubMutation(),
    onOpen: vi.fn(),
    onOpenGuests: vi.fn(),
    onViewReceivables,
  })

  render(
    <ConfigProvider>
      <Table rowKey="id" columns={columns} dataSource={[order]} pagination={false} />
    </ConfigProvider>,
  )

  return { onViewReceivables }
}

describe('source orders action column', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows 生成应收 when receivable has not been created', () => {
    renderActions(baseOrder())

    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '查看' })).toBeNull()
    expect(screen.getByRole('button', { name: '生成应收' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '查看应收' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull()
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy()
  })

  it('shows 查看应收 instead of 生成应收 after receivable is created', () => {
    renderActions(
      baseOrder({
        receivableStatus: 'pending',
        hasPaymentSchedule: true,
      }),
    )

    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '查看' })).toBeNull()
    expect(screen.getByRole('button', { name: '查看应收' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '生成应收' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('shows 查看应收 for closed receivable status and keeps 编辑 when writable', () => {
    renderActions(
      baseOrder({
        receivableStatus: 'closed',
        hasPaymentSchedule: true,
        amountFieldsLocked: true,
      }),
    )

    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '查看' })).toBeNull()
    expect(screen.getByRole('button', { name: '查看应收' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '生成应收' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('keeps 生成应收 visible but opens 查看 (not 编辑) for 财务 (no departure:write)', () => {
    renderActions(baseOrder(), { canEdit: false, canGenerate: true })

    expect(screen.getByRole('button', { name: '查看' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
    expect(screen.getByRole('button', { name: '生成应收' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '客人名单' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('hides 生成应收 when the departure is closed (no /departure generate path)', () => {
    renderActions(baseOrder(), { canEdit: false, canGenerate: false })

    expect(screen.queryByRole('button', { name: '生成应收' })).toBeNull()
    expect(screen.getByRole('button', { name: '查看' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
  })

  it('opens the shared drawer in edit mode when 编辑 is clicked', async () => {
    const user = userEvent.setup()
    const order = baseOrder()
    const onOpen = vi.fn()
    const columns = buildSourceOrdersColumns({
      canEdit: true,
      canGenerate: true,
      deleteMutation: stubMutation(),
      generateMutation: stubMutation(),
      onOpen,
      onOpenGuests: vi.fn(),
      onViewReceivables: vi.fn(),
    })

    render(
      <ConfigProvider>
        <Table rowKey="id" columns={columns} dataSource={[order]} pagination={false} />
      </ConfigProvider>,
    )

    await user.click(screen.getByRole('button', { name: '编辑' }))
    expect(onOpen).toHaveBeenCalledWith(order, false)
  })

  it('calls onViewReceivables when 查看应收 is clicked', async () => {
    const user = userEvent.setup()
    const order = baseOrder({
      receivableStatus: 'partial',
      hasPaymentSchedule: true,
    })
    const { onViewReceivables } = renderActions(order)

    await user.click(screen.getByRole('button', { name: '查看应收' }))

    expect(onViewReceivables).toHaveBeenCalledWith(order)
  })
})
