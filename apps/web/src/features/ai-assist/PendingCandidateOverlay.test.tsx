import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiReviewCandidateView } from '@xiaotuanbao/shared'
import { PendingCandidateOverlay } from './PendingCandidateOverlay'

function candidate(
  overrides: Partial<AiReviewCandidateView> & Pick<AiReviewCandidateView, 'fieldKey' | 'proposedValue'>,
): AiReviewCandidateView {
  return {
    clarity: 'clear',
    status: 'pending',
    evidence: [{ kind: 'user_message', excerpt: '团名叫八月川西团' }],
    ...overrides,
  }
}

describe('PendingCandidateOverlay', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the candidate, saved snapshot value, and expandable evidence without writing the form', async () => {
    const user = userEvent.setup()
    const onCorrect = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <PendingCandidateOverlay
          fieldKey="name"
          candidate={candidate({ fieldKey: 'name', proposedValue: '八月川西团' })}
          savedDisplay="喀纳斯阿勒泰10日线 8月1日团"
          onCorrect={onCorrect}
        />
      </ConfigProvider>,
    )

    const input = screen.getByLabelText('团名候选')
    expect(input).toHaveValue('八月川西团')
    expect(screen.getByText('已保存：喀纳斯阿勒泰10日线 8月1日团')).toBeInTheDocument()
    expect(screen.queryByText('团名叫八月川西团')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看证据' }))
    expect(screen.getByText('团名叫八月川西团')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '修正团名' } })
    expect(onCorrect).toHaveBeenCalledWith('修正团名')
  })

  it('keeps an explicit date clear empty instead of restoring the proposed value', () => {
    const onCorrect = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <PendingCandidateOverlay
          fieldKey="startDate"
          candidate={candidate({
            fieldKey: 'startDate',
            proposedValue: '2026-09-01',
            userCorrectedValue: null,
          })}
          savedDisplay="2026-08-01"
          onCorrect={onCorrect}
        />
      </ConfigProvider>,
    )

    expect(screen.getByLabelText('出团日期候选')).toHaveValue('')
  })

  it('keeps an explicit guest-count clear empty instead of restoring the proposed value', () => {
    const onCorrect = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <PendingCandidateOverlay
          fieldKey="expectedGuestCountHint"
          candidate={candidate({
            fieldKey: 'expectedGuestCountHint',
            proposedValue: 8,
            userCorrectedValue: null,
          })}
          savedDisplay="8"
          onCorrect={onCorrect}
        />
      </ConfigProvider>,
    )

    expect(screen.getByLabelText('预计人数提示候选')).toHaveValue('')
  })

  it('reports clearing a date and guest-count candidate as null', () => {
    const onCorrect = vi.fn()
    const { rerender } = render(
      <ConfigProvider locale={zhCN}>
        <PendingCandidateOverlay
          fieldKey="startDate"
          candidate={candidate({ fieldKey: 'startDate', proposedValue: '2026-09-01' })}
          savedDisplay="2026-08-01"
          onCorrect={onCorrect}
        />
      </ConfigProvider>,
    )

    fireEvent.mouseDown(screen.getByLabelText('出团日期候选'))
    fireEvent.click(screen.getByRole('button', { name: '清除' }))
    expect(onCorrect).toHaveBeenCalledWith(null)

    onCorrect.mockClear()
    rerender(
      <ConfigProvider locale={zhCN}>
        <PendingCandidateOverlay
          fieldKey="expectedGuestCountHint"
          candidate={candidate({ fieldKey: 'expectedGuestCountHint', proposedValue: 8 })}
          savedDisplay="8"
          onCorrect={onCorrect}
        />
      </ConfigProvider>,
    )
    fireEvent.change(screen.getByLabelText('预计人数提示候选'), { target: { value: '' } })
    expect(onCorrect).toHaveBeenCalledWith(null)
  })

  it('shows a templateId candidate as read-only text without a write input', () => {
    const onCorrect = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <PendingCandidateOverlay
          fieldKey="templateId"
          candidate={candidate({
            fieldKey: 'templateId',
            proposedValue: 'tpl-1',
            evidence: [{ kind: 'system_derivation', rule: 'searchRouteTemplates:name_contains_token:川西' }],
          })}
          displayValue="川西稻城线"
          savedDisplay="未选择"
          onCorrect={onCorrect}
        />
      </ConfigProvider>,
    )

    expect(screen.getByLabelText('常用路线候选')).toHaveTextContent('川西稻城线')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(onCorrect).not.toHaveBeenCalled()
  })

  it('shows material region excerpt, page number, and a preview action', async () => {
    const user = userEvent.setup()
    const onPreviewMaterial = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <PendingCandidateOverlay
          fieldKey="name"
          candidate={candidate({
            fieldKey: 'name',
            proposedValue: '八月川西团',
            evidence: [
              {
                kind: 'material_region',
                materialId: 'mat-1',
                pageNumber: 2,
                excerpt: '八月川西团',
                coordinateSystem: 'pdf_point',
              },
            ],
          })}
          savedDisplay="未填写"
          onCorrect={vi.fn()}
          onPreviewMaterial={onPreviewMaterial}
        />
      </ConfigProvider>,
    )

    await user.click(screen.getByRole('button', { name: '查看证据' }))
    expect(screen.getByText('「八月川西团」第 2 页')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '预览档案' }))
    expect(onPreviewMaterial).toHaveBeenCalledWith('mat-1')
  })
})
