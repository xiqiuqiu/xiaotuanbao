import {
  buildRouteLedgerExportFilename,
  buildRouteLedgerSheetName,
  sanitizeRouteLedgerExcelPart,
} from './route-ledger-export.naming'

describe('route ledger export naming', () => {
  it('sanitizes illegal Excel / filename characters', () => {
    expect(sanitizeRouteLedgerExcelPart('南疆/5日*游')).toBe('南疆_5日_游')
    expect(sanitizeRouteLedgerExcelPart('   ')).toBe('_')
  })

  it('builds sheet name as MMDD_departureNo within 31 chars', () => {
    expect(buildRouteLedgerSheetName('2026-08-01', 'XTB26070010')).toBe('0801_XTB26070010')
    const longNo = 'XTB' + '9'.repeat(40)
    const name = buildRouteLedgerSheetName('2026-12-31', longNo)
    expect(name.length).toBeLessThanOrEqual(31)
    expect(name.startsWith('1231_')).toBe(true)
  })

  it('builds workbook filename with route name when present', () => {
    expect(
      buildRouteLedgerExportFilename({
        routeName: '南疆5日游',
        startDateFrom: '2026-08-01',
        startDateTo: '2026-08-01',
        exportedAt: '2026-07-31T08:00:00.000Z',
      }),
    ).toBe('线路视图_南疆5日游_2026-07-31.xlsx')
  })

  it('builds workbook filename with date range when route is absent', () => {
    expect(
      buildRouteLedgerExportFilename({
        routeName: undefined,
        startDateFrom: '2026-08-01',
        startDateTo: '2026-08-07',
        exportedAt: '2026-07-31T08:00:00.000Z',
      }),
    ).toBe('线路视图_20260801-20260807_2026-07-31.xlsx')
  })
})
