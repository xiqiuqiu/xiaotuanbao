import ExcelJS from 'exceljs'
import type { RouteLedgerExportSnapshot } from './route-ledger-export.types'
import { renderRouteLedgerExportExcel } from './route-ledger-export-exceljs.renderer'

function snapshot(partial?: Partial<RouteLedgerExportSnapshot>): RouteLedgerExportSnapshot {
  return {
    filename: '线路视图_南疆5日游_2026-07-31.xlsx',
    exportedAt: '2026-07-31T08:00:00.000Z',
    exportedByName: '演示管理员',
    sheets: [
      {
        sheetName: '0801_XTB26070010',
        title: '2026年8月1日南疆5日游日报表 · XTB26070010',
        sourceOrders: [
          {
            seq: 1,
            partnerName: '同程旅行浙江站',
            guestRepresentativeName: '张三',
            guestRepresentativePhone: '13800000000',
            adultUnitPriceYuan: '800.00',
            childUnitPriceYuan: '—',
            adultGuestCount: 2,
            childGuestCount: 0,
            grossReceivableYuan: '1600.00',
            guestCollectYuan: '0.00',
            partnerCollectedYuan: '1600.00',
            netReceivableYuan: '1600.00',
            notes: '',
          },
        ],
        sourceOrderTotals: {
          adultGuestCount: 2,
          childGuestCount: 0,
          grossReceivableYuan: '1600.00',
          guestCollectYuan: '0.00',
          partnerCollectedYuan: '1600.00',
          netReceivableYuan: '1600.00',
        },
        resources: [
          {
            segmentName: 'D1',
            resourceKindLabel: '酒店',
            title: '喀什酒店',
            supplierName: '喀什宾馆',
            amountYuan: '500.00',
            notes: null,
          },
        ],
      },
      {
        sheetName: '0802_XTB26070011',
        title: '2026年8月2日南疆5日游日报表 · XTB26070011',
        sourceOrders: [],
        sourceOrderTotals: {
          adultGuestCount: 0,
          childGuestCount: 0,
          grossReceivableYuan: '0.00',
          guestCollectYuan: '0.00',
          partnerCollectedYuan: '0.00',
          netReceivableYuan: '0.00',
        },
        resources: [],
      },
    ],
    ...partial,
  }
}

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

describe('renderRouteLedgerExportExcel', () => {
  it('emits one sheet per departure including empty shells', async () => {
    const file = await renderRouteLedgerExportExcel(snapshot())
    expect(file.filename).toBe('线路视图_南疆5日游_2026-07-31.xlsx')
    const workbook = await loadWorkbook(file.buffer)
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      '0801_XTB26070010',
      '0802_XTB26070011',
    ])
  })

  it('writes guest columns then resource arrangement section', async () => {
    const file = await renderRouteLedgerExportExcel(snapshot())
    const workbook = await loadWorkbook(file.buffer)
    const sheet = workbook.getWorksheet('0801_XTB26070010')
    expect(sheet).toBeDefined()
    const values = sheet!.getSheetValues().map((row) =>
      Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : [],
    )
    const flat = values.flat().join('|')
    expect(flat).toContain('发客客户')
    expect(flat).toContain('同程旅行浙江站')
    expect(flat).toContain('合计')
    expect(flat).toContain('资源安排')
    expect(flat).toContain('酒店')
    expect(flat).toContain('喀什宾馆')
    expect(flat).not.toContain('已付')
    expect(flat).not.toContain('未付')
  })
})
