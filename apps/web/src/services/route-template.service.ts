import { request } from '@/lib/request'
import type {
  CreateRouteTemplateFromDepartureDto,
  RouteTemplateCardSummary,
  RouteTemplateDetailSummary,
} from '@/types/api'

export async function listRouteTemplates(
  keyword?: string,
): Promise<RouteTemplateCardSummary[]> {
  return request.get<RouteTemplateCardSummary[]>('/route-templates', {
    params: keyword ? { keyword } : undefined,
  })
}

export async function getRouteTemplate(
  id: string,
  signal?: AbortSignal,
): Promise<RouteTemplateDetailSummary> {
  return request.get<RouteTemplateDetailSummary>(`/route-templates/${id}`, { signal })
}

export async function saveRouteTemplateFromDeparture(
  departureId: string,
  payload: CreateRouteTemplateFromDepartureDto,
): Promise<RouteTemplateDetailSummary> {
  return request.post<RouteTemplateDetailSummary>(
    `/route-templates/from-departure/${departureId}`,
    payload,
  )
}

export async function deleteRouteTemplate(id: string): Promise<{ success: true }> {
  return request.delete<{ success: true }>(`/route-templates/${id}`)
}
