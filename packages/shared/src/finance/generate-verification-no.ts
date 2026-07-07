export function generateVerificationNo(businessDate: string, sequence: number): string {
  const datePart = businessDate.replace(/-/g, '')
  const sequencePart = String(sequence).padStart(4, '0')
  return `VR${datePart}${sequencePart}`
}
