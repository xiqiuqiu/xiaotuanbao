import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractFirstPriceCents,
  parseDateRangeFromText,
  parseJiangyoujiDabaWorkbook,
} from './jiangyouji-daba.parser'

const FIXTURE_PATH = join(
  __dirname,
  '../../../../test/fixtures/jiangyouji-daba-sample.xlsx',
)

const EXPECTED_SHEET_NAMES = [
  '北疆大巴纯玩线路',
  '南北疆大巴连线（单卧）',
  '北疆+喀什连线（单卧）',
  '喀什起止大巴、7座拼车',
  '伊宁起止大巴、7座拼车',
]

describe('parseJiangyoujiDabaWorkbook (疆游记大巴 fixture)', () => {
  const fixture = readFileSync(FIXTURE_PATH)

  it('scans all five sheets into import result', async () => {
    const result = await parseJiangyoujiDabaWorkbook(fixture)

    expect(result.sheets).toHaveLength(5)
    expect(result.sheets.map((sheet) => sheet.sheetName)).toEqual(EXPECTED_SHEET_NAMES)
    expect(result.defaultYear).toBe(2026)
    // Slim fixture strips OLE/media; absence must not fail the pipeline.
    expect(result.embeddedOleCount).toBeGreaterThanOrEqual(0)
  })

  it('parses accepted-style line with name, short itinerary, and priced schedules', async () => {
    const result = await parseJiangyoujiDabaWorkbook(fixture)
    const north = result.sheets.find((sheet) => sheet.sheetName === '北疆大巴纯玩线路')
    expect(north).toBeDefined()
    expect(north!.lines.length).toBeGreaterThanOrEqual(8)

    const lineA = north!.lines.find((line) => line.name.includes('A线：天吐喀伊10日'))
    expect(lineA).toMatchObject({
      sheetName: '北疆大巴纯玩线路',
      shortItinerary: expect.stringContaining('D1'),
    })
    expect(lineA!.tags).toEqual(expect.arrayContaining(['经典热卖款']))
    // Feature may be present or empty per template; must not be required.
    expect(lineA!.featuresText === null || lineA!.featuresText.length > 0).toBe(true)
    expect(lineA!.schedules.length).toBeGreaterThanOrEqual(2)

    const june = lineA!.schedules.find((schedule) =>
      schedule.adultPriceText.includes('2780'),
    )
    expect(june).toMatchObject({
      adultPriceCents: 278_000,
      childPriceCents: 148_000,
      singleRoomSupplementCents: 110_000,
      startDate: '2026-05-28',
      endDate: '2026-06-30',
      datesParseable: true,
      priceOnInquiry: false,
    })
    expect(june!.dateRuleText).toContain('天天发团')
  })

  it('keeps unparseable date rule text and marks datesParseable false', () => {
    const parsed = parseDateRangeFromText('每周一、五接站，详见计调', 2026)
    expect(parsed).toEqual({
      startDate: null,
      endDate: null,
      datesParseable: false,
    })
  })

  it('expands multi-tier adult price cell into multiple schedule candidates', async () => {
    const result = await parseJiangyoujiDabaWorkbook(fixture)
    const north = result.sheets.find((sheet) => sheet.sheetName === '北疆大巴纯玩线路')
    const lineC = north!.lines.find((line) => line.name.includes('C线：天吐喀+阿禾8日'))
    expect(lineC).toBeDefined()

    const adultPrices = lineC!.schedules
      .map((schedule) => schedule.adultPriceCents)
      .filter((cents): cents is number => cents != null)
    expect(adultPrices).toEqual(expect.arrayContaining([148_000, 158_000, 168_000, 178_000]))
  })

  it('allows empty features and still yields schedule candidates on short-haul sheets', async () => {
    const result = await parseJiangyoujiDabaWorkbook(fixture)
    const kashi = result.sheets.find((sheet) => sheet.sheetName === '喀什起止大巴、7座拼车')
    expect(kashi!.lines.length).toBeGreaterThanOrEqual(1)
    const first = kashi!.lines[0]!
    expect(first.name.length).toBeGreaterThan(0)
    expect(first.shortItinerary.length).toBeGreaterThan(0)
    expect(first.schedules.some((schedule) => schedule.adultPriceCents != null)).toBe(true)
  })
})

describe('price / date helpers', () => {
  it('extracts yuan prices into cents', () => {
    expect(extractFirstPriceCents('2780元/人')).toBe(278_000)
    expect(extractFirstPriceCents('1480/人')).toBe(148_000)
    expect(extractFirstPriceCents('7月2380 /人')).toBe(238_000)
    expect(extractFirstPriceCents('')).toBeNull()
  })

  it('parses common month ranges with default year', () => {
    expect(parseDateRangeFromText('5月28日-6月30日\n2780元/人', 2026)).toEqual({
      startDate: '2026-05-28',
      endDate: '2026-06-30',
      datesParseable: true,
    })
    expect(parseDateRangeFromText('6月 1480元/人', 2026)).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      datesParseable: true,
    })
  })

  it('rolls end year forward when range crosses year boundary', () => {
    expect(parseDateRangeFromText('12月20日-1月10日', 2026)).toEqual({
      startDate: '2026-12-20',
      endDate: '2027-01-10',
      datesParseable: true,
    })
    expect(parseDateRangeFromText('12月1-1月31', 2026)).toEqual({
      startDate: '2026-12-01',
      endDate: '2027-01-31',
      datesParseable: true,
    })
    expect(parseDateRangeFromText('11月15日-2月28日', 2026)).toEqual({
      startDate: '2026-11-15',
      endDate: '2027-02-28',
      datesParseable: true,
    })
  })
})
