import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  PaymentScheduleStatus,
  TransactionDirection,
  type FinanceTransactionSummary,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Form, Modal } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateVerificationDrawer } from './CreateVerificationDrawer'
import type { CreateVerificationFormValues } from '../utils/verification-form'

const listFinanceDepartureOptions = vi.fn()
const listTransactions = vi.fn()
const listReceivables = vi.fn()

vi.mock('@/services/finance.service', () => ({
  listFinanceDepartureOptions: (...args: unknown[]) => listFinanceDepartureOptions(...args),
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
    voidedAt: null,
    voidReason: null,
    notes: null,
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
  onSubmit: (values: CreateVerificationFormValues) => void
}) {
  const [form] = Form.useForm<CreateVerificationFormValues>()

  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ConfigProvider>
        <CreateVerificationDrawer
          open
          loading={false}
          form={form}
          initialTransaction={makeTransaction()}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
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
    const confirmSpy = vi.spyOn(Modal, 'confirm')

    await selectScheduleAndSubmit(makeSchedule('dep-1'), onSubmit)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('submits cross-departure verification only after confirmation', async () => {
    type ConfirmConfig = Parameters<typeof Modal.confirm>[0]
    let confirmConfig: ConfirmConfig | undefined
    const onSubmit = vi.fn()
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      confirmConfig = config
      return {
        destroy: vi.fn(),
        update: vi.fn(),
        then: undefined,
      } as ReturnType<typeof Modal.confirm>
    })

    await selectScheduleAndSubmit(makeSchedule('dep-2'), onSubmit)

    await waitFor(() => expect(confirmConfig).toBeDefined())
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmConfig).toMatchObject({
      title: '确认跨团核销？',
      okText: '继续核销',
      cancelText: '取消',
    })
    expect(onSubmit).not.toHaveBeenCalled()

    confirmConfig?.onCancel?.()
    expect(onSubmit).not.toHaveBeenCalled()

    await confirmConfig?.onOk?.()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
