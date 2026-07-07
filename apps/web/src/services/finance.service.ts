import { request } from '@/lib/request'
import type {
  ConfirmCollectionDto,
  ConfirmPaymentDto,
  CreateFinanceTransactionDto,
  CreateFinanceVerificationDto,
  CreatePaymentScheduleDto,
  FinanceTransactionListResult,
  FinanceTransactionSummary,
  FinanceVerificationListResult,
  FinanceVerificationSummary,
  LinkTransactionDto,
  PaymentScheduleListResult,
  PaymentScheduleSummary,
  UpdatePaymentScheduleDto,
  VoidFinanceTransactionDto,
} from '@xiaotuanbao/shared'

export interface ListPaymentSchedulesParams {
  departureId?: string
  page?: number
  pageSize?: number
}

export interface ListFinanceTransactionsParams {
  departureId?: string
  page?: number
  pageSize?: number
}

export interface ListFinanceVerificationsParams {
  paymentScheduleId?: string
  transactionId?: string
  page?: number
  pageSize?: number
}

export interface CancelPaymentSchedulePayload {
  cancelReason?: string
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

export async function getReceivable(id: string): Promise<PaymentScheduleSummary> {
  return request.get<PaymentScheduleSummary>(`/finance/receivables/${id}`)
}

export async function getPayable(id: string): Promise<PaymentScheduleSummary> {
  return request.get<PaymentScheduleSummary>(`/finance/payables/${id}`)
}

export async function createReceivable(
  payload: CreatePaymentScheduleDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>('/finance/receivables', payload)
}

export async function createPayable(
  payload: CreatePaymentScheduleDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>('/finance/payables', payload)
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

export async function linkReceivableTransaction(
  id: string,
  payload: LinkTransactionDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(`/finance/receivables/${id}/link-transaction`, payload)
}

export async function linkPayableTransaction(
  id: string,
  payload: LinkTransactionDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(`/finance/payables/${id}/link-transaction`, payload)
}

export async function cancelSchedule(
  id: string,
  payload: CancelPaymentSchedulePayload = {},
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(`/finance/payment-schedules/${id}/cancel`, payload)
}

export async function listTransactions(
  params: ListFinanceTransactionsParams,
): Promise<FinanceTransactionListResult> {
  return request.get<FinanceTransactionListResult>('/finance/transactions', { params })
}

export async function createTransaction(
  payload: CreateFinanceTransactionDto,
): Promise<FinanceTransactionSummary> {
  return request.post<FinanceTransactionSummary>('/finance/transactions', payload)
}

export async function voidTransaction(
  id: string,
  payload: VoidFinanceTransactionDto = {},
): Promise<FinanceTransactionSummary> {
  return request.post<FinanceTransactionSummary>(`/finance/transactions/${id}/void`, payload)
}

export async function listVerifications(
  params: ListFinanceVerificationsParams,
): Promise<FinanceVerificationListResult> {
  return request.get<FinanceVerificationListResult>('/finance/verifications', { params })
}

export async function createVerification(
  payload: CreateFinanceVerificationDto,
): Promise<FinanceVerificationSummary> {
  return request.post<FinanceVerificationSummary>('/finance/verifications', payload)
}

export async function cancelVerification(id: string): Promise<FinanceVerificationSummary> {
  return request.post<FinanceVerificationSummary>(`/finance/verifications/${id}/cancel`)
}
