export function formatTransactionNo(
  businessPrefix: string,
  periodKey: string,
  sequence: number,
): string {
  return `TX${businessPrefix}${periodKey}${String(sequence).padStart(6, '0')}`
}
