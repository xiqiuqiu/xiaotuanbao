import { createHmac } from 'node:crypto'

export const AI_OP_DELEGATION_JWT_TYP = 'ai-op-delegation' as const
export const AI_OP_DELEGATION_JWT_AUD = 'ai-op-delegation' as const

export function deriveAiOperationDelegationJwtSecret(jwtSecret: string): string {
  return createHmac('sha256', jwtSecret).update('xtb-ai-op-delegation-v1').digest('base64url')
}

export function isSessionJwtPayload(payload: { typ?: unknown; aud?: unknown }): boolean {
  if (payload.typ != null && payload.typ !== 'session') {
    return false
  }
  const { aud } = payload
  if (aud === AI_OP_DELEGATION_JWT_AUD) {
    return false
  }
  return !(Array.isArray(aud) && aud.includes(AI_OP_DELEGATION_JWT_AUD))
}
