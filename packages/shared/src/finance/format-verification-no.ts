export function formatVerificationNo(
  businessPrefix: string,
  periodKey: string,
  sequence: number,
): string {
  return `CL${businessPrefix}${periodKey}${String(sequence).padStart(6, '0')}`
}
