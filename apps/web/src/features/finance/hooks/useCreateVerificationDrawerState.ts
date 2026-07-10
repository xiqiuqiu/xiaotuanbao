import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { FormInstance } from 'antd/es/form'
import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  listFinanceDepartureOptions,
  listPayables,
  listReceivables,
  listTransactions,
} from '@/services/finance.service'
import { Form } from 'antd'
import {
  filterCandidateSchedules,
  filterCandidateTransactions,
  matchesCounterparty,
} from '../utils/verification-candidates'
import {
  getInitialVerificationValues,
  transactionAndScheduleToFormValues,
  type CreateVerificationFormValues,
  type VerificationDirection,
} from '../utils/verification-form'
import { yuanToCents } from '../utils/finance-form'

type UseCreateVerificationDrawerStateOptions = {
  open: boolean
  form: FormInstance<CreateVerificationFormValues>
  lockedDepartureId?: string
  initialTransaction?: FinanceTransactionSummary
  initialSchedule?: PaymentScheduleSummary
}

export function useCreateVerificationDrawerState({
  open,
  form,
  lockedDepartureId,
  initialTransaction,
  initialSchedule,
}: UseCreateVerificationDrawerStateOptions) {
  const [transactionSearchKeyword, setTransactionSearchKeyword] = useState('')
  const [scheduleSearchKeyword, setScheduleSearchKeyword] = useState('')

  const direction = Form.useWatch('direction', form)
  const departureId = Form.useWatch('departureId', form)
  const counterpartyKeyword = Form.useWatch('counterpartyKeyword', form)
  const selectedTransactionId = Form.useWatch('transactionId', form)
  const selectedScheduleId = Form.useWatch('paymentScheduleId', form)
  const amountYuan = Form.useWatch('amountYuan', form)
  const verificationDate = Form.useWatch('verificationDate', form)

  const effectiveDepartureId = lockedDepartureId ?? departureId
  const directionLocked = Boolean(initialTransaction || initialSchedule)

  const initialValues = useMemo(
    () =>
      getInitialVerificationValues({
        lockedDepartureId,
        initialTransaction,
        initialSchedule,
      }),
    [initialSchedule, initialTransaction, lockedDepartureId],
  )

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'create-verification'],
    queryFn: listFinanceDepartureOptions,
    enabled: open,
  })

  const departureMap = useMemo(() => {
    const map = new Map<string, { departureNo: string; name: string }>()
    for (const departure of departuresResult ?? []) {
      map.set(departure.id, { departureNo: departure.departureNo, name: departure.name })
    }
    return map
  }, [departuresResult])

  const departureOptions = useMemo(
    () =>
      (departuresResult ?? []).map((departure) => ({
        value: departure.id,
        label: `${departure.departureNo} · ${departure.name}`,
      })),
    [departuresResult],
  )

  const {
    data: transactionsResult,
    isLoading: transactionsLoading,
    isError: transactionsError,
  } = useQuery({
    queryKey: ['finance-transactions', 'create-verification', effectiveDepartureId],
    queryFn: () =>
      listTransactions({
        departureId: effectiveDepartureId,
        pageSize: 100,
      }),
    enabled: open && Boolean(direction),
  })

  const isReceivable = direction === 'receivable'

  const {
    data: schedulesResult,
    isLoading: schedulesLoading,
    isError: schedulesError,
  } = useQuery({
    queryKey: [
      isReceivable ? 'finance-receivables' : 'finance-payables',
      'create-verification',
      effectiveDepartureId,
      selectedTransactionId,
    ],
    queryFn: () =>
      (isReceivable ? listReceivables : listPayables)({
        departureId: effectiveDepartureId,
        pageSize: 100,
      }),
    enabled: open && Boolean(direction) && Boolean(selectedTransactionId),
  })

  const candidateTransactions = useMemo(() => {
    if (!direction) {
      return []
    }

    return filterCandidateTransactions({
      transactions: transactionsResult?.items ?? [],
      direction,
      departureId: effectiveDepartureId,
      counterpartyKeyword,
      searchKeyword: transactionSearchKeyword,
      departureMap,
    })
  }, [
    counterpartyKeyword,
    departureMap,
    direction,
    effectiveDepartureId,
    transactionSearchKeyword,
    transactionsResult?.items,
  ])

  const selectedTransaction = useMemo(() => {
    const fromCandidates = candidateTransactions.find((item) => item.id === selectedTransactionId)
    if (fromCandidates) {
      return fromCandidates
    }
    return (transactionsResult?.items ?? []).find((item) => item.id === selectedTransactionId) ?? null
  }, [candidateTransactions, selectedTransactionId, transactionsResult?.items])

  const candidateSchedules = useMemo(() => {
    if (!selectedTransaction) {
      return []
    }

    return filterCandidateSchedules({
      schedules: schedulesResult?.items ?? [],
      selectedTransaction,
      departureId: effectiveDepartureId,
      searchKeyword: scheduleSearchKeyword,
      departureMap,
    })
  }, [
    departureMap,
    effectiveDepartureId,
    scheduleSearchKeyword,
    schedulesResult?.items,
    selectedTransaction,
  ])

  const selectedSchedule = useMemo(() => {
    if (initialSchedule && initialSchedule.id === selectedScheduleId) {
      return initialSchedule
    }
    const fromCandidates = candidateSchedules.find((item) => item.id === selectedScheduleId)
    if (fromCandidates) {
      return fromCandidates
    }
    return (schedulesResult?.items ?? []).find((item) => item.id === selectedScheduleId) ?? null
  }, [candidateSchedules, initialSchedule, schedulesResult?.items, selectedScheduleId])

  const postTransactionBalanceCents =
    selectedTransaction && typeof amountYuan === 'number'
      ? Math.max(selectedTransaction.unallocatedAmountCents - yuanToCents(amountYuan), 0)
      : (selectedTransaction?.unallocatedAmountCents ?? 0)

  const postUnsettledCents =
    selectedSchedule && typeof amountYuan === 'number'
      ? Math.max(selectedSchedule.unsettledAmountCents - yuanToCents(amountYuan), 0)
      : (selectedSchedule?.unsettledAmountCents ?? 0)

  const handleDirectionChange = (nextDirection: VerificationDirection) => {
    form.setFieldsValue({
      direction: nextDirection,
      transactionId: '',
      paymentScheduleId: '',
      amountYuan: 0,
    })
    setTransactionSearchKeyword('')
    setScheduleSearchKeyword('')
  }

  const handleSelectTransaction = (transaction: FinanceTransactionSummary) => {
    if (initialSchedule) {
      form.setFieldsValue({
        transactionId: transaction.id,
        amountYuan: 0,
      })
    } else {
      form.setFieldsValue({
        transactionId: transaction.id,
        paymentScheduleId: '',
        amountYuan: 0,
      })
    }
    setScheduleSearchKeyword('')
  }

  const handleClearTransaction = () => {
    form.setFieldsValue({
      transactionId: '',
      paymentScheduleId: '',
      amountYuan: 0,
    })
    setScheduleSearchKeyword('')
  }

  const handleSelectSchedule = (schedule: PaymentScheduleSummary) => {
    if (!selectedTransaction) {
      return
    }
    if (matchesCounterparty(selectedTransaction, schedule)) {
      form.setFieldsValue(transactionAndScheduleToFormValues(selectedTransaction, schedule))
      return
    }
    form.setFieldsValue({
      paymentScheduleId: schedule.id,
      amountYuan: 0,
    })
  }

  const submitDisabled =
    !selectedTransaction ||
    !selectedSchedule ||
    amountYuan == null ||
    amountYuan <= 0 ||
    !verificationDate

  return {
    direction,
    directionLocked,
    initialValues,
    departureMap,
    departureOptions,
    lockedDepartureId,
    transactionSearchKeyword,
    setTransactionSearchKeyword,
    scheduleSearchKeyword,
    setScheduleSearchKeyword,
    transactionsLoading,
    transactionsError,
    schedulesLoading,
    schedulesError,
    candidateTransactions,
    candidateSchedules,
    selectedTransaction,
    selectedSchedule,
    selectedTransactionId,
    selectedScheduleId,
    amountYuan,
    postTransactionBalanceCents,
    postUnsettledCents,
    handleDirectionChange,
    handleSelectTransaction,
    handleClearTransaction,
    handleSelectSchedule,
    submitDisabled,
  }
}
