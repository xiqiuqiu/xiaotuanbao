import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { describe, expect, it, vi } from 'vitest'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { AiCreateAssistDrawer } from './AiCreateAssistDrawer'

describe('AiCreateAssistDrawer', () => {
  it('keeps the form usable by showing structured agent failure instead of crashing', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <ConfigProvider locale={zhCN}>
        <AiCreateAssistDrawer
          open
          events={[]}
          error={AiCollaborationError.fromCode('AGENT_UNAVAILABLE').toJSON()}
          onClose={() => undefined}
          onRetry={onRetry}
        />
      </ConfigProvider>,
    )

    expect(screen.getByText('AI 辅助暂时不可用，请稍后重试或继续使用表单')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
