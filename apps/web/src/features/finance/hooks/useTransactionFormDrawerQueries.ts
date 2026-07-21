import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CounterpartyType,
  TransactionDirection,
  type FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import {
  listDepartureReceivables,
  listFinanceDepartureOptions,
  listFinancePartnerOptions,
  listFinanceSourceOrderOptions,
  listFinanceSupplierOptions,
  listTransactions,
} from '@/services/finance.service'
import { getSourceOrder } from '@/services/source-order.service'
import {
  resolveGuestCollectionAmountSuggestion,
  sumExistingUnallocatedGuestCents,
} from '../utils/transaction-amount-suggestion'

interface UseTransactionFormDrawerQueriesParams {
  open: boolean
  mode: 'create' | 'edit'
  editingTransaction: FinanceTransactionSummary | null
  counterpartyType: CounterpartyType | undefined
  departureId: string | undefined
  direction: TransactionDirection | undefined
  counterpartyId: string | undefined
}

export function useTransactionFormDrawerQueries({
  open,
  mode,
  editingTransaction,
  counterpartyType,
  departureId,
  direction,
  counterpartyId,
}: UseTransactionFormDrawerQueriesParams) {
  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'transaction-form'],
    queryFn: listFinanceDepartureOptions,
    enabled: open,
  })

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'transaction-form-select', departureId],
    queryFn: () => listFinancePartnerOptions(departureId!),
    enabled: open && counterpartyType === CounterpartyType.PARTNER && Boolean(departureId),
  })

  const { data: suppliersResult } = useQuery({
    queryKey: ['suppliers', 'transaction-form-select', departureId],
    queryFn: () => listFinanceSupplierOptions(departureId!),
    enabled: open && counterpartyType === CounterpartyType.SUPPLIER && Boolean(departureId),
  })

  const { data: sourceOrdersResult } = useQuery({
    queryKey: ['source-orders', 'transaction-form-select', departureId],
    queryFn: () => listFinanceSourceOrderOptions(departureId!),
    enabled: open && counterpartyType === CounterpartyType.GUEST && Boolean(departureId),
  })

  const guestSuggestionEnabled =
    open &&
    direction === TransactionDirection.INFLOW &&
    counterpartyType === CounterpartyType.GUEST &&
    Boolean(departureId) &&
    Boolean(counterpartyId)

  const { data: amountSuggestion } = useQuery({
    queryKey: [
      'transaction-form',
      'guest-amount-suggestion',
      departureId,
      counterpartyId,
      editingTransaction?.id,
    ],
    queryFn: async ({ signal }) => {
      const [receivables, sourceOrder, transactions] = await Promise.all([
        listDepartureReceivables(
          departureId!,
          {
            counterpartyType: CounterpartyType.GUEST,
            counterpartyId: counterpartyId!,
            pageSize: 20,
          },
          signal,
        ),
        getSourceOrder(counterpartyId!, signal),
        listTransactions(
          {
            departureId: departureId!,
            status: 'normal',
            pageSize: 100,
          },
          signal,
        ),
      ])
      const existingUnallocatedGuestCents = sumExistingUnallocatedGuestCents({
        transactions: transactions.items,
        sourceOrderId: counterpartyId!,
        excludeTransactionId: editingTransaction?.id,
      })
      return resolveGuestCollectionAmountSuggestion({
        schedules: receivables.items,
        guestCollectCents: sourceOrder.guestCollectCents,
        existingUnallocatedGuestCents,
      })
    },
    enabled: guestSuggestionEnabled,
  })

  const departureOptions =
    departuresResult?.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  const partnerOptions = useMemo(() => {
    const options =
      partnersResult?.map((partner) => ({
        value: partner.id,
        label: partner.name,
      })) ?? []
    if (
      mode === 'edit' &&
      editingTransaction?.counterpartyType === CounterpartyType.PARTNER &&
      editingTransaction.counterpartyId &&
      !options.some((option) => option.value === editingTransaction.counterpartyId)
    ) {
      return [
        {
          value: editingTransaction.counterpartyId,
          label: editingTransaction.counterpartyName ?? editingTransaction.counterpartyId,
        },
        ...options,
      ]
    }
    return options
  }, [partnersResult, mode, editingTransaction])

  const supplierOptions = useMemo(() => {
    const options =
      suppliersResult?.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
      })) ?? []
    if (
      mode === 'edit' &&
      editingTransaction?.counterpartyType === CounterpartyType.SUPPLIER &&
      editingTransaction.counterpartyId &&
      !options.some((option) => option.value === editingTransaction.counterpartyId)
    ) {
      return [
        {
          value: editingTransaction.counterpartyId,
          label: editingTransaction.counterpartyName ?? editingTransaction.counterpartyId,
        },
        ...options,
      ]
    }
    return options
  }, [suppliersResult, mode, editingTransaction])

  const sourceOrderOptions =
    sourceOrdersResult?.map((sourceOrder) => ({
      value: sourceOrder.id,
      label: sourceOrder.displayName,
    })) ?? []

  return {
    amountSuggestion,
    departureOptions,
    guestSuggestionEnabled,
    partnerOptions,
    partnersResult,
    sourceOrderOptions,
    sourceOrdersResult,
    supplierOptions,
    suppliersResult,
  }
}
