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
    supplierName: '杭州中亚旅汽',
    counterpartyName: '杭州中亚旅汽',
    title: '旅游车',
    amountCents: 80000,
    notes: null,
    hasPaymentSchedule: false,
    payableStatus: 'not_generated',
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    paymentScheduleId: null,
    financeTouched: false,
    unsettledAmountCents: null,
    createdAt: '2026-07-14T00:05:59.000Z',
    updatedAt: '2026-07-14T01:06:59.000Z',
    ...overrides,
  }
}

function columnTitles() {
  return buildExecutionResourceColumns({
    mutationLocked: false,
    canEdit: true,
    canMutateFinance: true,
    onEdit: vi.fn(),
    onViewPayables: vi.fn(),
    onGenerate: vi.fn(),
    onDelete: vi.fn(),
    onVoidPayable: vi.fn(),
    onClosePayable: vi.fn(),
  }).map((column) => column.title)
}

describe('execution resource timestamp columns', () => {
  afterEach(cleanup)

  it('在备注与操作之间展示创建时间和更新时间列', () => {
    const titles = columnTitles()
    const notesIndex = titles.indexOf('备注')
    const createdIndex = titles.indexOf('创建时间')
    const updatedIndex = titles.indexOf('更新时间')
    const actionsIndex = titles.indexOf('操作')

    expect(notesIndex).toBeGreaterThanOrEqual(0)
    expect(createdIndex).toBe(notesIndex + 1)
    expect(updatedIndex).toBe(createdIndex + 1)
    expect(actionsIndex).toBe(updatedIndex + 1)
  })

  it('按中国标准时间格式化创建与更新时间', () => {
    const columns = buildExecutionResourceColumns({
      mutationLocked: false,
      canEdit: true,
      canMutateFinance: true,
      onEdit: vi.fn(),
      onViewPayables: vi.fn(),
      onGenerate: vi.fn(),
      onDelete: vi.fn(),
      onVoidPayable: vi.fn(),
      onClosePayable: vi.fn(),
    })

    render(
      <ConfigProvider>
        <Table rowKey="id" columns={columns} dataSource={[resource()]} pagination={false} />
      </ConfigProvider>,
    )

    expect(screen.getByText('2026-07-14 08:05')).toBeInTheDocument()
    expect(screen.getByText('2026-07-14 09:06')).toBeInTheDocument()
  })
})
