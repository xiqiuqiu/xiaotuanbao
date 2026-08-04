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
            adultGuestCount: 2,
            childGuestCount: 0,
            adultUnitPriceCents: 80000,
            childUnitPriceCents: 0,
            grossReceivableCents: 160000,
            guestCollectCents: 0,
            partnerCollectedCents: 160000,
            netReceivableCents: 160000,
            notes: '',
          },
        ],
        sourceOrderTotals: {
          orderCount: 1,
          adultGuestCount: 2,
          childGuestCount: 0,
          grossReceivableCents: 160000,
          guestCollectCents: 0,
          partnerCollectedCents: 160000,
          netReceivableCents: 160000,
        },
        costRows: [
          {
            seq: 1,
            segmentLabel: 'D1',
            resourceKindLabel: '酒店',
            title: '喀什酒店',
            supplierName: '喀什宾馆',
            amountCents: 50000,
            notes: null,
          },
        ],
        outsourceRows: [
          {
            seq: 1,
            supplierName: '拼出伙伴',
            title: '拼出说明',
            amountCents: 30000,
            notes: null,
          },
        ],
        outsourceTotalAmountCents: 30000,
      },
      {
        sheetName: '0802_XTB26070011',
        title: '2026年8月2日南疆5日游日报表 · XTB26070011',
        sourceOrders: [],
        sourceOrderTotals: {
          orderCount: 0,
          adultGuestCount: 0,
          childGuestCount: 0,
          grossReceivableCents: 0,
          guestCollectCents: 0,
          partnerCollectedCents: 0,
          netReceivableCents: 0,
        },
        costRows: [],
        outsourceRows: [],
        outsourceTotalAmountCents: 0,
      },
      {
        sheetName: '0802_XTB26070012',
        title: '2026年8月2日南疆5日游日报表 · XTB26070012',
        sourceOrders: [],
        sourceOrderTotals: {
          orderCount: 0,
          adultGuestCount: 0,
          childGuestCount: 0,
          grossReceivableCents: 0,
          guestCollectCents: 0,
          partnerCollectedCents: 0,
          netReceivableCents: 0,
        },
        costRows: [
          {
            seq: 1,
            segmentLabel: '发团级',
            resourceKindLabel: '车辆',
            title: '大巴',
            supplierName: '运输公司',
            amountCents: 120000,
            notes: null,
          },
        ],
        outsourceRows: [],
        outsourceTotalAmountCents: 0,
      },
      {
        sheetName: '0802_XTB26070013',
        title: '2026年8月2日南疆5日游日报表 · XTB26070013',
        sourceOrders: [],
        sourceOrderTotals: {
          orderCount: 0,
          adultGuestCount: 0,
          childGuestCount: 0,
          grossReceivableCents: 0,
          guestCollectCents: 0,
          partnerCollectedCents: 0,
          netReceivableCents: 0,
        },
        costRows: [],
        outsourceRows: [
          {
            seq: 1,
            supplierName: '外协方',
            title: '拼出一单',
            amountCents: 45000,
            notes: null,
          },
        ],
        outsourceTotalAmountCents: 45000,
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

function flatText(sheet: ExcelJS.Worksheet): string {
  return sheet
    .getSheetValues()
    .map((row) =>
      Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : [],
    )
    .flat()
    .join('|')
}

describe('renderRouteLedgerExportExcel', () => {
  it('emits one sheet per departure including empty shells', async () => {
    const file = await renderRouteLedgerExportExcel(snapshot())
    expect(file.filename).toBe('线路视图_南疆5日游_2026-07-31.xlsx')
    const workbook = await loadWorkbook(file.buffer)
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      '0801_XTB26070010',
      '0802_XTB26070011',
      '0802_XTB26070012',
      '0802_XTB26070013',
    ])
  })

  it('writes three sections with dual-row income header and cost scope label', async () => {
    const file = await renderRouteLedgerExportExcel(snapshot())
    const workbook = await loadWorkbook(file.buffer)
    const sheet = workbook.getWorksheet('0801_XTB26070010')
    expect(sheet).toBeDefined()
    const flat = flatText(sheet!)
    expect(flat).toContain('客源收入')
    expect(flat).toContain('执行成本')
    expect(flat).toContain('拼出往来')
    expect(flat).toContain('发客客户')
    expect(flat).toContain('人数')
    expect(flat).toContain('拼入价')
    expect(flat).toContain('同程旅行浙江站')
    expect(flat).toContain('合计')
    expect(flat).toContain('归属日程')
    expect(flat).toContain('酒店')
    expect(flat).toContain('喀什宾馆')
    expect(flat).toContain('拼出伙伴')
    expect(flat).not.toContain('资源安排')
    expect(flat).not.toContain('已付')
    expect(flat).not.toContain('未付')
    expect(flat).not.toContain('导出人')
    expect(flat).not.toContain('导出时间')
    expect(flat).not.toContain('行程段')
  })

  it('shows empty-state copy for shell departures', async () => {
    const file = await renderRouteLedgerExportExcel(snapshot())
    const workbook = await loadWorkbook(file.buffer)
    const sheet = workbook.getWorksheet('0802_XTB26070011')
    const flat = flatText(sheet!)
    expect(flat).toContain('暂无执行成本资源')
    expect(flat).toContain('本团暂无拼出记录')
  })

  it('renders cost-only and outsource-only sheets', async () => {
    const file = await renderRouteLedgerExportExcel(snapshot())
    const workbook = await loadWorkbook(file.buffer)

    const costOnly = flatText(workbook.getWorksheet('0802_XTB26070012')!)
    expect(costOnly).toContain('执行成本')
    expect(costOnly).toContain('运输公司')
    expect(costOnly).toContain('本团暂无拼出记录')

    const outsourceOnly = flatText(workbook.getWorksheet('0802_XTB26070013')!)
    expect(outsourceOnly).toContain('拼出往来')
    expect(outsourceOnly).toContain('外协方')
    expect(outsourceOnly).toContain('暂无执行成本资源')
  })
})
