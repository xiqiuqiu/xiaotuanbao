import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  PaymentScheduleStatus,
  TransactionDirection,
  type FinanceTransactionSummary,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider, Form } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateVerificationDrawer } from './CreateVerificationDrawer'
import type {
  CreateVerificationFormValues,
  CreateVerificationSubmission,
} from '../utils/verification-form'

const listFinanceDepartureOptions = vi.fn()
const listTransactions = vi.fn()
const listReceivables = vi.fn()

vi.mock('@/services/finance.service', () => ({
  listFinanceDepartureOptions: (...args: unknown[]) =>
    listFinanceDepartureOptions(...args),
  listTransactions: (...args: unknown[]) => listTransactions(...args),
  listReceivables: (...args: unknown[]) => listReceivables(...args),
  listPayables: vi.fn(),
}))

function makeTransaction(): FinanceTransactionSummary {
  return {
    id: 'tx-1',
    transactionNo: 'TX202607000001',
    direction: TransactionDirection.INFLOW,
    paymentChannel: 'bank_transfer',
    amountCents: 100000,
    allocatedAmountCents: 0,
    unallocatedAmountCents: 100000,
    transactionDate: '2026-07-15',
    counterpartyType: 'partner',
    counterpartyId: 'partner-1',
    counterpartyName: '杭州同行',
    departureId: 'dep-1',
    departureNo: 'XTB2026070001',
    departureName: '乌镇一团',
    departureStatus: null,
    voidedAt: null,
    voidReason: null,
    notes: null,
    sourceAmountChanged: false,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  }
}

function makeSchedule(departureId: string): PaymentScheduleSummary {
  return {
    id: 'schedule-1',
    departureId,
    departureStatus: 'editing',
    direction: 'receivable',
    scheduleNo: 'AR202607000001',
    title: '同行团款',
    amountCents: 100000,
    dueDate: '2026-07-20',
    counterpartyType: 'partner',
    counterpartyId: 'partner-1',
    counterpartyName: '杭州同行',
    sourceType: 'manual',
    sourceId: null,
    status: PaymentScheduleStatus.PENDING,
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 100000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    voidedAmountCents: null,
    amountAdjustedAt: null,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  }
}

function Harness({
  onSubmit,
}: {
  onSubmit: (values: CreateVerificationSubmission) => void
}) {
  const [form] = Form.useForm<CreateVerificationFormValues>()

  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ConfigProvider>
        <App>
          <CreateVerificationDrawer
            open
            loading={false}
            form={form}
            initialTransaction={makeTransaction()}
            onClose={vi.fn()}
            onSubmit={onSubmit}
          />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  )
}

async function selectScheduleAndSubmit(
  schedule: PaymentScheduleSummary,
  onSubmit: ReturnType<typeof vi.fn>,
) {
  listFinanceDepartureOptions.mockResolvedValue([
    { id: 'dep-1', departureNo: 'XTB2026070001', name: '乌镇一团' },
    { id: 'dep-2', departureNo: 'XTB2026070002', name: '乌镇二团' },
  ])
  listTransactions.mockResolvedValue({ items: [makeTransaction()] })
  listReceivables.mockResolvedValue({ items: [schedule] })

  render(<Harness onSubmit={onSubmit} />)

  await userEvent.click(await screen.findByText('AR202607000001'))
  const previewButton = screen.getByRole('button', { name: '预览核销' })
  await waitFor(() => expect(previewButton).toBeEnabled())
  await userEvent.click(previewButton)
  await screen.findByText('核销预览')
  await userEvent.click(screen.getByRole('button', { name: '确认核销' }))
}

describe('CreateVerificationDrawer cross-departure confirmation', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    listFinanceDepartureOptions.mockReset()
    listTransactions.mockReset()
    listReceivables.mockReset()
  })

  it('submits same-departure verification without an extra warning', async () => {
    const onSubmit = vi.fn()

    await selectScheduleAndSubmit(makeSchedule('dep-1'), onSubmit)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('确认跨团核销？')).not.toBeInTheDocument()
  })

  it('submits cross-departure verification only after confirmation', async () => {
    const onSubmit = vi.fn()

    await selectScheduleAndSubmit(makeSchedule('dep-2'), onSubmit)

    expect((await screen.findAllByText('确认跨团核销？')).length).toBeGreaterThan(
      0,
    )
    expect(screen.getByRole('button', { name: '继续核销' })).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '继续核销' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ affectedDepartureIds: ['dep-1', 'dep-2'] }),
    )
  })

  it('keeps the entered verification when returning from preview', async () => {
    const onSubmit = vi.fn()

    listFinanceDepartureOptions.mockResolvedValue([
      { id: 'dep-1', departureNo: 'XTB2026070001', name: '乌镇一团' },
    ])
    listTransactions.mockResolvedValue({ items: [makeTransaction()] })
    listReceivables.mockResolvedValue({ items: [makeSchedule('dep-1')] })

    render(<Harness onSubmit={onSubmit} />)

    await userEvent.click(await screen.findByText('AR202607000001'))
    const previewButton = screen.getByRole('button', { name: '预览核销' })
    await waitFor(() => expect(previewButton).toBeEnabled())
    await userEvent.click(previewButton)

    expect(await screen.findByText('核销预览')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '返回修改' }))

    expect(screen.getByText('新增核销')).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: '本次核销金额（元）' }),
    ).toHaveValue('1000.00')

    await userEvent.click(screen.getByRole('button', { name: '预览核销' }))
    await userEvent.click(screen.getByRole('button', { name: '确认核销' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })

  it('explains the dependent empty states before a transaction is selected', async () => {
    listFinanceDepartureOptions.mockResolvedValue([])
    listTransactions.mockResolvedValue({ items: [] })
    listReceivables.mockResolvedValue({ items: [] })

    render(<Harness onSubmit={vi.fn()} />)

    expect(
      await screen.findByText('暂无可核销流水，请调整发团或搜索条件'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('选择资金流水后显示同一往来对象的未结清节点'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '预览核销' })).toBeDisabled()
  })
})

function ScheduleFirstHarness({
  schedule,
  onSubmit,
}: {
  schedule: PaymentScheduleSummary
  onSubmit: (values: CreateVerificationSubmission) => void
}) {
  const [form] = Form.useForm<CreateVerificationFormValues>()

  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ConfigProvider>
        <App>
          <CreateVerificationDrawer
            open
            loading={false}
            form={form}
            initialSchedule={schedule}
            onClose={vi.fn()}
            onSubmit={onSubmit}
          />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  )
}

describe('CreateVerificationDrawer schedule-first selection', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    listFinanceDepartureOptions.mockReset()
    listTransactions.mockReset()
    listReceivables.mockReset()
  })

  it('prefills the default amount when picking the transaction after opening from a schedule', async () => {
    const onSubmit = vi.fn()

    // 流水可核销 900，节点未结 1000，默认核销金额应带出较小值 900。
    const transaction: FinanceTransactionSummary = {
      ...makeTransaction(),
      unallocatedAmountCents: 90000,
    }
    const mismatchedTransaction: FinanceTransactionSummary = {
      ...makeTransaction(),
      id: 'tx-mismatch',
      transactionNo: 'TX202607000002',
      counterpartyType: 'guest',
      counterpartyId: 'source-order-1',
      counterpartyName: '游客代收',
    }

    listFinanceDepartureOptions.mockResolvedValue([
      { id: 'dep-1', departureNo: 'XTB2026070001', name: '乌镇一团' },
    ])
    listTransactions.mockResolvedValue({ items: [transaction, mismatchedTransaction] })
    listReceivables.mockResolvedValue({ items: [makeSchedule('dep-1')] })

    render(
      <ScheduleFirstHarness schedule={makeSchedule('dep-1')} onSubmit={onSubmit} />,
    )

    await waitFor(() =>
      expect(screen.queryByText('TX202607000002')).not.toBeInTheDocument(),
    )
    await userEvent.click(await screen.findByText('TX202607000001'))

    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: '本次核销金额（元）' }),
      ).toHaveValue('900.00'),
    )

    const previewButton = screen.getByRole('button', { name: '预览核销' })
    await waitFor(() => expect(previewButton).toBeEnabled())
  })
})
