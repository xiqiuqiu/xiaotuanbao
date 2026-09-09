import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { cleanup, render as renderBase, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { listPartners } from '@/services/partner.service'
import { SourceOrderReviewPanel } from './SourceOrderReviewPanel'
import { useState } from 'react'

vi.mock('@/services/partner.service', () => ({
  getPartner: vi.fn().mockResolvedValue({ id: 'partner-1', name: '客户甲' }),
  listPartners: vi.fn().mockResolvedValue({ items: [] }),
}))
function render(ui: ReactNode) {
  return renderBase(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  )
}

const pendingReview: AiReviewPackageView = {
  id: 'pkg-1',
  status: 'pending',
  confirmationUnit: 'source_order_create',
  payloadSchema: 'source_order.create@v1',
  schemaSupported: true,
  baseObjectVersion: 1,
  version: 1,
  runId: 'run-1',
  conversationId: 'conv-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  capabilityKey: 'departure.review-package.propose',
  capabilityVersion: 1,
  targetKind: 'departure',
  targetId: 'departure-1',
  proposalHash: 'a'.repeat(64),
  baselineSnapshot: { mode: 'manual', routeName: '' },
  candidates: [
    {
      fieldKey: 'partnerId',
      proposedValue: 'partner-1',
      clarity: 'clear',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客户甲' }],
    },
    {
      fieldKey: 'adultGuestCount',
      proposedValue: 8,
      clarity: 'clear',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '8成人' }],
    },
    {
      fieldKey: 'childGuestCount',
      proposedValue: null,
      clarity: 'undetermined',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '未提儿童' }],
    },
    {
      fieldKey: 'fareAdjustments',
      proposedValue: null,
      clarity: 'undetermined',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '未提调整' }],
    },
    {
      fieldKey: 'discountType',
      proposedValue: null,
      clarity: 'undetermined',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '未提优惠' }],
    },
    {
      fieldKey: 'collectionMode',
      proposedValue: 'partner_settled',
      clarity: 'clear',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客户结算' }],
    },
  ],
}

afterEach(() => cleanup())

describe('SourceOrderReviewPanel', () => {
  it('does not overwrite an existing adjustment when confirming no discount', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<SourceOrderReviewPanel pendingReview={{
      ...pendingReview,
      candidates: pendingReview.candidates.map((candidate) => candidate.fieldKey === 'fareAdjustments'
        ? { ...candidate, proposedValue: [{ kind: 'single_room_topup', direction: 'increase', amountCents: 10000 }] }
        : candidate),
    }} onSaveGroup={save} />)
    await userEvent.setup().click(screen.getByRole('button', { name: '确认无优惠' }))
    expect(save).toHaveBeenCalledWith({ discountType: 'none' })
  })

  it('lets the user confirm missing adjustments and discount together before writing', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const confirm = vi.fn().mockResolvedValue(undefined)
    function Review() {
      const [values, setValues] = useState<Record<string, unknown>>({
        partnerId: 'partner-1', adultGuestCount: 2, childGuestCount: 0,
        adultUnitPriceCents: 100000, collectionMode: 'partner_settled',
      })
      return <SourceOrderReviewPanel pendingReview={{
        ...pendingReview, candidates: Object.entries(values).map(([fieldKey, proposedValue]) => ({
          ...pendingReview.candidates[0]!, fieldKey, proposedValue,
        })),
      }} onSaveGroup={async (corrections) => {
        await save(corrections)
        setValues((current) => ({ ...current, ...corrections }))
      }} onConfirm={confirm} />
    }
    render(<Review />)
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: '确认写入客源单' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '确认无调整、无优惠' }))
    expect(save).toHaveBeenCalledWith({ fareAdjustments: [], discountType: 'none' })
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '确认写入客源单' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '确认写入客源单' }))
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it.each(['partner_settled', 'guest_only', 'split'])('allows %s confirmation without optional settlement notes', async (collectionMode) => {
    const values = {
      partnerId: 'partner-1', adultGuestCount: 2, childGuestCount: 0,
      adultUnitPriceCents: 100000, fareAdjustments: [], discountType: 'none',
      collectionMode,
      ...(collectionMode === 'partner_settled' ? {} : { depositCents: 0, balanceCents: 200000 }),
    }
    const confirm = vi.fn().mockResolvedValue(undefined)
    render(<SourceOrderReviewPanel pendingReview={{
      ...pendingReview,
      candidates: Object.entries(values).map(([fieldKey, proposedValue]) => ({
        ...pendingReview.candidates[0]!, fieldKey, proposedValue,
      })),
    }} onConfirm={confirm} />)
    const button = screen.getByRole('button', { name: '确认写入客源单' })
    expect(button).toBeEnabled()
    await userEvent.setup().click(button)
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('explains missing settlement amounts at the confirm button and allows saving them', async () => {
    const values = {
      partnerId: 'partner-1', adultGuestCount: 2, childGuestCount: 0,
      adultUnitPriceCents: 100000, fareAdjustments: [], discountType: 'none',
      collectionMode: 'split',
    }
    const review = { ...pendingReview, candidates: Object.entries(values).map(([fieldKey, proposedValue]) => ({
      ...pendingReview.candidates[0]!, fieldKey, proposedValue,
    })) }
    const save = vi.fn().mockResolvedValue(undefined)
    const confirm = vi.fn().mockResolvedValue(undefined)
    render(<SourceOrderReviewPanel pendingReview={review} onSaveGroup={save} onConfirm={confirm} />)
    const button = screen.getByRole('button', { name: '确认写入客源单' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('请通过组内编辑补充：定金、尾款；保存后再确认。')
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: '组内编辑' })[3]!)
    await user.type(screen.getByRole('spinbutton', { name: '定金' }), '500')
    await user.type(screen.getByRole('spinbutton', { name: '尾款' }), '1500')
    expect(button).toHaveAccessibleDescription('请先保存或取消当前组的编辑。')
    await user.click(screen.getByRole('button', { name: '保存本组' }))
    expect(save).toHaveBeenCalledWith({ depositCents: 50000, balanceCents: 150000 })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows the five source-order groups and blocks confirm while required fields are missing', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <SourceOrderReviewPanel
          pendingReview={pendingReview}
          onSaveGroup={vi.fn()}
          onConfirm={vi.fn()}
        />
      </ConfigProvider>,
    )

    expect(screen.getAllByText('客户与报价').length).toBeGreaterThan(0)
    expect(screen.getAllByText('团款调整').length).toBeGreaterThan(0)
    expect(screen.getAllByText('团款优惠').length).toBeGreaterThan(0)
    expect(screen.getAllByText('收款约定').length).toBeGreaterThan(0)
    expect(screen.getAllByText('客人名单').length).toBeGreaterThan(0)
    expect(screen.getByText(/待确认缺失项/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认写入客源单' })).toBeDisabled()
  })

  it('keeps confirm disabled until missing items are filled', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <SourceOrderReviewPanel
          pendingReview={{
            ...pendingReview,
            candidates: pendingReview.candidates.map((candidate) =>
              candidate.fieldKey === 'childGuestCount'
                ? { ...candidate, proposedValue: 0, clarity: 'clear' }
                : candidate,
            ),
          }}
          onSaveGroup={vi.fn()}
          onConfirm={vi.fn()}
        />
      </ConfigProvider>,
    )

    expect(screen.getByText(/待确认缺失项/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认写入客源单' })).toBeDisabled()
  })

  it('saves only the fields edited in the current group', async () => {
    const onSaveGroup = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <ConfigProvider locale={zhCN}>
        <SourceOrderReviewPanel
          pendingReview={pendingReview}
          onSaveGroup={onSaveGroup}
          onConfirm={vi.fn()}
        />
      </ConfigProvider>,
    )

    await user.click(screen.getAllByRole('button', { name: '组内编辑' })[0]!)
    await user.click(screen.getByRole('button', { name: '保存本组' }))

    expect(onSaveGroup).toHaveBeenCalledTimes(1)
    expect(Object.keys(onSaveGroup.mock.calls[0]![0] as Record<string, unknown>)).toEqual([])
  })

  it('edits yuan amounts as integer cents and displays business labels', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SourceOrderReviewPanel pendingReview={pendingReview} onSaveGroup={save} />)
    expect(await screen.findByText('客户甲')).toBeInTheDocument()
    expect(screen.getByText('客户结算')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '组内编辑' })[0]!)
    await user.type(screen.getByRole('spinbutton', { name: '成人单价' }), '1250.50')
    await user.click(screen.getByRole('button', { name: '保存本组' }))
    expect(save).toHaveBeenCalledWith({ adultUnitPriceCents: 125050 })
  })

  it('shows post-create actions without submitting receivables', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <SourceOrderReviewPanel
          pendingReview={pendingReview}
          createdSourceOrderId="so-1"
          onSaveGroup={vi.fn()}
          onConfirm={vi.fn()}
        />
      </ConfigProvider>,
    )

    expect(screen.getByText('客源单已创建')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暂不处理' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看客源单' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '继续提交应收' })).toBeInTheDocument()
  })

  it('keeps 继续提交应收 for finance without departure:write (ADR-0023)', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <SourceOrderReviewPanel
          createdSourceOrderId="so-1"
          readOnly
          onContinueReceivables={vi.fn()}
          onSkipReceivables={vi.fn()}
          onViewSourceOrder={vi.fn()}
        />
      </ConfigProvider>,
    )

    expect(screen.getByRole('button', { name: '继续提交应收' })).toBeEnabled()
  })

  it('hides the continue-receivable primary when the caller cannot prepare', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <SourceOrderReviewPanel
          createdSourceOrderId="so-1"
          canContinueReceivables={false}
          onViewSourceOrder={vi.fn()}
        />
      </ConfigProvider>,
    )

    expect(screen.queryByRole('button', { name: '继续提交应收' })).not.toBeInTheDocument()
    expect(screen.getByText('当前不能从这里准备应收')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看客源单' })).toBeInTheDocument()
  })
})

it('explains readonly permissions and prevents editing', async () => {
  render(<SourceOrderReviewPanel pendingReview={pendingReview} readOnly />)
  expect(screen.getByText('当前为只读模式')).toBeInTheDocument()
  for (const button of screen.getAllByRole('button', { name: '组内编辑' }))
    expect(button).toBeDisabled()
})
it('offers retry when customer search fails and recovers without losing the selection', async () => {
  vi.mocked(listPartners).mockRejectedValueOnce(new Error('offline'))
  render(<SourceOrderReviewPanel pendingReview={pendingReview} />)
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: '组内编辑' })[0]!)
  expect(await screen.findByText('客户加载失败')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /重\s*试/ }))
  expect(await screen.findByText('客户甲')).toBeInTheDocument()
})
