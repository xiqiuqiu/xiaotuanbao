/**
 * Default receivable due date from departure start date (YYYY-MM-DD):
 * the 10th of the next calendar month (Dec → next Jan 10).
 */
export function computeReceivableDueDate(startDate: string): string {
  const year = Number(startDate.slice(0, 4))
  const month = Number(startDate.slice(5, 7))
  // `month` is 1-based; Date.UTC month is 0-based, so passing `month` advances one month.
  return new Date(Date.UTC(year, month, 10)).toISOString().slice(0, 10)
}
