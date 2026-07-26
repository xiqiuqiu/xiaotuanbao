import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteLedgerViewPanel } from './RouteLedgerViewPanel'

const listDepartureRouteNames = vi.fn()

vi.mock('@/services/departure.service', () => ({
  listDepartureRouteNames: (...args: unknown[]) => listDepartureRouteNames(...args),
}))

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <RouteLedgerViewPanel onSwitchToDepartureList={vi.fn()} />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('RouteLedgerViewPanel', () => {
  beforeEach(() => {
    listDepartureRouteNames.mockReset()
    listDepartureRouteNames.mockResolvedValue({
      items: ['伊犁环线', '阿勒泰拼车'],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('未选路线时显示空态，提示须先选线路', async () => {
    renderPanel()

    await waitFor(() => {
      expect(listDepartureRouteNames).toHaveBeenCalled()
    })

    expect(screen.getByText('请先选择路线名称')).toBeInTheDocument()
    expect(screen.getByText(/线路视图需先选定一条路线/)).toBeInTheDocument()
  })

  it('可选本组织已存在的路线名称，选中后离开未选空态', async () => {
    const user = userEvent.setup()
    renderPanel()

    const combobox = await screen.findByRole('combobox', { name: '路线名称' })
    await user.click(combobox)

    const option = await screen.findByRole('option', { name: '伊犁环线' })
    await user.click(option)

    await waitFor(() => {
      expect(screen.queryByText('请先选择路线名称')).not.toBeInTheDocument()
    })
    expect(screen.getByText(/账本明细将在后续版本提供/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新选择路线' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回发团视图' })).toBeInTheDocument()
  })
})



