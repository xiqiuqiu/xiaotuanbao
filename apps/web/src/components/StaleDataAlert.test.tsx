import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaleDataAlert } from './StaleDataAlert'

describe('StaleDataAlert', () => {
  afterEach(() => {
    cleanup()
  })

  it('stays silent while automatic refresh is healthy', () => {
    const { container } = render(
      <StaleDataAlert
        isFetching={false}
        isError={false}
        hasData
        onRefresh={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers a soft retry when auto refresh failed but last data is still on screen', () => {
    render(
      <StaleDataAlert
        isFetching={false}
        isError
        hasData
        onRefresh={vi.fn()}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('自动更新失败，仍显示上次数据')
    expect(alert.className).toMatch(/ant-alert-info/)
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument()
    expect(screen.queryByText('可能不是最新')).toBeNull()
    expect(screen.queryByText('点击更新')).toBeNull()
  })

  it('invokes onRefresh when the user chooses to retry', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()

    render(
      <StaleDataAlert
        isFetching={false}
        isError
        hasData
        onRefresh={onRefresh}
      />,
    )

    await user.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })
})
