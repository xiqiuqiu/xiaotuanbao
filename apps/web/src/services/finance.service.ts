import { request } from '@/lib/request'
import type {
  AdjustPaymentScheduleAmountDto,
  ConfirmCollectionDto,
  ConfirmPaymentDto,
  CreateFinanceTransactionDto,
  CancelFinanceVerificationDto,
  CreateFinanceVerificationDto,
  FinanceTransactionListResult,
  FinanceTransactionSummary,
  FinanceTransactionDetail,
  FinanceVerificationDetail,
  FinanceVerificationListResult,
  FinanceVerificationSummary,
  PaymentScheduleDetail,
  PaymentScheduleCounterpartyOption,
  PaymentScheduleListResult,
  PaymentScheduleSummary,
  ReopenPaymentScheduleDto,
  UpdateFinanceTransactionDto,
  UpdatePaymentScheduleDto,
  VoidFinanceTransactionDto,
  DepartureStatus,
} from '@xiaotuanbao/shared'

export interface FinanceDepartureOption {
  id: string
  departureNo: string
  name: string
  status: DepartureStatus
}

export interface FinanceDirectoryOption {
  id: string
  name: string
}

export interface FinanceSourceOrderOption {
  id: string
  displayName: string
}

export interface ListPaymentSchedulesParams {
  departureId?: string
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
  page?: number
  pageSize?: number
}

export interface ListFinanceTransactionsParams {
  departureId?: string
  dateStart?: string
  dateEnd?: string
  direction?: string
  partnerKeyword?: string
  transactionNo?: string
  writeoffStatus?: string
  status?: string
  page?: number
  pageSize?: number
}

export interface ListFinanceVerificationsParams {
  verificationDateStart?: string
  verificationDateEnd?: string
  direction?: string
  status?: string
  transactionNo?: string
  transactionNoMatch?: 'exact' | 'contains'
  scheduleNo?: string
  scheduleNoMatch?: 'exact' | 'contains'
  departureKeyword?: string
  departureId?: string
  page?: number
  pageSize?: number
}

export interface CancelPaymentSchedulePayload {
  closeDisposition: string
  cancelReason: string
}

export async function listFinanceDepartureOptions(): Promise<FinanceDepartureOption[]> {
  return request.get<FinanceDepartureOption[]>('/finance/departure-options')
}

export async function listFinancePartnerOptions(): Promise<FinanceDirectoryOption[]> {
  return request.get<FinanceDirectoryOption[]>('/finance/partner-options')
}

export async function listFinanceSupplierOptions(): Promise<FinanceDirectoryOption[]> {
  return request.get<FinanceDirectoryOption[]>('/finance/supplier-options')
}

export async function listFinanceSourceOrderOptions(
  departureId: string,
): Promise<FinanceSourceOrderOption[]> {
  return request.get<FinanceSourceOrderOption[]>('/finance/source-order-options', {
    params: { departureId },
  })
}

export async function listReceivables(
  params: ListPaymentSchedulesParams,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>('/finance/receivables', { params })
}

export async function listPayables(
  params: ListPaymentSchedulesParams,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>('/finance/payables', { params })
}

export async function getReceivable(id: string): Promise<PaymentScheduleDetail> {
  return request.get<PaymentScheduleDetail>(`/finance/receivables/${id}`)
}

export async function getPayable(id: string): Promise<PaymentScheduleDetail> {
  return request.get<PaymentScheduleDetail>(`/finance/payables/${id}`)
}

export async function updateReceivable(
  id: string,
  payload: UpdatePaymentScheduleDto,
): Promise<PaymentScheduleSummary> {
  return request.patch<PaymentScheduleSummary>(`/finance/receivables/${id}`, payload)
}

export async function updatePayable(
  id: string,
  payload: UpdatePaymentScheduleDto,
): Promise<PaymentScheduleSummary> {
  return request.patch<PaymentScheduleSummary>(`/finance/payables/${id}`, payload)
}

export async function confirmCollection(
  id: string,
  payload: ConfirmCollectionDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(`/finance/receivables/${id}/confirm-collection`, payload)
}

export async function confirmPayment(
  id: string,
  payload: ConfirmPaymentDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(`/finance/payables/${id}/confirm-payment`, payload)
}

export async function cancelSchedule(
  id: string,
  payload: CancelPaymentSchedulePayload,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(`/finance/payment-schedules/${id}/cancel`, payload)
}

export async function reopenSchedule(
  id: string,
  payload: ReopenPaymentScheduleDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(`/finance/payment-schedules/${id}/reopen`, payload)
}

export async function adjustScheduleAmount(
  id: string,
  payload: AdjustPaymentScheduleAmountDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(
    `/finance/payment-schedules/${id}/adjust-amount`,
    payload,
  )
}

export async function listTransactions(
  params: ListFinanceTransactionsParams,
): Promise<FinanceTransactionListResult> {
  return request.get<FinanceTransactionListResult>('/finance/transactions', { params })
}

export async function getTransaction(id: string): Promise<FinanceTransactionDetail> {
  return request.get<FinanceTransactionDetail>(`/finance/transactions/${id}`)
}

export async function createTransaction(
  payload: CreateFinanceTransactionDto,
): Promise<FinanceTransactionSummary> {
  return request.post<FinanceTransactionSummary>('/finance/transactions', payload)
}

export async function updateTransaction(
  id: string,
  payload: UpdateFinanceTransactionDto,
): Promise<FinanceTransactionSummary> {
  return request.put<FinanceTransactionSummary>(`/finance/transactions/${id}`, payload)
}

export async function voidTransaction(
  id: string,
  payload: VoidFinanceTransactionDto,
): Promise<FinanceTransactionSummary> {
  return request.post<FinanceTransactionSummary>(`/finance/transactions/${id}/void`, payload)
}

export async function listVerifications(
  params: ListFinanceVerificationsParams,
): Promise<FinanceVerificationListResult> {
  return request.get<FinanceVerificationListResult>('/finance/verifications', { params })
}

export async function getVerification(id: string): Promise<FinanceVerificationDetail> {
  return request.get<FinanceVerificationDetail>(`/finance/verifications/${id}`)
}

export async function listDepartureReceivables(
  departureId: string,
  params: Omit<ListPaymentSchedulesParams, 'departureId'> = {},
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>(`/departures/${departureId}/receivables`, {
    params,
  })
}

export async function listDeparturePayables(
  departureId: string,
  params: Omit<ListPaymentSchedulesParams, 'departureId'> = {},
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>(`/departures/${departureId}/payables`, {
    params,
  })
}

export async function listDepartureReceivableCounterparties(
  departureId: string,
): Promise<PaymentScheduleCounterpartyOption[]> {
  return request.get<PaymentScheduleCounterpartyOption[]>(
    `/departures/${departureId}/receivables/counterparties`,
  )
}

export async function listDeparturePayableCounterparties(
  departureId: string,
): Promise<PaymentScheduleCounterpartyOption[]> {
  return request.get<PaymentScheduleCounterpartyOption[]>(
    `/departures/${departureId}/payables/counterparties`,
  )
}

export async function listDepartureVerifications(
  departureId: string,
  params: Omit<ListFinanceVerificationsParams, 'departureId'> = {},
): Promise<FinanceVerificationListResult> {
  return request.get<FinanceVerificationListResult>(
    `/departures/${departureId}/verifications`,
    { params },
  )
}

export async function createVerification(
  payload: CreateFinanceVerificationDto,
): Promise<FinanceVerificationSummary> {
  return request.post<FinanceVerificationSummary>('/finance/verifications', payload)
}

export async function cancelVerification(
  id: string,
  payload: CancelFinanceVerificationDto,
): Promise<FinanceVerificationSummary> {
  return request.post<FinanceVerificationSummary>(`/finance/verifications/${id}/cancel`, payload)
}
