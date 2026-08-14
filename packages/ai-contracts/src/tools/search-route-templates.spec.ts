import {
  SEARCH_ROUTE_TEMPLATES_LIMIT,
  SEARCH_ROUTE_TEMPLATES_TOOL,
  searchRouteTemplatesInputSchema,
  searchRouteTemplatesModelInputSchema,
  searchRouteTemplatesOutputSchema,
} from './search-route-templates'
import { AI_CREATE_TOOL_NAMES, capabilitiesForPendingReview } from './review-package'

describe('searchRouteTemplates contract v1', () => {
  it('declares the versioned tool among AI create capabilities', () => {
    expect(SEARCH_ROUTE_TEMPLATES_TOOL).toEqual({
      name: 'searchRouteTemplates',
      version: 1,
    })
    expect(AI_CREATE_TOOL_NAMES).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'submitReviewPackage',
      'getMaterialParseResult',
    ])
    expect(SEARCH_ROUTE_TEMPLATES_LIMIT).toBe(5)
  })

  it('keeps search available while a review package is pending', () => {
    expect(capabilitiesForPendingReview(false)).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'submitReviewPackage',
      'getMaterialParseResult',
    ])
    expect(capabilitiesForPendingReview(true)).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'getMaterialParseResult',
    ])
  })

  it('accepts keyword and optional exact dayCount and strips task-foreign fields', () => {
    const parsed = searchRouteTemplatesInputSchema.parse({
      taskId: 'task-1',
      runId: 'run-1',
      keyword: '川西 稻城',
      dayCount: 8,
      organizationId: 'should-be-stripped',
      limit: 99,
    })

    expect(parsed).toEqual({
      taskId: 'task-1',
      runId: 'run-1',
      keyword: '川西 稻城',
      dayCount: 8,
    })
    expect(parsed).not.toHaveProperty('limit')
    expect(parsed).not.toHaveProperty('organizationId')
  })

  it('allows empty keyword and missing dayCount so the tool can return an empty set', () => {
    expect(
      searchRouteTemplatesInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
      }),
    ).toEqual({
      taskId: 'task-1',
      runId: 'run-1',
    })
  })

  it('does not let the model supply task ids or a page size', () => {
    const parsed = searchRouteTemplatesModelInputSchema.parse({
      keyword: '川西',
      dayCount: 8,
      taskId: 'model-supplied',
      runId: 'model-supplied',
      limit: 20,
    })

    expect(parsed).toEqual({
      keyword: '川西',
      dayCount: 8,
    })
  })

  it('returns at most five items with stable identity, usage, and structured reasons', () => {
    const parsed = searchRouteTemplatesOutputSchema.parse({
      items: [
        {
          id: 'tpl-1',
          name: '川西稻城线',
          defaultDayCount: 8,
          usageCount: 12,
          updatedAt: '2026-08-01T00:00:00.000Z',
          matchReasons: [
            { code: 'name_contains_token', token: '川西' },
            {
              code: 'segment_name_contains_token',
              token: '稻城',
              segmentName: '稻城亚丁',
            },
            { code: 'day_count_equals', dayCount: 8 },
          ],
        },
      ],
      prismaRows: [],
      organizationId: 'org-secret',
    })

    expect(parsed).toEqual({
      items: [
        {
          id: 'tpl-1',
          name: '川西稻城线',
          defaultDayCount: 8,
          usageCount: 12,
          updatedAt: '2026-08-01T00:00:00.000Z',
          matchReasons: [
            { code: 'name_contains_token', token: '川西' },
            {
              code: 'segment_name_contains_token',
              token: '稻城',
              segmentName: '稻城亚丁',
            },
            { code: 'day_count_equals', dayCount: 8 },
          ],
        },
      ],
    })
    expect(parsed).not.toHaveProperty('prismaRows')
    expect(parsed).not.toHaveProperty('organizationId')
  })

  it('rejects invented reason codes and more than five items', () => {
    expect(() =>
      searchRouteTemplatesOutputSchema.parse({
        items: [
          {
            id: 'tpl-1',
            name: '川西线',
            defaultDayCount: 8,
            usageCount: 0,
            updatedAt: '2026-08-01T00:00:00.000Z',
            matchReasons: [{ code: 'semantic_similarity', score: 0.9 }],
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      searchRouteTemplatesOutputSchema.parse({
        items: Array.from({ length: 6 }, (_, index) => ({
          id: `tpl-${index}`,
          name: `线${index}`,
          defaultDayCount: 5,
          usageCount: 0,
          updatedAt: '2026-08-01T00:00:00.000Z',
          matchReasons: [{ code: 'day_count_equals', dayCount: 5 }],
        })),
      }),
    ).toThrow()
  })
})
