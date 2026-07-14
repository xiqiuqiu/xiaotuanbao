import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { JwtStrategy } from './jwt.strategy'

function extractor(allowLegacyBearer: boolean) {
  const strategy = new JwtStrategy(
    new ConfigService({
      app: {
        jwtSecret: 'test-secret',
        authAllowLegacyBearer: allowLegacyBearer,
      },
    }),
    {} as never,
  )

  return (strategy as unknown as { _jwtFromRequest: (request: Request) => string | null })
    ._jwtFromRequest
}

function request(headers: Record<string, string>): Request {
  return { headers } as unknown as Request
}

describe('JwtStrategy token extraction', () => {
  it('returns null when the Cookie is missing or malformed', () => {
    const extract = extractor(false)

    expect(extract(request({}))).toBeNull()
    expect(extract(request({ cookie: 'xtb_session=%E0%A4%A' }))).toBeNull()
  })

  it('rejects a legacy Bearer token when compatibility is disabled', () => {
    const extract = extractor(false)

    expect(extract(request({ authorization: 'Bearer legacy-token' }))).toBeNull()
  })

  it('accepts a legacy Bearer token only when compatibility is enabled', () => {
    const extract = extractor(true)

    expect(extract(request({ authorization: 'Bearer legacy-token' }))).toBe('legacy-token')
  })

  it('prefers the Cookie when Cookie and legacy Header are both present', () => {
    const extract = extractor(true)

    expect(
      extract(
        request({
          cookie: 'xtb_session=cookie-token',
          authorization: 'Bearer legacy-token',
        }),
      ),
    ).toBe('cookie-token')
  })
})
