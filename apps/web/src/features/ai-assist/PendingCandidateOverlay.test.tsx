import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiReviewCandidateView } from '@xiaotuanbao/shared'
import { PendingCandidateOverlay } from './PendingCandidateOverlay'

const candidate: AiReviewCandidateView = {
  fieldKey: 'name',
  proposedValue: '八月川西团',
  userCorrectedValue: null,
  clarity: 'clear',
  status: 'pending',
  evidence: [{ kind: 'user_message', excerpt: '团名叫八月川西团' }],
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
          candidate={candidate}
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
})
