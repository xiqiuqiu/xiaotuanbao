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
  PaymentScheduleAggregateResult,
  PaymentScheduleDetail,
  PaymentScheduleListResult,
  PaymentScheduleSummary,
  ReopenPaymentScheduleDto,
  UpdateFinanceTransactionDto,
  UpdatePaymentScheduleDto,
  VoidFinanceTransactionDto,
  VoidResourcePayableDto,
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
  /** 按关联发团出团日期过滤；手工节点随其归属发团落入区间。 */
  departureDateFrom?: string
  departureDateTo?: string
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
  counterpartyKeyword?: string
  status?: 'voided'
  /** 精确匹配节点编号（工作台队列单项下钻）。 */
  scheduleNo?: string
  /** 工作台应收跟进 / 账龄下钻窗口（服务端筛选）。 */
  receivableFollowUp?:
    | 'overdue'
    | 'due_within_7_days'
    | 'aging_1_7'
    | 'aging_8_30'
    | 'aging_over_30'
    | 'follow_up'
  /** 工作台待付款下钻（服务端筛选）。 */
  payableBalance?: 'open_unpaid'
  page?: number
  pageSize?: number
}

export interface PartnerPaymentScheduleSummaryParams {
  departureDateFrom?: string
  departureDateTo?: string
}

export interface ListFinanceTransactionsParams {
  departureId?: string
  dateStart?: string
  dateEnd?: string
  direction?: string
  partnerKeyword?: string
  transactionNo?: string
  writeoffStatus?: string
  pendingSettlement?: '1'
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

export async function listFinancePartnerOptions(
  departureId?: string,
): Promise<FinanceDirectoryOption[]> {
  return request.get<FinanceDirectoryOption[]>('/finance/partner-options', {
    params: departureId ? { departureId } : undefined,
  })
}

export async function listFinanceSupplierOptions(
  departureId?: string,
): Promise<FinanceDirectoryOption[]> {
  return request.get<FinanceDirectoryOption[]>('/finance/supplier-options', {
    params: departureId ? { departureId } : undefined,
  })
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
  signal?: AbortSignal,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>('/finance/receivables', { params, signal })
}

export async function listPayables(
  params: ListPaymentSchedulesParams,
  signal?: AbortSignal,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>('/finance/payables', { params, signal })
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
  signal?: AbortSignal,
): Promise<FinanceTransactionListResult> {
  return request.get<FinanceTransactionListResult>('/finance/transactions', { params, signal })
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

export async function acknowledgeTransactionSourceAmountChange(
  id: string,
): Promise<FinanceTransactionSummary> {
  return request.post<FinanceTransactionSummary>(
    `/finance/transactions/${id}/acknowledge-source-amount-change`,
  )
}

export async function listVerifications(
  params: ListFinanceVerificationsParams,
  signal?: AbortSignal,
): Promise<FinanceVerificationListResult> {
  return request.get<FinanceVerificationListResult>('/finance/verifications', { params, signal })
}

export async function getVerification(id: string): Promise<FinanceVerificationDetail> {
  return request.get<FinanceVerificationDetail>(`/finance/verifications/${id}`)
}

export async function listDepartureReceivables(
  departureId: string,
  params: Omit<ListPaymentSchedulesParams, 'departureId'> = {},
  signal?: AbortSignal,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>(`/departures/${departureId}/receivables`, {
    params,
    signal,
  })
}

export async function voidResourcePayable(
  id: string,
  payload: VoidResourcePayableDto,
): Promise<PaymentScheduleSummary> {
  return request.post<PaymentScheduleSummary>(
    `/finance/payment-schedules/${id}/void-resource-payable`,
    payload,
  )
}

export async function listDeparturePayables(
  departureId: string,
  params: Omit<ListPaymentSchedulesParams, 'departureId'> = {},
  signal?: AbortSignal,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>(`/departures/${departureId}/payables`, {
    params,
    signal,
  })
}

/** 往来账款 Tab：Partner 维度应收列表（counterpartyId 精确过滤在服务端强制）。 */
export async function listPartnerReceivables(
  partnerId: string,
  params: Omit<ListPaymentSchedulesParams, 'counterpartyType' | 'counterpartyId'> = {},
  signal?: AbortSignal,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>(`/partners/${partnerId}/receivables`, {
    params,
    signal,
  })
}

/** 往来账款 Tab：Partner 维度应付列表（counterpartyId 精确过滤在服务端强制）。 */
export async function listPartnerPayables(
  partnerId: string,
  params: Omit<ListPaymentSchedulesParams, 'counterpartyType' | 'counterpartyId'> = {},
  signal?: AbortSignal,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>(`/partners/${partnerId}/payables`, {
    params,
    signal,
  })
}

/**
 * 往来账款 Tab 汇总卡：direction × sourceType 分组的约定/已核销/未结清合计。
 * 已关闭、已作废节点不计入；出团日期区间与列表同口径。
 */
export async function getPartnerPaymentScheduleSummary(
  partnerId: string,
  params: PartnerPaymentScheduleSummaryParams = {},
  signal?: AbortSignal,
): Promise<PaymentScheduleAggregateResult> {
  return request.get<PaymentScheduleAggregateResult>(
    `/partners/${partnerId}/payment-schedule-summary`,
    { params, signal },
  )
}

/**
 * 往来账款 Tab：Supplier 维度应付列表（counterpartyId 精确过滤在服务端强制）。
 * 供应商结构上只有应付，故无对应应收端点。
 */
export async function listSupplierPayables(
  supplierId: string,
  params: Omit<ListPaymentSchedulesParams, 'counterpartyType' | 'counterpartyId'> = {},
  signal?: AbortSignal,
): Promise<PaymentScheduleListResult> {
  return request.get<PaymentScheduleListResult>(`/suppliers/${supplierId}/payables`, {
    params,
    signal,
  })
}

/**
 * 往来账款 Tab 汇总卡（供应商）：应付约定/已核销/未结清合计。
 * 已关闭、已作废节点不计入；出团日期区间与列表同口径。
 */
export async function getSupplierPaymentScheduleSummary(
  supplierId: string,
  params: PartnerPaymentScheduleSummaryParams = {},
  signal?: AbortSignal,
): Promise<PaymentScheduleAggregateResult> {
  return request.get<PaymentScheduleAggregateResult>(
    `/suppliers/${supplierId}/payment-schedule-summary`,
    { params, signal },
  )
}

export async function listDepartureVerifications(
  departureId: string,
  params: Omit<ListFinanceVerificationsParams, 'departureId'> = {},
  signal?: AbortSignal,
): Promise<FinanceVerificationListResult> {
  return request.get<FinanceVerificationListResult>(
    `/departures/${departureId}/verifications`,
    { params, signal },
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
