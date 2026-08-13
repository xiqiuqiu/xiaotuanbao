import {
  SEARCH_ROUTE_TEMPLATES_LIMIT,
  type RouteTemplateMatchReason,
  type SearchRouteTemplatesItem,
} from '@xiaotuanbao/ai-contracts'

export interface RouteTemplateSearchSegment {
  sortOrder: number
  name: string
  destination?: string | null
  notes?: string | null
}

export interface RouteTemplateSearchRecord {
  id: string
  name: string
  defaultDayCount: number
  usageCount: number
  updatedAt: string | Date
  notes?: string | null
  segments: RouteTemplateSearchSegment[]
}

export interface RouteTemplateSearchQuery {
  keyword?: string
  dayCount?: number
}

function tokenize(keyword: string | undefined): string[] {
  return (keyword ?? '')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
}

function containsToken(haystack: string | null | undefined, token: string): boolean {
  if (!haystack) return false
  return haystack.toLowerCase().includes(token.toLowerCase())
}

function reasonForToken(
  template: RouteTemplateSearchRecord,
  token: string,
): RouteTemplateMatchReason | null {
  if (containsToken(template.name, token)) {
    return { code: 'name_contains_token', token }
  }

  const segments = [...template.segments].sort((left, right) => left.sortOrder - right.sortOrder)
  const segmentName = segments.find((segment) => containsToken(segment.name, token))
  if (segmentName) {
    return {
      code: 'segment_name_contains_token',
      token,
      segmentName: segmentName.name,
    }
  }

  const destination = segments.find((segment) => containsToken(segment.destination, token))
  if (destination?.destination) {
    return {
      code: 'destination_contains_token',
      token,
      destination: destination.destination,
    }
  }

  return null
}

function compareItems(
  left: RouteTemplateSearchRecord,
  right: RouteTemplateSearchRecord,
): number {
  if (right.usageCount !== left.usageCount) return right.usageCount - left.usageCount
  const leftUpdated = new Date(left.updatedAt).getTime()
  const rightUpdated = new Date(right.updatedAt).getTime()
  if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

export function searchRouteTemplates(
  templates: readonly RouteTemplateSearchRecord[],
  query: RouteTemplateSearchQuery,
): SearchRouteTemplatesItem[] {
  const tokens = tokenize(query.keyword)
  const dayCount = query.dayCount
  if (tokens.length === 0 && dayCount == null) {
    return []
  }

  const matched = templates.filter((template) => {
    if (dayCount != null && template.defaultDayCount !== dayCount) {
      return false
    }
    return tokens.every((token) => reasonForToken(template, token) !== null)
  })

  return [...matched]
    .sort(compareItems)
    .slice(0, SEARCH_ROUTE_TEMPLATES_LIMIT)
    .map((template) => {
      const matchReasons: RouteTemplateMatchReason[] = tokens
        .map((token) => reasonForToken(template, token))
        .filter((reason): reason is RouteTemplateMatchReason => reason !== null)
      if (dayCount != null) {
        matchReasons.push({ code: 'day_count_equals', dayCount })
      }
      return {
        id: template.id,
        name: template.name,
        defaultDayCount: template.defaultDayCount,
        usageCount: template.usageCount,
        updatedAt: toIso(template.updatedAt),
        matchReasons,
      }
    })
}
