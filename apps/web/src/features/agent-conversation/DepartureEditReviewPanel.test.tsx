import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AiReviewPackageView } from '@/types/api'
import {
  DepartureEditReviewPanel,
  formatDepartureEditReviewValue,
} from './DepartureEditReviewPanel'

const service = vi.hoisted(() => ({
  patchAiReviewPackage: vi.fn(),
  acceptReviewConfirmation: vi.fn(),
  getReviewConfirmation: vi.fn(),
  rejectAiReviewPackage: vi.fn(),
  cancelAiReviewPackage: vi.fn(),
}))
vi.mock('@/services/ai-create-task.service', () => service)
const candidate = (fieldKey: string, proposedValue: unknown) => ({
  fieldKey,
  proposedValue,
  clarity: 'clear' as const,
  status: 'pending' as const,
  evidence: [],
})
function pkg(guests = false): AiReviewPackageView {
  return {
    id: 'pkg-edit',
    status: 'pending',
    confirmationUnit: guests ? 'source_order_guests_update' : 'itinerary_segment_update',
    payloadSchema: guests
      ? 'source_order.guests_update@v1'
      : 'departure.itinerary_segment_update@v1',
    schemaSupported: true,
    baseObjectVersion: 1,
    version: 1,
    runId: null,
    conversationId: 'conv',
    inputBatchId: null,
    attemptId: null,
    capabilityKey: 'edit',
    capabilityVersion: 1,
    targetKind: 'departure',
    targetId: 'dep',
    proposalHash: 'a'.repeat(64),
    baselineSnapshot: Object.assign(
      { mode: 'manual' as const, routeName: '' },
      guests
        ? {
            sourceOrderId: 'order',
            displayName: '回归客户',
            guests: [{ id: 'guest-1', name: '原游客', phone: '123' }],
          }
        : {
            itinerarySegmentId: 'segment',
            name: '原行程',
            startDate: '2026-12-15',
            endDate: '2026-12-15',
          },
    ),
    candidates: guests
      ? [
          candidate('sourceOrderId', 'order'),
          candidate('guestChanges', {
            add: [{ name: '追加游客' }],
            update: [{ guestId: 'guest-1', phone: '456' }],
          }),
        ]
      : [candidate('itinerarySegmentId', 'segment'), candidate('name', '建议行程')],
  }
}
function view(review = pkg(), canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['segments', 'dep'], ['warm'])
  client.setQueryData(['source-orders', 'dep'], ['warm'])
  const panel = (current: AiReviewPackageView) => (
    <App>
      <QueryClientProvider client={client}>
        <DepartureEditReviewPanel pkg={current} departureId="dep" canEdit={canEdit} />
      </QueryClientProvider>
    </App>
  )
  const rendered = render(panel(review))
  return { client, rerender: (updated: AiReviewPackageView) => rendered.rerender(panel(updated)) }
}
beforeEach(() => {
  vi.resetAllMocks()
  service.patchAiReviewPackage.mockResolvedValue({ pendingReview: { ...pkg(), version: 2 } })
  service.acceptReviewConfirmation.mockResolvedValue({
    decisionCommandId: 'decision',
    accepted: true,
    items: [{ packageId: 'pkg-edit', status: 'succeeded' }],
  })
})
afterEach(cleanup)
it('展示原值，修正后使用新版本确认，并刷新已有业务缓存', async () => {
  const { client } = view()
  expect(screen.getByText('原行程')).toBeInTheDocument()
  const user = userEvent.setup()
  await user.clear(screen.getByRole('textbox', { name: '名称建议' }))
  await user.type(screen.getByRole('textbox', { name: '名称建议' }), '人工修正')
  await user.click(screen.getByRole('button', { name: '确认修改行程段' }))
  await waitFor(() =>
    expect(service.acceptReviewConfirmation).toHaveBeenCalledWith({
      decisionCommandId: expect.any(String),
      items: [{ packageId: 'pkg-edit', expectedPackageVersion: 2 }],
    }),
  )
  expect(service.patchAiReviewPackage).toHaveBeenCalledWith('', 'pkg-edit', {
    expectedPackageVersion: 1,
    corrections: { name: '人工修正' },
  })
  await screen.findByText('修改已写入')
  expect(client.getQueryState(['segments', 'dep'])?.isInvalidated).toBe(true)
})
it('追加和修改游客保留已有游客 ID，临时空姓名仍可继续修正', async () => {
  view(pkg(true))
  const user = userEvent.setup()
  const input = screen.getByRole('textbox', { name: '追加游客1姓名' })
  await user.clear(input)
  expect(screen.getByRole('button', { name: '确认修改游客名单' })).toBeDisabled()
  await user.type(input, '新游客')
  await user.clear(screen.getByRole('textbox', { name: '修改游客1电话' }))
  await user.type(screen.getByRole('textbox', { name: '修改游客1电话' }), '789')
  await user.click(screen.getByRole('button', { name: '确认修改游客名单' }))
  await waitFor(() =>
    expect(service.patchAiReviewPackage).toHaveBeenCalledWith('', 'pkg-edit', {
      expectedPackageVersion: 1,
      corrections: {
        guestChanges: { add: [{ name: '新游客' }], update: [{ guestId: 'guest-1', phone: '789' }] },
      },
    }),
  )
})
it.each([
  ['拒绝建议', 'rejectAiReviewPackage'],
  ['取消此项', 'cancelAiReviewPackage'],
] as const)('%s 不提交修改', async (label, method) => {
  view()
  await userEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() =>
    expect(service[method]).toHaveBeenCalledWith('', 'pkg-edit', { expectedPackageVersion: 1 }),
  )
  expect(service.acceptReviewConfirmation).not.toHaveBeenCalled()
})
it('只读权限和业务阻塞原因禁止确认', () => {
  view({ ...pkg(), confirmationBlockedReason: '发团已关闭' }, false)
  expect(screen.getByRole('button', { name: '确认修改行程段' })).toBeDisabled()
  expect(screen.getByRole('textbox', { name: '名称建议' })).toBeDisabled()
  expect(screen.getByText('发团已关闭')).toBeInTheDocument()
})
it('修正保存失败时不发送确认', async () => {
  service.patchAiReviewPackage.mockRejectedValue(new Error('版本已变化'))
  view()
  await userEvent.type(screen.getByRole('textbox', { name: '名称建议' }), '修正')
  await userEvent.click(screen.getByRole('button', { name: '确认修改行程段' }))
  await screen.findByText('版本已变化')
  expect(service.acceptReviewConfirmation).not.toHaveBeenCalled()
})

it('日期修正与既有日期冲突时禁止确认', () => {
  const review = pkg()
  review.candidates.push(candidate('endDate', '2026-12-14'))
  view(review)
  expect(screen.getByRole('button', { name: '确认修改行程段' })).toBeDisabled()
  expect(screen.getByText('请修正：结束日期不能早于开始日期')).toBeInTheDocument()
})
it('确认回执把游客增量和正式名单显示为可读信息', () => {
  const baseline = {
    displayName: '回归客户',
    guests: [{ id: 'guest-1', name: '原游客', phone: '123' }],
  }
  expect(
    formatDepartureEditReviewValue(
      'guestChanges',
      { update: [{ guestId: 'guest-1', phone: '456' }], add: [{ name: '新游客' }] },
      baseline,
    ),
  ).toContain('修改：姓名：原游客，电话：456')
  expect(formatDepartureEditReviewValue('guests', baseline.guests, baseline)).toContain(
    '姓名：原游客',
  )
  expect(formatDepartureEditReviewValue('sourceOrderId', 'order-id', baseline)).toBe('回归客户')
})

it('行程前值隐藏修订冲突与未登记技术字段', () => {
  const review = pkg()
  review.baselineSnapshot = {
    ...review.baselineSnapshot,
    reviewConflicts: { name: 'technical-conflict' },
    internalToken: 'technical-token',
  }
  view(review)
  expect(screen.getByText('原行程')).toBeInTheDocument()
  expect(screen.queryByText('reviewConflicts')).not.toBeInTheDocument()
  expect(screen.queryByText('internalToken')).not.toBeInTheDocument()
  expect(screen.queryByText('technical-token')).not.toBeInTheDocument()
})
it('审核包版本更新且未编辑时游客表单采用新建议', () => {
  const review = pkg(true)
  const { rerender } = view(review)
  expect(screen.getByRole('textbox', { name: '追加游客1姓名' })).toHaveValue('追加游客')
  rerender({
    ...review,
    version: 2,
    candidates: [
      candidate('sourceOrderId', 'order'),
      candidate('guestChanges', { add: [{ name: '新版游客' }] }),
    ],
  })
  expect(screen.getByRole('textbox', { name: '追加游客1姓名' })).toHaveValue('新版游客')
  expect(screen.queryByRole('textbox', { name: '修改游客1电话' })).not.toBeInTheDocument()
})
it('编辑中收到新版本保留未保存名单，明确采用新版后才重置', async () => {
  const review = pkg(true)
  const { rerender } = view(review)
  const user = userEvent.setup()
  await user.clear(screen.getByRole('textbox', { name: '追加游客1姓名' }))
  await user.type(screen.getByRole('textbox', { name: '追加游客1姓名' }), '未保存游客')
  rerender({
    ...review,
    version: 2,
    candidates: [
      candidate('sourceOrderId', 'order'),
      candidate('guestChanges', { add: [{ name: '新版游客' }] }),
    ],
  })
  expect(screen.getByRole('textbox', { name: '追加游客1姓名' })).toHaveValue('未保存游客')
  expect(screen.getByText('建议已有新版本，当前未保存修正已保留')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认修改游客名单' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '保存修正' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '采用最新建议' }))
  expect(screen.getByRole('textbox', { name: '追加游客1姓名' })).toHaveValue('新版游客')
  expect(screen.getByRole('button', { name: '确认修改游客名单' })).toBeEnabled()
  expect(service.patchAiReviewPackage).not.toHaveBeenCalled()
})
