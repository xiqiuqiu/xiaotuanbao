import { JwtService } from '@nestjs/jwt'
import {
  AI_OP_DELEGATION_JWT_AUD,
  AI_OP_DELEGATION_JWT_TYP,
  deriveAiOperationDelegationJwtSecret,
  isSessionJwtPayload,
} from './jwt-claims'

describe('jwt-claims', () => {
  it('derives a delegation secret that differs from the session secret', () => {
    const jwtSecret = 'please-change-this-secret'
    expect(deriveAiOperationDelegationJwtSecret(jwtSecret)).not.toBe(jwtSecret)
  })

  it('treats login payloads as session credentials and rejects delegation claims', () => {
    expect(isSessionJwtPayload({})).toBe(true)
    expect(isSessionJwtPayload({ typ: 'session' })).toBe(true)
    expect(isSessionJwtPayload({ typ: AI_OP_DELEGATION_JWT_TYP })).toBe(false)
    expect(isSessionJwtPayload({ aud: AI_OP_DELEGATION_JWT_AUD })).toBe(false)
    expect(isSessionJwtPayload({ aud: [AI_OP_DELEGATION_JWT_AUD, 'other'] })).toBe(false)
  })

  it('cannot verify a delegation JWT with the session secret', async () => {
    const jwt = new JwtService()
    const sessionSecret = 'session-secret'
    const token = await jwt.signAsync(
      {
        typ: AI_OP_DELEGATION_JWT_TYP,
        sub: 'user-1',
        organizationId: 'org-1',
        taskId: 'task-1',
        runId: 'run-1',
      },
      {
        secret: deriveAiOperationDelegationJwtSecret(sessionSecret),
        audience: AI_OP_DELEGATION_JWT_AUD,
        expiresIn: 60,
      },
    )

    await expect(jwt.verifyAsync(token, { secret: sessionSecret })).rejects.toThrow()
  })
})
