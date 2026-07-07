import { request } from '@/lib/request'
import type {
  CreateSourceOrderDto,
  CreateSourceOrderGuestDto,
  GenerateReceivablesResult,
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

export async function listSourceOrders(
  departureId: string,
  params: ListSourceOrdersParams = {},
): Promise<SourceOrderListResult> {
  return request.get<SourceOrderListResult>(`/departures/${departureId}/source-orders`, {
    params,
  })
}

export async function createSourceOrder(
  departureId: string,
  payload: CreateSourceOrderDto,
): Promise<SourceOrderSummary> {
  return request.post<SourceOrderSummary>(`/departures/${departureId}/source-orders`, payload)
}

export async function updateSourceOrder(
  id: string,
  payload: UpdateSourceOrderDto,
): Promise<SourceOrderSummary> {
  return request.patch<SourceOrderSummary>(`/source-orders/${id}`, payload)
}

export async function deleteSourceOrder(id: string): Promise<void> {
  await request.delete(`/source-orders/${id}`)
}

export async function generateReceivables(sourceOrderId: string): Promise<GenerateReceivablesResult> {
  return request.post<GenerateReceivablesResult>(
    `/source-orders/${sourceOrderId}/generate-receivables`,
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

export async function syncSourceOrderGuestCount(
  sourceOrderId: string,
): Promise<SourceOrderSummary> {
  return request.post<SourceOrderSummary>(`/source-orders/${sourceOrderId}/sync-guest-count`)
}
