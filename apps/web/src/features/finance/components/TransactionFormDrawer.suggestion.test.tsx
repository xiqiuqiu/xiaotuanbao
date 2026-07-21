import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Form } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CounterpartyType,
  DepartureStatus,
  PaymentScheduleSourceType,
  TransactionDirection,
} from '@xiaotuanbao/shared'
import { TransactionFormDrawer } from './TransactionFormDrawer'
import type { TransactionFormValues } from '../utils/transaction-form'
import {
  listDepartureReceivables,
  listFinanceDepartureOptions,
  listFinancePartnerOptions,
  listFinanceSourceOrderOptions,
  listFinanceSupplierOptions,
} from '@/services/finance.service'
import { getSourceOrder } from '@/services/source-order.service'

vi.mock('@/services/finance.service', () => ({
  listFinanceDepartureOptions: vi.fn(),
  listFinancePartnerOptions: vi.fn(),
  listFinanceSupplierOptions: vi.fn(),
  listFinanceSourceOrderOptions: vi.fn(),
  listDepartureReceivables: vi.fn(),
}))

vi.mock('@/services/source-order.service', () => ({
  getSourceOrder: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

function renderDrawer() {
  let formRef: FormInstance<TransactionFormValues> | null = null

  function Harness() {
    const [form] = Form.useForm<TransactionFormValues>()
    formRef = form
    return (
      <TransactionFormDrawer
        open
        mode="create"
        editingTransaction={null}
        loading={false}
        form={form}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />
    )
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <Harness />
      </ConfigProvider>
    </QueryClientProvider>,
  )

  return {
    getForm: () => formRef!,
  }
}

describe('TransactionFormDrawer departure-scoped options and amount suggestion', () => {
  beforeEach(() => {
    vi.mocked(listFinanceDepartureOptions).mockResolvedValue([
      {
        id: 'dep-1',
        departureNo: 'D1',
        name: '发团一',
        status: DepartureStatus.PENDING_SETTLEMENT,
      },
    ])
    vi.mocked(listFinancePartnerOptions).mockResolvedValue([])
    vi.mocked(listFinanceSupplierOptions).mockResolvedValue([])
    vi.mocked(listFinanceSourceOrderOptions).mockResolvedValue([
      { id: 'so-1', displayName: '客源单一' },
      { id: 'so-2', displayName: '客源单二' },
    ])
    vi.mocked(listDepartureReceivables).mockResolvedValue({
      items: [
        {
          id: 'sch-1',
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          amountCents: 500_00,
          unsettledAmountCents: 300_00,
          cancelledAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never)
    vi.mocked(getSourceOrder).mockResolvedValue({
      id: 'so-1',
      guestCollectCents: 500_00,
    } as never)
  })

  it('disables partner select until departure is chosen and shows empty hint', async () => {
    const { getForm } = renderDrawer()

    await waitFor(() => {
      expect(getForm().getFieldValue('counterpartyType')).toBe(CounterpartyType.PARTNER)
      expect(screen.getAllByText('请先选择关联发团').length).toBeGreaterThan(0)
    })

    expect(listFinancePartnerOptions).not.toHaveBeenCalled()

    await act(async () => {
      getForm().setFieldsValue({ departureId: 'dep-1' })
    })

    await waitFor(() => {
      expect(listFinancePartnerOptions).toHaveBeenCalledWith('dep-1')
      expect(screen.getByText('本团暂无关联的合作伙伴')).toBeTruthy()
    })
  })

  it('shows guest collection suggestion and fills amount on click', async () => {
    const user = userEvent.setup()
    const { getForm } = renderDrawer()

    await act(async () => {
      getForm().setFieldsValue({
        departureId: 'dep-1',
        direction: TransactionDirection.INFLOW,
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'so-1',
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/未结清 ¥300.00/)).toBeTruthy()
      expect(screen.getByRole('button', { name: '填入' })).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: '填入' }))

    expect(getForm().getFieldValue('amountYuan')).toBe(300)
  })

  it('keeps hand-edited amount when switching source order', async () => {
    const user = userEvent.setup()
    const { getForm } = renderDrawer()

    await act(async () => {
      getForm().setFieldsValue({
        departureId: 'dep-1',
        direction: TransactionDirection.INFLOW,
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'so-1',
      })
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '填入' })).toBeTruthy()
    })
    await user.click(screen.getByRole('button', { name: '填入' }))
    expect(getForm().getFieldValue('amountYuan')).toBe(300)

    await act(async () => {
      getForm().setFieldsValue({ amountYuan: 120 })
    })

    vi.mocked(listDepartureReceivables).mockResolvedValue({
      items: [
        {
          id: 'sch-2',
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          amountCents: 800_00,
          unsettledAmountCents: 800_00,
          cancelledAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never)
    vi.mocked(getSourceOrder).mockResolvedValue({
      id: 'so-2',
      guestCollectCents: 800_00,
    } as never)

    await act(async () => {
      getForm().setFieldsValue({ counterpartyId: 'so-2' })
    })

    await waitFor(() => {
      expect(screen.getByText(/未结清 ¥800.00/)).toBeTruthy()
    })
    expect(getForm().getFieldValue('amountYuan')).toBe(120)
  })

  it('replaces amount when switching source order if still at suggested value', async () => {
    const user = userEvent.setup()
    const { getForm } = renderDrawer()

    await act(async () => {
      getForm().setFieldsValue({
        departureId: 'dep-1',
        direction: TransactionDirection.INFLOW,
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'so-1',
      })
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '填入' })).toBeTruthy()
    })
    await user.click(screen.getByRole('button', { name: '填入' }))
    expect(getForm().getFieldValue('amountYuan')).toBe(300)

    vi.mocked(listDepartureReceivables).mockResolvedValue({
      items: [
        {
          id: 'sch-2',
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          amountCents: 800_00,
          unsettledAmountCents: 800_00,
          cancelledAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never)
    vi.mocked(getSourceOrder).mockResolvedValue({
      id: 'so-2',
      guestCollectCents: 800_00,
    } as never)

    await act(async () => {
      getForm().setFieldsValue({ counterpartyId: 'so-2' })
    })

    await waitFor(() => {
      expect(getForm().getFieldValue('amountYuan')).toBe(800)
      expect(screen.getByText(/未结清 ¥800.00/)).toBeTruthy()
    })
  })
})
