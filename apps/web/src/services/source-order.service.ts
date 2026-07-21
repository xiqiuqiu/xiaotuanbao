import { downloadBinary, request, triggerBrowserDownload } from '@/lib/request'
import type {
  CreateSourceOrderDto,
  CreateSourceOrderGuestDto,
  BatchFinanceGenerationResult,
  GenerateReceivablesResult,
  GuestCollectionChangeImpact,
  PartnerReconciliationStatementSnapshot,
  PartnerSourceOrderListResult,
  PendingReceivableSourceOrderListResult,
  SourceOrderGuestSummary,
  SourceOrderListResult,
  SourceOrderSummary,
  UpdateSourceOrderDto,
  UpdateSourceOrderGuestDto,
} from '@/types/api'
import type { SourceOrderCollectionMode } from '@xiaotuanbao/shared'

export interface ListSourceOrdersParams {
  partnerId?: string
  collectionMode?: SourceOrderCollectionMode
  hasDiscount?: 'all' | 'yes' | 'no'
  keyword?: string
}

export async function listPendingReceivableSourceOrders(params: {
  receivableGeneration: 'not_generated'
  page?: number
  pageSize?: number
}): Promise<PendingReceivableSourceOrderListResult> {
  return request.get<PendingReceivableSourceOrderListResult>('/source-orders', { params })
}

export async function listSourceOrders(
  departureId: string,
  params: ListSourceOrdersParams = {},
): Promise<SourceOrderListResult> {
  return request.get<SourceOrderListResult>(`/departures/${departureId}/source-orders`, {
    params,
  })
}

export interface ListPartnerSourceOrdersParams {
  departureDateFrom?: string
  departureDateTo?: string
  page?: number
  pageSize?: number
}

/** 合作团单 Tab：按 Partner 跨发团查询客源单（业务事实层）。 */
export async function listPartnerSourceOrders(
  partnerId: string,
  params: ListPartnerSourceOrdersParams = {},
): Promise<PartnerSourceOrderListResult> {
  return request.get<PartnerSourceOrderListResult>(`/partners/${partnerId}/source-orders`, {
    params,
  })
}

export interface ReconciliationStatementPeriod {
  periodStart: string
  periodEnd: string
}

/** 《往来账确认单》JSON 快照（抽屉预览），即时生成不存副本。 */
export async function getPartnerReconciliationStatement(
  partnerId: string,
  period: ReconciliationStatementPeriod,
): Promise<PartnerReconciliationStatementSnapshot> {
  return request.get<PartnerReconciliationStatementSnapshot>(
    `/partners/${partnerId}/reconciliation-statement`,
    { params: period },
  )
}

/** 《往来账确认单》xlsx 下载。 */
export async function downloadPartnerReconciliationStatement(
  partnerId: string,
  period: ReconciliationStatementPeriod,
): Promise<void> {
  const { blob, filename } = await downloadBinary(
    `/partners/${partnerId}/reconciliation-statement.xlsx`,
    { params: period },
  )
  triggerBrowserDownload(blob, filename ?? `往来账确认单_${partnerId}.xlsx`)
}

export async function createSourceOrder(
  departureId: string,
  payload: CreateSourceOrderDto,
): Promise<SourceOrderSummary> {
  return request.post<SourceOrderSummary>(`/departures/${departureId}/source-orders`, payload)
}

export async function getSourceOrder(id: string): Promise<SourceOrderSummary> {
  return request.get<SourceOrderSummary>(`/source-orders/${id}`)
}

export async function updateSourceOrder(
  id: string,
  payload: UpdateSourceOrderDto,
): Promise<SourceOrderSummary> {
  return request.patch<SourceOrderSummary>(`/source-orders/${id}`, payload)
}

export async function getGuestCollectionChangeImpact(
  sourceOrderId: string,
): Promise<GuestCollectionChangeImpact> {
  return request.get<GuestCollectionChangeImpact>(
    `/source-orders/${sourceOrderId}/guest-collection-change-impact`,
  )
}

export async function deleteSourceOrder(id: string): Promise<void> {
  await request.delete(`/source-orders/${id}`)
}

export async function generateReceivables(sourceOrderId: string): Promise<GenerateReceivablesResult> {
  return request.post<GenerateReceivablesResult>(
    `/source-orders/${sourceOrderId}/generate-receivables`,
  )
}

export async function generateReceivablesForDeparture(
  departureId: string,
): Promise<BatchFinanceGenerationResult> {
  return request.post<BatchFinanceGenerationResult>(
    `/departures/${departureId}/generate-receivables`,
  )
}

export async function listSourceOrderGuests(
  sourceOrderId: string,
): Promise<SourceOrderGuestSummary[]> {
  return request.get<SourceOrderGuestSummary[]>(`/source-orders/${sourceOrderId}/guests`)
}

export async function createSourceOrderGuest(
  sourceOrderId: string,
  payload: CreateSourceOrderGuestDto,
): Promise<SourceOrderGuestSummary> {
  return request.post<SourceOrderGuestSummary>(
    `/source-orders/${sourceOrderId}/guests`,
    payload,
  )
}

export async function updateSourceOrderGuest(
  sourceOrderId: string,
  guestId: string,
  payload: UpdateSourceOrderGuestDto,
): Promise<SourceOrderGuestSummary> {
  return request.patch<SourceOrderGuestSummary>(
    `/source-orders/${sourceOrderId}/guests/${guestId}`,
    payload,
  )
}

export async function deleteSourceOrderGuest(
  sourceOrderId: string,
  guestId: string,
): Promise<void> {
  await request.delete(`/source-orders/${sourceOrderId}/guests/${guestId}`)
}
