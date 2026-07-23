import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchModule } from '@/types/api'
import { FinanceReceivablesModule } from './FinanceReceivablesModule'

const dualAxesSpy = vi.fn()
const columnSpy = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@ant-design/plots', () => ({
  DualAxes: (props: unknown) => {
    dualAxesSpy(props)
    return <div data-testid="mock-dual-axes" />
  },
  Column: (props: unknown) => {
    columnSpy(props)
    return <div data-testid="mock-column" />
  },
}))

function agingModule(buckets: WorkbenchModule['buckets']): WorkbenchModule {
  return {
    key: 'finance-receivables',
    title: '应收跟进',
    description: '测试',
    metrics: [],
    items: [],
    buckets,
  }
}

const extremeBuckets = [
  {
    key: 'aging_1_7' as const,
    label: '1–7 天',
    scheduleCount: 5,
    unsettledAmountCents: 106_000,
    href: '/finance/receivable?receivableFollowUp=aging_1_7',
  },
  {
    key: 'aging_8_30' as const,
    label: '8–30 天',
    scheduleCount: 2,
    unsettledAmountCents: 380_000,
    href: '/finance/receivable?receivableFollowUp=aging_8_30',
  },
  {
    key: 'aging_over_30' as const,
    label: '30 天以上',
    scheduleCount: 1,
    unsettledAmountCents: 999_999_900,
    href: '/finance/receivable?receivableFollowUp=aging_over_30',
  },
]

const balancedBuckets = [
  {
    key: 'aging_1_7' as const,
    label: '1–7 天',
    scheduleCount: 1,
    unsettledAmountCents: 10_000,
    href: '/finance/receivable?receivableFollowUp=aging_1_7',
  },
  {
    key: 'aging_8_30' as const,
    label: '8–30 天',
    scheduleCount: 1,
    unsettledAmountCents: 25_000,
    href: '/finance/receivable?receivableFollowUp=aging_8_30',
  },
  {
    key: 'aging_over_30' as const,
    label: '30 天以上',
    scheduleCount: 1,
    unsettledAmountCents: 90_000,
    href: '/finance/receivable?receivableFollowUp=aging_over_30',
  },
]

function renderAging(buckets: WorkbenchModule['buckets']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <FinanceReceivablesModule module={agingModule(buckets)} sections={['aging']} />
    </QueryClientProvider>,
  )
}

describe('FinanceReceivablesModule aging chart selection', () => {
  beforeEach(() => {
    dualAxesSpy.mockClear()
    columnSpy.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('defaults to share list under extreme spread and allows switching to Column', async () => {
    const user = userEvent.setup()
    renderAging(extremeBuckets)

    const shareList = screen.getByTestId('workbench-aging-share-list')
    expect(shareList).toBeInTheDocument()
    expect(shareList.querySelector('.ant-progress')).toBeNull()
    expect(columnSpy).not.toHaveBeenCalled()
    expect(dualAxesSpy).not.toHaveBeenCalled()
    expect(screen.getByLabelText('账龄图表显示模式')).toBeInTheDocument()

    await user.click(screen.getByText('金额对比'))

    expect(screen.queryByTestId('workbench-aging-share-list')).not.toBeInTheDocument()
    expect(columnSpy).toHaveBeenCalled()
    expect(dualAxesSpy).not.toHaveBeenCalled()
    expect(screen.getByText('金额对比').closest('.ant-segmented-item')).toHaveClass(
      'ant-segmented-item-selected',
    )
  })

  it('defaults to Column for comparable amounts and allows switching to share list', async () => {
    const user = userEvent.setup()
    renderAging(balancedBuckets)

    expect(screen.queryByTestId('workbench-aging-share-list')).not.toBeInTheDocument()
    expect(columnSpy).toHaveBeenCalled()
    expect(dualAxesSpy).not.toHaveBeenCalled()

    await user.click(screen.getByText('结构占比'))

    expect(screen.getByTestId('workbench-aging-share-list')).toBeInTheDocument()
    expect(screen.getByText('结构占比').closest('.ant-segmented-item')).toHaveClass(
      'ant-segmented-item-selected',
    )
  })

  it('resets view mode when suggestedMode changes via remount key', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <FinanceReceivablesModule module={agingModule(extremeBuckets)} sections={['aging']} />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('workbench-aging-share-list')).toBeInTheDocument()
    await user.click(screen.getByText('金额对比'))
    expect(screen.queryByTestId('workbench-aging-share-list')).not.toBeInTheDocument()

    rerender(
      <QueryClientProvider client={client}>
        <FinanceReceivablesModule module={agingModule(balancedBuckets)} sections={['aging']} />
      </QueryClientProvider>,
    )

    // suggestedMode: share → column，key remount 后回到推荐默认（柱状）
    expect(screen.queryByTestId('workbench-aging-share-list')).not.toBeInTheDocument()
    expect(screen.getByText('金额对比').closest('.ant-segmented-item')).toHaveClass(
      'ant-segmented-item-selected',
    )
  })
})
