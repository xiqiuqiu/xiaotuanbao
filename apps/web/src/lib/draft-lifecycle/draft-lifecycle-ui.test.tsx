import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftRestoreFailure } from './DraftRestoreFailure'
import { CriticalQueryErrorAlert } from './CriticalQueryErrorAlert'

function renderUi(node: ReactNode) {
  return render(
    <ConfigProvider locale={zhCN}>
      <App>{node}</App>
    </ConfigProvider>,
  )
}

describe('DraftRestoreFailure', () => {
  afterEach(() => {
    cleanup()
  })

  it('offers retry and starting a new draft without rendering a form', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const onStartFresh = vi.fn()
    renderUi(
      <DraftRestoreFailure
        title="发团创建草稿恢复失败"
        description="任务不存在"
        onRetry={onRetry}
        onStartFresh={onStartFresh}
      />,
    )

    expect(screen.getByText('发团创建草稿恢复失败')).toBeInTheDocument()
    expect(screen.getByText('任务不存在')).toBeInTheDocument()
    expect(screen.queryByLabelText('团名')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试' }))
    await user.click(screen.getByRole('button', { name: '新建草稿' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onStartFresh).toHaveBeenCalledTimes(1)
  })
})

describe('CriticalQueryErrorAlert', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the real error and a retry action instead of an empty state', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderUi(
      <CriticalQueryErrorAlert title="负责人列表加载失败" onRetry={onRetry} />,
    )

    expect(screen.getByText('负责人列表加载失败')).toBeInTheDocument()
    expect(screen.getByText('请检查网络后重试')).toBeInTheDocument()
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
