export function formatDepartureNo(
  businessPrefix: string,
  periodKey: string,
  sequence: number,
): string {
  return `${businessPrefix}${periodKey}${String(sequence).padStart(4, '0')}`
}
