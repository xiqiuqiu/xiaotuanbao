import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiReviewPackageView, DepartureCollaborationView } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import { SegmentResourceReviewPanel } from './SegmentResourceReviewPanel'

const getDepartureCollaboration = vi.fn()
const acceptReviewConfirmation = vi.fn()
const getReviewConfirmation = vi.fn()
const listSegments = vi.fn()
const listSuppliers = vi.fn()
const getSupplier = vi.fn()
const patchAiReviewPackage = vi.fn()
const rejectAiReviewPackage = vi.fn()
const confirmAiReviewPackage = vi.fn()
const generatePayable = vi.fn()

vi.mock('@/services/agent-collaboration.service', () => ({
  getDepartureCollaboration: (...args: unknown[]) => getDepartureCollaboration(...args),
  acceptReviewConfirmation: (...args: unknown[]) => acceptReviewConfirmation(...args),
  getReviewConfirmation: (...args: unknown[]) => getReviewConfirmation(...args),
}))

vi.mock('@/services/segment.service', () => ({
  listSegments: (...args: unknown[]) => listSegments(...args),
}))

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: (...args: unknown[]) => listSuppliers(...args),
  getSupplier: (...args: unknown[]) => getSupplier(...args),
}))

vi.mock('@/services/ai-create-task.service', () => ({
  patchAiReviewPackage: (...args: unknown[]) => patchAiReviewPackage(...args),
  rejectAiReviewPackage: (...args: unknown[]) => rejectAiReviewPackage(...args),
  confirmAiReviewPackage: (...args: unknown[]) => confirmAiReviewPackage(...args),
}))

vi.mock('@/services/segment-resource.service', () => ({
  generatePayable: (...args: unknown[]) => generatePayable(...args),
}))

const evidence = [{ kind: 'user_message' as const, sequence: 1, excerpt: '4月2日住宿 8800 元' }]

function packageView(overrides: Partial<AiReviewPackageView> = {}): AiReviewPackageView {
  return {
    id: 'pkg-1',
    status: 'pending',
    confirmationUnit: 'segment_resource',
    payloadSchema: 'departure.segment_resource@v1',
    schemaSupported: true,
    baseObjectVersion: 1,
    version: 1,
    runId: 'run-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    attemptId: 'attempt-1',
    capabilityKey: 'departure.segment-resource.propose',
    capabilityVersion: 1,
    targetKind: 'departure',
    targetId: 'dep-1',
    proposalHash: 'a'.repeat(64),
    baselineSnapshot: { mode: 'manual', routeName: '' },
    candidates: [
      {
        fieldKey: 'itinerarySegmentId',
        proposedValue: 'seg-1',
        clarity: 'clear',
        status: 'pending',
        evidence,
      },
      {
        fieldKey: 'resourceKind',
        proposedValue: 'hotel',
        clarity: 'clear',
        status: 'pending',
        evidence,
      },
      {
        fieldKey: 'supplierId',
        proposedValue: 'sup-1',
        clarity: 'clear',
        status: 'pending',
        evidence,
      },
      {
        fieldKey: 'title',
        proposedValue: '4月2日住宿',
        clarity: 'clear',
        status: 'pending',
        evidence,
      },
      {
        fieldKey: 'amountCents',
        proposedValue: 880000,
        clarity: 'clear',
        status: 'pending',
        evidence,
      },
      {
        fieldKey: 'capacityWarning',
        proposedValue: '材料座位数少于团期人数',
        clarity: 'clear',
        status: 'pending',
        evidence,
      },
    ],
    ...overrides,
  }
}

function collaboration(items: AiReviewPackageView[]): DepartureCollaborationView {
  return {
    departureId: 'dep-1',
    conversations: [{ id: 'conv-1', title: '协作', lastActivityAt: '2026-09-07T00:00:00.000Z' }],
    items,
    confirmations: [],
  }
}

function renderPanel() {
  return render(
    <ConfigProvider locale={zhCN}>
      <App>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <SegmentResourceReviewPanel departureId="dep-1" conversationId="conv-1" />
        </QueryClientProvider>
      </App>
    </ConfigProvider>,
  )
}

describe('SegmentResourceReviewPanel #449', () => {
  beforeEach(() => {
    useAuthStore.setState({ actionKeys: ['departure:write'] })
    getDepartureCollaboration.mockReset()
    acceptReviewConfirmation.mockReset()
    getReviewConfirmation.mockReset()
    listSegments.mockReset()
    listSuppliers.mockReset()
    getSupplier.mockReset()
    patchAiReviewPackage.mockReset()
    rejectAiReviewPackage.mockReset()
    confirmAiReviewPackage.mockReset()
    generatePayable.mockReset()
    listSegments.mockResolvedValue({
      items: [
        {
          id: 'seg-1',
          departureId: 'dep-1',
          name: 'D1 住宿',
          sortOrder: 1,
          startDate: '2026-04-02',
          endDate: '2026-04-02',
          dayCount: 1,
          destination: null,
          notes: null,
          fullTicketCount: 0,
          halfTicketCount: 0,
          studentTicketCount: 0,
          freeTicketCount: 0,
          hasTicketHeadcountMismatch: false,
          pendingCheck: false,
          resourceCount: 0,
          outsourceCount: 0,
          resourceAmountCents: 0,
          payableGeneratedCount: 0,
          payableStatus: 'not_generated',
        },
      ],
      summary: { segmentCount: 1, totalDays: 1, resourceCount: 0, payableOverview: '' },
      total: 1,
    })
    listSuppliers.mockResolvedValue({ items: [{ id: 'sup-1', name: '云上酒店' }], total: 1 })
    getSupplier.mockResolvedValue({ id: 'sup-1', name: '云上酒店' })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps confirm enabled when capacity warning is present and does not generate payable', async () => {
    const user = userEvent.setup()
    getDepartureCollaboration.mockResolvedValue(collaboration([packageView()]))
    acceptReviewConfirmation.mockResolvedValue({
      decisionCommandId: 'decision-1',
      accepted: true,
      items: [
        {
          packageId: 'pkg-1',
          status: 'succeeded',
          resultRef: { objectKind: 'segment_resource', objectId: 'res-1' },
        },
      ],
    })
    renderPanel()

    expect(await screen.findByRole('region', { name: '行程段资源审核' })).toBeInTheDocument()
    expect(screen.getByText('执行冲突提醒，不阻止费用录入')).toBeInTheDocument()
    const confirm = await screen.findByRole('button', { name: '确认写入资源' })
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(acceptReviewConfirmation).toHaveBeenCalledTimes(1)
    expect(confirmAiReviewPackage).not.toHaveBeenCalled()
    expect(generatePayable).not.toHaveBeenCalled()
  })

  it('blocks confirm when the material did not determine a segment', async () => {
    getDepartureCollaboration.mockResolvedValue(
      collaboration([
        packageView({
          candidates: packageView().candidates.filter((candidate) => candidate.fieldKey !== 'itinerarySegmentId'),
        }),
      ]),
    )
    renderPanel()

    expect(
      await screen.findByText('材料未确定对应行程段，请核实归属，不能凭当前页面日期默认挂靠'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认写入资源' })).toBeDisabled()
  })

  it('shows written resource result without payable follow-up', async () => {
    getDepartureCollaboration.mockResolvedValue({
      ...collaboration([packageView({ status: 'confirmed' })]),
      confirmations: [
        {
          decisionCommandId: 'decision-1',
          accepted: true,
          items: [
            {
              packageId: 'pkg-1',
              status: 'succeeded',
              resultRef: { objectKind: 'segment_resource', objectId: 'res-1' },
            },
          ],
        },
      ],
    })
    renderPanel()

    expect(await screen.findByText(/已写入行程段资源 res-1/)).toBeInTheDocument()
    expect(screen.getByText(/未提交应付/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认写入资源' })).not.toBeInTheDocument()
  })
})
