import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CsrfOriginGuard } from './csrf-origin.guard'

function context(method: string, origin?: string, skipCsrf = false): ExecutionContext {
  return {
    getHandler: () => (skipCsrf ? { skipCsrf: true } : {}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ method, headers: { origin } }),
    }),
  } as ExecutionContext
}

describe('CsrfOriginGuard', () => {
  const reflector = {
    getAllAndOverride: (_key: string, targets: unknown[]) => {
      const handler = targets[0] as { skipCsrf?: boolean }
      return Boolean(handler?.skipCsrf)
    },
  }
  const guard = new CsrfOriginGuard(
    new ConfigService({ app: { authAllowedOrigins: ['https://app.example.com'] } }),
    reflector as never,
  )

  it('allows safe methods without Origin', () => {
    expect(guard.canActivate(context('GET'))).toBe(true)
  })

  it('allows an exact configured Origin for mutations', () => {
    expect(guard.canActivate(context('POST', 'https://app.example.com'))).toBe(true)
  })

  it.each([undefined, 'https://app.example.com.evil.test'])(
    'rejects missing or suffix-spoofed Origin: %s',
    (origin) => {
      expect(() => guard.canActivate(context('PATCH', origin))).toThrow(ForbiddenException)
    },
  )

  it('skips Origin checks for internal AI tool routes', () => {
    expect(guard.canActivate(context('POST', undefined, true))).toBe(true)
  })
})
