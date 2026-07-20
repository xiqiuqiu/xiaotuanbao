import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SegmentResourceSummary } from '@/types/api'
import { buildExecutionResourceColumns } from './execution-resource-columns'

function resource(overrides: Partial<SegmentResourceSummary> = {}): SegmentResourceSummary {
  return {
    id: 'resource-1',
    segmentId: 'segment-1',
    departureId: 'departure-1',
    resourceKind: 'transport',
    counterpartyType: 'supplier',
    partnerId: null,
    partnerName: null,
    supplierId: 'supplier-1',
    supplierName: '测试车队',
    counterpartyName: '测试车队',
    title: '测试用车',
    amountCents: 100000,
    notes: null,
    hasPaymentSchedule: true,
    payableStatus: 'pending',
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    paymentScheduleId: 'schedule-1',
    financeTouched: false,
    unsettledAmountCents: 100000,
    createdAt: '2026-07-14T00:05:59.000Z',
    updatedAt: '2026-07-14T01:06:59.000Z',
    ...overrides,
  }
}

function renderActions(row: SegmentResourceSummary, canEdit = true, canMutateFinance = true) {
  const columns = buildExecutionResourceColumns({
    mutationLocked: false,
    canEdit,
    canMutateFinance,
    onEdit: vi.fn(),
    onViewPayables: vi.fn(),
    onGenerate: vi.fn(),
    onDelete: vi.fn(),
    onVoidPayable: vi.fn(),
    onClosePayable: vi.fn(),
  })
  render(
    <ConfigProvider>
      <Table rowKey="id" columns={columns} dataSource={[row]} pagination={false} />
    </ConfigProvider>,
  )
}

describe('resource payable actions', () => {
  afterEach(cleanup)

  it('shows only 作废应付 before finance is touched', () => {
    renderActions(resource())

    expect(screen.getByRole('button', { name: '作废应付' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '关闭节点' })).toBeNull()
  })

  it('shows only 关闭节点 after finance is touched and remains unsettled', () => {
    renderActions(resource({ financeTouched: true, amountFieldsLocked: true }))

    expect(screen.getByRole('button', { name: '关闭节点' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '作废应付' })).toBeNull()
  })

  it('hides 关闭节点 for 计调 (no /finance/*, cannot mutate finance)', () => {
    // 计调持有 departure:write（canEdit=true）但无 /finance/*：关闭节点属财务动作，
    // 若显示则点击后 POST …/cancel 会 403。此为回归守卫。
    renderActions(resource({ financeTouched: true, amountFieldsLocked: true }), true, false)

    expect(screen.queryByRole('button', { name: '关闭节点' })).toBeNull()
  })

  it('hides 作废应付 for 财务 (no departure:write) before finance is touched', () => {
    renderActions(resource(), false)

    expect(screen.queryByRole('button', { name: '作废应付' })).toBeNull()
    // 只读态下编辑按钮降级为查看。
    expect(screen.getByRole('button', { name: '查看' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
  })

  it('keeps 生成应付 visible for 财务 when the payable is ungenerated', () => {
    renderActions(
      resource({ payableStatus: 'not_generated', paymentScheduleId: null }),
      false,
    )

    expect(screen.getByRole('button', { name: '生成应付' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('shows neither action after the payable is settled', () => {
    renderActions(
      resource({
        financeTouched: true,
        amountFieldsLocked: true,
        payableStatus: 'paid',
        unsettledAmountCents: 0,
      }),
    )

    expect(screen.queryByRole('button', { name: '关闭节点' })).toBeNull()
    expect(screen.queryByRole('button', { name: '作废应付' })).toBeNull()
  })
})
