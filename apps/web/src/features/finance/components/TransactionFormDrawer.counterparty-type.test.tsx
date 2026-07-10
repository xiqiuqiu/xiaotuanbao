import { act, cleanup, render, waitFor } from '@testing-library/react'
import { ConfigProvider, Form } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CounterpartyType } from '@xiaotuanbao/shared'
import { TransactionFormDrawer } from './TransactionFormDrawer'
import type { TransactionFormValues } from '../utils/transaction-form'

vi.mock('@/services/finance.service', () => ({
  listFinanceDepartureOptions: vi.fn(async () => []),
  listFinancePartnerOptions: vi.fn(async () => []),
  listFinanceSupplierOptions: vi.fn(async () => []),
}))

afterEach(() => {
  cleanup()
})

describe('TransactionFormDrawer counterparty type select', () => {
  it('keeps the selected counterparty type after switching away from the default', async () => {
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

    await waitFor(() => {
      expect(formRef).not.toBeNull()
      expect(formRef!.getFieldValue('counterpartyType')).toBe(CounterpartyType.PARTNER)
    })

    // Mimic user selecting a different counterparty type. useWatch will re-render
    // the drawer; a buggy reset effect must not snap the value back to default.
    await act(async () => {
      formRef!.setFieldsValue({ counterpartyType: CounterpartyType.SUPPLIER })
      // Flush the re-render + useEffect that may reset fields from unstable initialValues.
      await Promise.resolve()
      await Promise.resolve()
    })

    // Assert after effects have had a chance to run — not merely that SUPPLIER was
    // briefly visible before a reset.
    expect(formRef!.getFieldValue('counterpartyType')).toBe(CounterpartyType.SUPPLIER)
  })
})
