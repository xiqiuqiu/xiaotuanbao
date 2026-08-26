export const CURRENT_INSTRUCTION_TOKEN_LIMITER_ID = 'current-instruction-token-limiter'
export const CONTEXT_CAPACITY_ABORT_REASON = 'CONTEXT_CAPACITY_EXCEEDED'

export function isTokenLimiterTripWire(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return (
    error.name === 'TripWire' ||
    error.message.includes('TokenLimiterProcessor') ||
    error.message === CONTEXT_CAPACITY_ABORT_REASON ||
    error.message.includes(CURRENT_INSTRUCTION_TOKEN_LIMITER_ID)
  )
}
