import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiReviewPackageView, DepartureCollaborationView } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import { DepartureResourceReviewPanel } from './DepartureResourceReviewPanel'

const getDepartureCollaboration = vi.fn()
const acceptReviewConfirmation = vi.fn()
const getReviewConfirmation = vi.fn()
const listSuppliers = vi.fn()
const getSupplier = vi.fn()
const patchAiReviewPackage = vi.fn()
const rejectAiReviewPackage = vi.fn()
const confirmAiReviewPackage = vi.fn()
const generateDeparturePayable = vi.fn()

vi.mock('@/services/agent-collaboration.service', () => ({
  getDepartureCollaboration: (...args: unknown[]) => getDepartureCollaboration(...args),
  acceptReviewConfirmation: (...args: unknown[]) => acceptReviewConfirmation(...args),
  getReviewConfirmation: (...args: unknown[]) => getReviewConfirmation(...args),
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

vi.mock('@/services/departure-resource.service', () => ({
  generateDeparturePayable: (...args: unknown[]) => generateDeparturePayable(...args),
}))

const evidence = [{ kind: 'user_message' as const, sequence: 1, excerpt: '全程包车 12800 元' }]

function packageView(overrides: Partial<AiReviewPackageView> = {}): AiReviewPackageView {
  return {
    id: 'pkg-1',
    status: 'pending',
    confirmationUnit: 'departure_resource',
    payloadSchema: 'departure.departure_resource@v1',
    schemaSupported: true,
    baseObjectVersion: 1,
    version: 1,
    runId: 'run-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    attemptId: 'attempt-1',
    capabilityKey: 'departure.departure-resource.propose',
    capabilityVersion: 1,
    targetKind: 'departure',
    targetId: 'dep-1',
    proposalHash: 'a'.repeat(64),
    baselineSnapshot: { mode: 'manual', routeName: '' },
    candidates: [
      {
        fieldKey: 'resourceKind',
        proposedValue: 'transport',
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
        proposedValue: '全程包车',
        clarity: 'clear',
        status: 'pending',
        evidence,
      },
      {
        fieldKey: 'amountCents',
        proposedValue: 1280000,
        clarity: 'clear',
        status: 'pending',
        evidence,
      },
      {
        fieldKey: 'notes',
        proposedValue: '4月2日至4月6日',
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
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <DepartureResourceReviewPanel departureId="dep-1" conversationId="conv-1" />
        </QueryClientProvider>
      </App>
    </ConfigProvider>,
  )
}

describe('DepartureResourceReviewPanel #450', () => {
  beforeEach(() => {
    useAuthStore.setState({ actionKeys: ['departure:write'] })
    getDepartureCollaboration.mockReset()
    acceptReviewConfirmation.mockReset()
    getReviewConfirmation.mockReset()
    listSuppliers.mockReset()
    getSupplier.mockReset()
    patchAiReviewPackage.mockReset()
    rejectAiReviewPackage.mockReset()
    confirmAiReviewPackage.mockReset()
    generateDeparturePayable.mockReset()
    listSuppliers.mockResolvedValue({ items: [{ id: 'sup-1', name: '华东车队' }], total: 1 })
    getSupplier.mockResolvedValue({ id: 'sup-1', name: '华东车队' })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows departure-level ownership without a segment field', async () => {
    getDepartureCollaboration.mockResolvedValue(collaboration([packageView()]))
    renderPanel()
    expect(await screen.findByRole('region', { name: '发团级资源审核' })).toBeInTheDocument()
    expect(screen.getByLabelText('发团级归属')).toHaveTextContent('发团级资源')
    expect(screen.queryByLabelText('行程段候选')).not.toBeInTheDocument()
    expect(screen.getByLabelText('备注候选')).toHaveValue('4月2日至4月6日')
  })

  it('blocks only the item whose new materials are still processing', async () => {
    getDepartureCollaboration.mockResolvedValue(
      collaboration([
        packageView({ confirmationBlockedReason: '正在处理此项新材料，请稍候' }),
        packageView({ id: 'pkg-2' }),
      ]),
    )
    renderPanel()
    const buttons = await screen.findAllByRole('button', { name: '确认写入资源' })
    expect(buttons[0]).toBeDisabled()
    expect(buttons[1]).toBeEnabled()
    expect(screen.getByText('正在处理此项新材料，请稍候')).toBeVisible()
  })

  it('requires material conflicts to be resolved before confirming', async () => {
    getDepartureCollaboration.mockResolvedValue(
      collaboration([
        packageView({
          conflicts: [{ fieldKey: 'amountCents', proposedValue: 1280000, userCorrectedValue: 980000 }],
        }),
      ]),
    )
    renderPanel()
    expect(await screen.findByRole('button', { name: '确认写入资源' })).toBeDisabled()
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
          resultRef: { objectKind: 'departure_resource', objectId: 'res-1' },
        },
      ],
    })
    renderPanel()

    expect(await screen.findByText('执行冲突提醒，不阻止费用录入')).toBeInTheDocument()
    const confirm = await screen.findByRole('button', { name: '确认写入资源' })
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(acceptReviewConfirmation).toHaveBeenCalledTimes(1)
    expect(confirmAiReviewPackage).not.toHaveBeenCalled()
    expect(generateDeparturePayable).not.toHaveBeenCalled()
    expect(await screen.findByText('已写入发团级资源，未提交应付')).toBeInTheDocument()
  })

  it('locks resource fields while confirmation is in flight', async () => {
    getDepartureCollaboration.mockResolvedValue(collaboration([packageView()]))
    acceptReviewConfirmation.mockImplementation(() => new Promise(() => {}))
    renderPanel()
    await userEvent.setup().click(await screen.findByRole('button', { name: '确认写入资源' }))
    expect(screen.getByLabelText('资源名称候选')).toBeDisabled()
    expect(screen.getByLabelText('约定总价候选')).toBeDisabled()
    expect(screen.getByLabelText('备注候选')).toBeDisabled()
    expect(screen.getByRole('button', { name: '拒绝建议' })).toBeDisabled()
  })

  it('shows typed corrections immediately and blocks a cleared price before saving', async () => {
    getDepartureCollaboration.mockResolvedValue(collaboration([packageView()]))
    renderPanel()
    const title = await screen.findByLabelText('资源名称候选')
    await userEvent.setup().type(title, '含过路费')
    expect(title).toHaveValue('全程包车含过路费')
    fireEvent.change(screen.getByLabelText('约定总价候选'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: '确认写入资源' })).toBeDisabled()
    expect(acceptReviewConfirmation).not.toHaveBeenCalled()
  })

  it('confirms the saved version when a correction is immediately followed by confirm', async () => {
    let stored = packageView()
    getDepartureCollaboration.mockImplementation(async () => collaboration([stored]))
    patchAiReviewPackage.mockImplementation(async (_taskId, _packageId, input) => {
      stored = packageView({ version: input.expectedPackageVersion + 1 })
      return { pendingReviews: [stored], pendingReview: stored }
    })
    acceptReviewConfirmation.mockResolvedValue({
      items: [{ packageId: 'pkg-1', status: 'succeeded' }],
    })
    renderPanel()
    fireEvent.change(await screen.findByLabelText('资源名称候选'), {
      target: { value: '修订包车' },
    })
    fireEvent.click(screen.getByRole('button', { name: '确认写入资源' }))
    await waitFor(() =>
      expect(acceptReviewConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ packageId: 'pkg-1', expectedPackageVersion: 2 }] }),
      ),
    )
  })

  it('flushes pending corrections and uses the saved version when rejecting', async () => {
    let stored = packageView()
    getDepartureCollaboration.mockImplementation(async () => collaboration([stored]))
    patchAiReviewPackage.mockImplementation(async (_taskId, _packageId, input) => {
      stored = packageView({ version: input.expectedPackageVersion + 1 })
      return { pendingReviews: [stored], pendingReview: stored }
    })
    rejectAiReviewPackage.mockResolvedValue({ pendingReviews: [], pendingReview: null })
    renderPanel()
    fireEvent.change(await screen.findByLabelText('备注候选'), {
      target: { value: '修订备注' },
    })
    fireEvent.click(screen.getByRole('button', { name: '拒绝建议' }))
    await waitFor(() =>
      expect(rejectAiReviewPackage).toHaveBeenCalledWith('', 'pkg-1', {
        expectedPackageVersion: 2,
      }),
    )
    expect(patchAiReviewPackage).toHaveBeenCalledWith('', 'pkg-1', {
      expectedPackageVersion: 1,
      corrections: { notes: '修订备注' },
    })
  })

  it('disables supplier search until a resource kind is selected', async () => {
    const pkg = packageView()
    pkg.candidates = pkg.candidates.filter((item) => item.fieldKey !== 'resourceKind')
    getDepartureCollaboration.mockResolvedValue(collaboration([pkg]))
    renderPanel()
    expect(await screen.findByRole('combobox', { name: '供应商候选' })).toBeDisabled()
    expect(listSuppliers).not.toHaveBeenCalled()
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
              resultRef: { objectKind: 'departure_resource', objectId: 'res-1' },
            },
          ],
        },
      ],
    })
    renderPanel()

    expect(await screen.findByText('资源已写入')).toBeInTheDocument()
    expect(screen.getByText(/全程包车。写入时未自动提交应付/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认写入资源' })).not.toBeInTheDocument()
  })

  it('shows the later success after an earlier confirmation for the same package failed', async () => {
    getDepartureCollaboration.mockResolvedValue({
      ...collaboration([packageView({ status: 'confirmed' })]),
      confirmations: [
        {
          decisionCommandId: 'decision-fail',
          accepted: true,
          items: [
            {
              packageId: 'pkg-1',
              status: 'failed',
              reason: '资源种类「用车」不属于该供应商的类别集合',
            },
          ],
        },
        {
          decisionCommandId: 'decision-ok',
          accepted: true,
          items: [
            {
              packageId: 'pkg-1',
              status: 'succeeded',
              resultRef: { objectKind: 'departure_resource', objectId: 'res-1' },
            },
          ],
        },
      ],
    })
    renderPanel()

    expect(await screen.findByText('资源已写入')).toBeInTheDocument()
    expect(screen.queryByText('资源种类「用车」不属于该供应商的类别集合')).not.toBeInTheDocument()
    expect(screen.queryByText('写入失败，候选仍保留')).not.toBeInTheDocument()
  })

  it('clears an incompatible supplier when the resource kind changes', async () => {
    const user = userEvent.setup()
    const pkg = packageView({
      candidates: packageView().candidates.map((candidate) =>
        candidate.fieldKey === 'resourceKind'
          ? { ...candidate, proposedValue: 'insurance' }
          : candidate,
      ),
    })
    getDepartureCollaboration.mockResolvedValue(collaboration([pkg]))
    listSuppliers.mockResolvedValue({ items: [{ id: 'sup-1', name: '平安保险' }], total: 1 })
    getSupplier.mockResolvedValue({
      id: 'sup-1',
      name: '平安保险',
      categories: ['insurance'],
    })
    patchAiReviewPackage.mockResolvedValue({
      pendingReviews: [pkg],
      pendingReview: pkg,
    })
    renderPanel()

    await user.click(await screen.findByRole('combobox', { name: '资源种类候选' }))
    await user.click(await screen.findByText('用车'))
    await waitFor(() =>
      expect(patchAiReviewPackage).toHaveBeenCalledWith(
        '',
        'pkg-1',
        expect.objectContaining({
          corrections: expect.objectContaining({
            resourceKind: 'transport',
            supplierId: null,
          }),
        }),
      ),
    )
  })
})
