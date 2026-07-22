import ExcelJS from 'exceljs'
import { renderProductSummaryExcel } from './product-summary-exceljs.renderer'
import type { ProductSummaryRow, ProductSummarySnapshot } from './product-export.types'

function row(overrides?: Partial<ProductSummaryRow>): ProductSummaryRow {
  return {
    name: '测试线路',
    tags: ['纯玩'],
    shortItinerary: 'D1 乌鲁木齐',
    featuresText: null,
    bookingNotice: null,
    status: 'on_sale',
    sourceSheetName: null,
    scheduleTitle: '暑期班',
    dateRuleText: '7月每周六',
    startDate: '2026-07-04',
    endDate: '2026-07-11',
    priceOnInquiry: false,
    adultPriceCents: 328000,
    childPriceCents: null,
    singleRoomSupplementCents: null,
    ...overrides,
  }
}

async function readSheetNames(buffer: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook.worksheets.map((sheet) => sheet.name)
}

describe('renderProductSummaryExcel sheet names', () => {
  it('dedupes names that collide after invalid-character sanitization', async () => {
    const snapshot: ProductSummarySnapshot = {
      sheets: [
        { sheetName: 'A/B sheet', rows: [row({ name: 'slash' })] },
        { sheetName: 'A_B sheet', rows: [row({ name: 'underscore' })] },
      ],
    }

    const file = await renderProductSummaryExcel(snapshot)
    const names = await readSheetNames(file.buffer)

    expect(names).toEqual(['A_B sheet', 'A_B sheet (2)'])
  })

  it('dedupes names that collide after the 31-character limit', async () => {
    const snapshot: ProductSummarySnapshot = {
      sheets: [
        {
          sheetName: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
          rows: [row({ name: 'long-a' })],
        },
        {
          sheetName: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01234XXXXX',
          rows: [row({ name: 'long-b' })],
        },
      ],
    }

    const file = await renderProductSummaryExcel(snapshot)
    const names = await readSheetNames(file.buffer)

    expect(names).toEqual([
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0 (2)',
    ])
    expect(names.every((name) => name.length <= 31)).toBe(true)
  })
})
