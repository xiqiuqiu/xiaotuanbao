import { z } from 'zod'

export const SEARCH_ROUTE_TEMPLATES_TOOL = {
  name: 'searchRouteTemplates',
  version: 1,
} as const

export const SEARCH_ROUTE_TEMPLATES_LIMIT = 5

export const ROUTE_TEMPLATE_MATCH_REASON_CODES = [
  'name_contains_token',
  'segment_name_contains_token',
  'destination_contains_token',
  'day_count_equals',
] as const

export const routeTemplateMatchReasonSchema = z.discriminatedUnion('code', [
  z
    .object({
      code: z.literal('name_contains_token'),
      token: z.string().trim().min(1).max(200),
    })
    .strip(),
  z
    .object({
      code: z.literal('segment_name_contains_token'),
      token: z.string().trim().min(1).max(200),
      segmentName: z.string().trim().min(1).max(200),
    })
    .strip(),
  z
    .object({
      code: z.literal('destination_contains_token'),
      token: z.string().trim().min(1).max(200),
      destination: z.string().trim().min(1).max(200),
    })
    .strip(),
  z
    .object({
      code: z.literal('day_count_equals'),
      dayCount: z.number().int().min(1).max(999),
    })
    .strip(),
])

export const searchRouteTemplatesItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    defaultDayCount: z.number().int().min(1).max(999),
    usageCount: z.number().int().min(0),
    updatedAt: z.string().min(1),
    matchReasons: z.array(routeTemplateMatchReasonSchema).min(1),
  })
  .strip()

export const searchRouteTemplatesInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    keyword: z.string().max(200).optional(),
    dayCount: z.number().int().min(1).max(999).optional(),
  })
  .strip()

export const searchRouteTemplatesModelInputSchema = z
  .object({
    keyword: z.string().max(200).optional(),
    dayCount: z.number().int().min(1).max(999).optional(),
  })
  .strip()

export const searchRouteTemplatesOutputSchema = z
  .object({
    items: z.array(searchRouteTemplatesItemSchema).max(SEARCH_ROUTE_TEMPLATES_LIMIT),
  })
  .strip()

export type RouteTemplateMatchReason = z.infer<typeof routeTemplateMatchReasonSchema>
export type SearchRouteTemplatesItem = z.infer<typeof searchRouteTemplatesItemSchema>
export type SearchRouteTemplatesInput = z.infer<typeof searchRouteTemplatesInputSchema>
export type SearchRouteTemplatesModelInput = z.infer<typeof searchRouteTemplatesModelInputSchema>
export type SearchRouteTemplatesOutput = z.infer<typeof searchRouteTemplatesOutputSchema>
