import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { SourceOrderReviewPanel } from './SourceOrderReviewPanel'

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

describe('SourceOrderReviewPanel', () => {
  afterEach(() => cleanup())

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

    expect(screen.getByText('客源单已创建，尚未提交应收')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看客源单' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '继续提交应收' })).toBeInTheDocument()
  })
})
