import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AiReviewStickyBar } from './AiReviewStickyBar'

const pendingReview: AiReviewPackageView = {
  id: 'pkg-1',
  status: 'pending',
  confirmationUnit: 'basic_info_draft',
  payloadSchema: 'departure.basic_info_draft@v1',
  schemaSupported: true,
  baseObjectVersion: 1,
  version: 1,
  runId: 'run-1',
  conversationId: 'conv-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  capabilityKey: 'departure.review-package.propose',
  capabilityVersion: 1,
  targetKind: 'departure_creation_draft',
  targetId: 'draft-1',
  proposalHash: 'a'.repeat(64),
  baselineSnapshot: { mode: 'manual', routeName: '' },
  candidates: [
    {
      fieldKey: 'name',
      proposedValue: '八月川西团',
      userCorrectedValue: null,
      clarity: 'clear',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫八月川西团' }],
    },
    {
      fieldKey: 'routeName',
      proposedValue: '川西线',
      userCorrectedValue: null,
      clarity: 'clear',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '走川西' }],
    },
  ],
}

describe('AiReviewStickyBar', () => {
  afterEach(() => {
    cleanup()
  })

  it('lists suggested fields and confirms or rejects the whole package', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onReject = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <AiReviewStickyBar pendingReview={pendingReview} onConfirm={onConfirm} onReject={onReject} />
      </ConfigProvider>,
    )

    expect(screen.getByRole('region', { name: 'AI 阶段审核包' })).toBeInTheDocument()
    expect(screen.getByText('待确认 AI 建议')).toBeInTheDocument()
    expect(
      screen.getByText('已建议修改团名、路线。确认后写入发团创建草稿，拒绝后保留当前已保存值。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('含需确认字段，请对照证据后再写入')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认写入草稿' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '拒绝建议' }))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('flags a package that still needs confirmation against evidence #443', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <AiReviewStickyBar
          pendingReview={{
            ...pendingReview,
            candidates: [
              {
                ...pendingReview.candidates[0]!,
                fieldKey: 'driverSupplierId',
                proposedValue: 'sup-1',
                clarity: 'needs_confirmation',
                evidence: [
                  {
                    kind: 'material_region',
                    materialId: 'mat-1',
                    parseResultVersion: 1,
                    pageNumber: 1,
                    excerpt: '司机：川西车队',
                  },
                ],
              },
            ],
          }}
          onConfirm={vi.fn()}
          onReject={vi.fn()}
        />
      </ConfigProvider>,
    )

    expect(screen.getByText('含需确认字段，请对照证据后再写入')).toBeInTheDocument()
  })

  it('safely blocks confirmation for an unknown or stale Review Schema #440', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onReject = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <AiReviewStickyBar
          pendingReview={{
            ...pendingReview,
            payloadSchema: 'departure.basic_info_draft@v999',
            schemaSupported: false,
          }}
          onConfirm={onConfirm}
          onReject={onReject}
        />
      </ConfigProvider>,
    )

    expect(screen.getByText('审核包版本不受支持，请拒绝本次建议')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: '确认写入草稿' })
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
    const reject = screen.getByRole('button', { name: '拒绝建议' })
    expect(reject).toBeEnabled()
    await user.click(reject)
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('fails closed when a legacy payload omits schemaSupported #440', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <AiReviewStickyBar
          pendingReview={{ ...pendingReview, schemaSupported: undefined }}
          onConfirm={onConfirm}
          onReject={vi.fn()}
        />
      </ConfigProvider>,
    )

    const confirm = screen.getByRole('button', { name: '确认写入草稿' })
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps mobile review actions at least 44px high', () => {
    const css = readFileSync(resolve(__dirname, './AiReviewStickyBar.module.css'), 'utf8')
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.actions[^}]*\{[^}]*min-height:\s*44px/)
  })
})
