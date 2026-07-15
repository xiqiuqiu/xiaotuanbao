import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Modal, message } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  BatchFinanceGenerationResult,
  DepartureDetail,
  ItinerarySegmentSummary,
  SegmentResourceSummary,
} from '@/types/api'
import { ExecutionResourcePane } from './ExecutionResourcePane'

const listSegmentResources = vi.fn()
const deleteSegmentResource = vi.fn()
const generatePayable = vi.fn()
const generatePayablesForSegment = vi.fn()
const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/services/segment-resource.service', () => ({
  listSegmentResources: (...args: unknown[]) => listSegmentResources(...args),
  createSegmentResource: vi.fn(),
  updateSegmentResource: vi.fn(),
  deleteSegmentResource: (...args: unknown[]) => deleteSegmentResource(...args),
  generatePayable: (...args: unknown[]) => generatePayable(...args),
  generatePayablesForSegment: (...args: unknown[]) => generatePayablesForSegment(...args),
}))

vi.mock('./ResourceDrawer', () => ({
  ResourceDrawer: ({ open, editing }: { open: boolean; editing: SegmentResourceSummary | null }) =>
    open ? <div>{editing ? '编辑资源' : '添加资源'}</div> : null,
}))

const segment: ItinerarySegmentSummary = {
  id: 'segment-1',
  departureId: 'departure-1',
  name: '西栅夜游',
  sortOrder: 0,
  startDate: '2026-07-14',
  endDate: '2026-07-14',
  dayCount: 1,
  destination: '乌镇西栅',
  notes: null,
  resourceCount: 1,
  outsourceCount: 0,
  resourceAmountCents: 300000,
  payableGeneratedCount: 0,
  payableStatus: 'not_generated',
}

const departure = {
  id: 'departure-1',
  departureNo: 'XTB2026070003',
  name: '乌镇西栅2日线 7月14日团',
  status: 'editing',
} as DepartureDetail

function baseResource(
  overrides: Partial<SegmentResourceSummary> = {},
): SegmentResourceSummary {
  return {
    id: 'resource-1',
    segmentId: 'segment-1',
    departureId: 'departure-1',
    resourceKind: 'ticket',
    counterpartyType: 'supplier',
    partnerId: null,
    partnerName: null,
    supplierId: 'supplier-1',
    supplierName: '乌镇西栅景区',
    counterpartyName: '乌镇西栅景区',
    title: '西栅团队票',
    amountCents: 300000,
    notes: null,
    hasPaymentSchedule: false,
    payableStatus: 'not_generated',
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    ...overrides,
  }
}

function renderPane(segmentOverrides: Partial<ItinerarySegmentSummary> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <ExecutionResourcePane
          departure={departure}
          segment={{ ...segment, ...segmentOverrides }}
          readOnly={false}
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ExecutionResourcePane action buttons', () => {
  afterEach(() => {
    cleanup()
    listSegmentResources.mockReset()
    deleteSegmentResource.mockReset()
    generatePayable.mockReset()
    generatePayablesForSegment.mockReset()
    navigate.mockReset()
  })

  it('shows 生成应付 when payable has not been created', async () => {
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    renderPane()

    expect(await screen.findByRole('button', { name: '生成应付' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '查看应付' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull()
  })

  it('opens edit drawer from the extracted action column', async () => {
    const user = userEvent.setup()
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    renderPane()

    await user.click(await screen.findByRole('button', { name: '编辑' }))

    expect(await screen.findByText('编辑资源')).toBeTruthy()
  })

  it('generates a payable from the extracted action column', async () => {
    const user = userEvent.setup()
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    generatePayable.mockResolvedValue({ sourceAmountMismatch: false })
    renderPane()

    await user.click(await screen.findByRole('button', { name: '生成应付' }))

    await waitFor(() => {
      expect(generatePayable).toHaveBeenCalledWith('resource-1')
    })
  })

  it('deletes an ungenerated resource from the extracted action column', async () => {
    const user = userEvent.setup()
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    deleteSegmentResource.mockResolvedValue(undefined)
    renderPane()

    await user.click(await screen.findByRole('button', { name: '删除' }))
    expect(await screen.findByText('确定删除该资源？')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /^(OK|确\s*定)$/ }))

    await waitFor(() => {
      expect(deleteSegmentResource).toHaveBeenCalledWith('resource-1')
    })
  })

  it('shows 查看应付 instead of 生成应付 / 重新生成 after payable is created', async () => {
    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({
          payableStatus: 'pending',
          hasPaymentSchedule: true,
          amountFieldsLocked: false,
        }),
      ],
    })
    renderPane()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看应付' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '生成应付' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('shows 查看应付 for closed payable status and keeps 查看', async () => {
    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({
          payableStatus: 'closed',
          hasPaymentSchedule: true,
          amountFieldsLocked: true,
        }),
      ],
    })
    renderPane()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看应付' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: '查看' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '生成应付' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('navigates to payables tab with locate intent when 查看应付 is clicked', async () => {
    const user = userEvent.setup()
    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({
          payableStatus: 'partial',
          hasPaymentSchedule: true,
        }),
      ],
    })
    renderPane()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看应付' })).toBeTruthy()
    })
    await user.click(screen.getByRole('button', { name: '查看应付' }))

    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/$departureId',
      params: { departureId: 'departure-1' },
      search: {
        tab: 'payables',
        highlightSegmentResourceId: 'resource-1',
        segmentId: 'segment-1',
        counterpartyKeyword: '乌镇西栅景区',
      },
    })
  })

  it('shows 批量生成应付 only when the segment still has ungenerated resources', async () => {
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    const { unmount } = renderPane({
      resourceCount: 2,
      payableGeneratedCount: 1,
      payableStatus: 'pending',
    })

    expect(await screen.findByRole('button', { name: '批量生成应付' })).toBeTruthy()
    unmount()

    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({
          payableStatus: 'pending',
          hasPaymentSchedule: true,
        }),
      ],
    })
    renderPane({
      resourceCount: 1,
      payableGeneratedCount: 1,
      payableStatus: 'pending',
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看应付' })).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: '批量生成应付' })).toBeNull()
  })

  it('confirms batch generate then calls segment API and shows success toast', async () => {
    const user = userEvent.setup()
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    const batchResult: BatchFinanceGenerationResult = {
      attempted: 1,
      succeeded: 1,
      generated: 1,
      skipped: 0,
      failed: 0,
      items: [
        {
          sourceId: 'resource-1',
          sourceLabel: '西栅团队票',
          outcome: 'succeeded',
        },
      ],
    }
    generatePayablesForSegment.mockResolvedValue(batchResult)

    type ConfirmConfig = Parameters<typeof Modal.confirm>[0]
    let confirmConfig: ConfirmConfig | undefined
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      confirmConfig = config
      return {
        destroy: vi.fn(),
        update: vi.fn(),
        then: undefined,
      } as ReturnType<typeof Modal.confirm>
    })
    const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)

    try {
      renderPane({
        resourceCount: 1,
        payableGeneratedCount: 0,
        payableStatus: 'not_generated',
      })

      await user.click(await screen.findByRole('button', { name: '批量生成应付' }))

      expect(confirmConfig).toMatchObject({
        title: '批量生成应付',
        content: '确认后将生成 1 条应付记录',
        okText: '生成',
      })

      await confirmConfig?.onOk?.()

      expect(generatePayablesForSegment).toHaveBeenCalledWith('segment-1')
      await waitFor(() => {
        expect(successSpy).toHaveBeenCalledWith('应付批量生成完成：成功 1')
      })
    } finally {
      confirmSpy.mockRestore()
      successSpy.mockRestore()
    }
  })

  it('shows warning toast when batch generate has failures', async () => {
    const user = userEvent.setup()
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    generatePayablesForSegment.mockResolvedValue({
      attempted: 2,
      succeeded: 1,
      generated: 1,
      skipped: 0,
      failed: 1,
      items: [
        {
          sourceId: 'resource-1',
          sourceLabel: '西栅团队票',
          outcome: 'succeeded',
        },
        {
          sourceId: 'resource-2',
          sourceLabel: '酒店',
          outcome: 'failed',
          reason: '网络错误',
        },
      ],
    } satisfies BatchFinanceGenerationResult)

    type ConfirmConfig = Parameters<typeof Modal.confirm>[0]
    let confirmConfig: ConfirmConfig | undefined
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      confirmConfig = config
      return {
        destroy: vi.fn(),
        update: vi.fn(),
        then: undefined,
      } as ReturnType<typeof Modal.confirm>
    })
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never)

    try {
      renderPane({
        resourceCount: 2,
        payableGeneratedCount: 0,
        payableStatus: 'not_generated',
      })

      await user.click(await screen.findByRole('button', { name: '批量生成应付' }))
      await confirmConfig?.onOk?.()

      await waitFor(() => {
        expect(warningSpy).toHaveBeenCalledWith(
          '应付批量生成完成：成功 1 · 失败 1。酒店：网络错误',
        )
      })
    } finally {
      confirmSpy.mockRestore()
      warningSpy.mockRestore()
    }
  })
})
