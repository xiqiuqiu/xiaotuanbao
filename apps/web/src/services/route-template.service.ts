import { request } from '@/lib/request'
import type { RouteTemplateCardSummary, RouteTemplateDetailSummary } from '@/types/api'

export async function listRouteTemplates(
  keyword?: string,
): Promise<RouteTemplateCardSummary[]> {
  return request.get<RouteTemplateCardSummary[]>('/route-templates', {
    params: keyword ? { keyword } : undefined,
  })
}

export async function getRouteTemplate(id: string): Promise<RouteTemplateDetailSummary> {
  return request.get<RouteTemplateDetailSummary>(`/route-templates/${id}`)
}
