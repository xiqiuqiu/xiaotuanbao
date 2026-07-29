import type {
  RouteLedgerDateBlock,
  RouteLedgerDepartureGroup,
} from '@xiaotuanbao/shared'

/** 线路视图渲染栈：换日分隔或一团一份日报。 */
export type RouteLedgerReportStackItem =
  | { type: 'date-separator'; startDate: string }
  | {
      type: 'report'
      startDate: string
      routeName: string
      departure: RouteLedgerDepartureGroup
    }

/** 出团日 YYYY-MM-DD → 中文日期（表头与换日分隔共用）。 */
export function formatRouteLedgerChineseDate(startDate: string): string {
  const [y, m, d] = startDate.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

/** 表头前缀：`{日期}{路线名}日报表`（团号由 UI 链接触接）。 */
export function formatRouteLedgerReportTitlePrefix(
  startDate: string,
  routeName: string,
): string {
  return `${formatRouteLedgerChineseDate(startDate)}${routeName}日报表`
}

/** 表头全文：`{日期}{路线名}日报表 · {团号}`（#221）。 */
export function formatRouteLedgerReportTitle(
  startDate: string,
  routeName: string,
  departureNo: string,
): string {
  return `${formatRouteLedgerReportTitlePrefix(startDate, routeName)} · ${departureNo}`
}

/**
 * 将读模型日块展开为渲染栈：出团日 → 路线名 → 团号；
 * 每个发团一项 report（含空客源）；换日插入 date-separator（首日不加）。
 */
export function listRouteLedgerReportStack(
  dateBlocks: RouteLedgerDateBlock[],
): RouteLedgerReportStackItem[] {
  const stack: RouteLedgerReportStackItem[] = []
  let lastStartDate: string | null = null

  for (const block of dateBlocks) {
    for (const route of block.routes) {
      for (const departure of route.departures) {
        if (lastStartDate !== null && block.startDate !== lastStartDate) {
          stack.push({ type: 'date-separator', startDate: block.startDate })
        }
        stack.push({
          type: 'report',
          startDate: block.startDate,
          routeName: route.routeName,
          departure,
        })
        lastStartDate = block.startDate
      }
    }
  }

  return stack
}
