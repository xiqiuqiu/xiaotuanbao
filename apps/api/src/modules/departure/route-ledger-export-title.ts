/** 出团日 YYYY-MM-DD → 中文日期（与线路视图表头一致）。 */
export function formatRouteLedgerChineseDate(startDate: string): string {
  const [y, m, d] = startDate.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

export function formatRouteLedgerReportTitle(
  startDate: string,
  routeName: string,
  departureNo: string,
): string {
  return `${formatRouteLedgerChineseDate(startDate)}${routeName}日报表 · ${departureNo}`
}
