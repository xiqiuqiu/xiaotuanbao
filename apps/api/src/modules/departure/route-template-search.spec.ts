import { SEARCH_ROUTE_TEMPLATES_LIMIT } from '@xiaotuanbao/ai-contracts'
import { searchRouteTemplates } from './route-template-search'

function template(overrides: {
  id: string
  name: string
  defaultDayCount: number
  usageCount?: number
  updatedAt?: string
  notes?: string | null
  segments?: Array<{
    sortOrder: number
    name: string
    destination?: string | null
    notes?: string | null
  }>
}) {
  return {
    usageCount: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
    notes: '内部备注勿搜',
    segments: [],
    ...overrides,
  }
}

describe('searchRouteTemplates matcher', () => {
  const templates = [
    template({
      id: 'tpl-notes-only',
      name: '青海线',
      defaultDayCount: 6,
      notes: '川西稻城备忘',
      segments: [{ sortOrder: 1, name: '西宁', destination: '青海湖', notes: '川西' }],
    }),
    template({
      id: 'tpl-west',
      name: '川西稻城线',
      defaultDayCount: 8,
      usageCount: 3,
      updatedAt: '2026-08-02T00:00:00.000Z',
      segments: [
        { sortOrder: 1, name: '成都出发', destination: '成都' },
        { sortOrder: 2, name: '稻城亚丁', destination: '亚丁' },
      ],
    }),
    template({
      id: 'tpl-west-old',
      name: '川西线',
      defaultDayCount: 8,
      usageCount: 3,
      updatedAt: '2026-07-01T00:00:00.000Z',
      segments: [{ sortOrder: 1, name: '康定', destination: '康定' }],
    }),
    template({
      id: 'tpl-west-low',
      name: '川西小环线',
      defaultDayCount: 5,
      usageCount: 1,
      segments: [{ sortOrder: 1, name: '四姑娘山', destination: '日隆' }],
    }),
    template({
      id: 'tpl-a',
      name: '新疆线',
      defaultDayCount: 10,
      usageCount: 9,
    }),
    template({
      id: 'tpl-b',
      name: '云南线',
      defaultDayCount: 10,
      usageCount: 9,
      updatedAt: '2026-08-10T00:00:00.000Z',
    }),
    template({
      id: 'tpl-c',
      name: '广西线',
      defaultDayCount: 10,
      usageCount: 9,
      updatedAt: '2026-08-10T00:00:00.000Z',
    }),
    template({
      id: 'tpl-d',
      name: '湖南线',
      defaultDayCount: 10,
      usageCount: 2,
    }),
    template({
      id: 'tpl-e',
      name: '海南线',
      defaultDayCount: 10,
      usageCount: 2,
    }),
    template({
      id: 'tpl-f',
      name: '东北线',
      defaultDayCount: 10,
      usageCount: 2,
    }),
  ]

  it('returns an empty set when keyword and dayCount are both blank', () => {
    expect(searchRouteTemplates(templates, {})).toEqual([])
    expect(searchRouteTemplates(templates, { keyword: '   ' })).toEqual([])
  })

  it('matches blank-tokenized AND across name, segment name and destination, not notes', () => {
    const byNameTokens = searchRouteTemplates(templates, { keyword: '川西 稻城' })
    expect(byNameTokens.map((item) => item.id)).toEqual(['tpl-west'])

    const items = searchRouteTemplates(templates, { keyword: '川西 亚丁' })
    expect(items.map((item) => item.id)).toEqual(['tpl-west'])
    expect(items[0]?.matchReasons).toEqual([
      { code: 'name_contains_token', token: '川西' },
      { code: 'segment_name_contains_token', token: '亚丁', segmentName: '稻城亚丁' },
    ])
  })

  it('filters by exact defaultDayCount and keeps a stable usage/updatedAt/id order', () => {
    const byDays = searchRouteTemplates(templates, { dayCount: 8 })
    expect(byDays.map((item) => item.id)).toEqual(['tpl-west', 'tpl-west-old'])
    expect(byDays[0]?.matchReasons).toEqual([{ code: 'day_count_equals', dayCount: 8 }])

    const byTen = searchRouteTemplates(templates, { dayCount: 10 })
    expect(byTen).toHaveLength(SEARCH_ROUTE_TEMPLATES_LIMIT)
    expect(byTen.map((item) => item.id)).toEqual(['tpl-b', 'tpl-c', 'tpl-a', 'tpl-d', 'tpl-e'])
  })

  it('prefers name then segment name then destination when recording reasons', () => {
    const byDestination = searchRouteTemplates(templates, { keyword: '日隆' })
    expect(byDestination.map((item) => item.id)).toEqual(['tpl-west-low'])
    expect(byDestination[0]?.matchReasons).toEqual([
      { code: 'destination_contains_token', token: '日隆', destination: '日隆' },
    ])
  })

  it('combines tokens with an exact day filter and is case-insensitive', () => {
    const items = searchRouteTemplates(templates, { keyword: 'CHUANXI', dayCount: 8 })
    expect(items.map((item) => item.id)).toEqual([])

    const mixed = searchRouteTemplates(
      [
        template({
          id: 'tpl-case',
          name: 'Kanas Trail',
          defaultDayCount: 6,
        }),
      ],
      { keyword: 'kanas' },
    )
    expect(mixed.map((item) => item.id)).toEqual(['tpl-case'])
    expect(mixed[0]?.matchReasons).toEqual([{ code: 'name_contains_token', token: 'kanas' }])
  })
})
