import type { Request } from 'express'
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
  extractAuthCookie,
} from './auth-cookie'

describe('auth cookie', () => {
  it('extracts only the exact session cookie', () => {
    const request = {
      headers: { cookie: `other=1; ${AUTH_COOKIE_NAME}=signed%2Etoken; suffix=2` },
    } as Request

    expect(extractAuthCookie(request)).toBe('signed.token')
  })

  it('returns null for malformed encoding', () => {
    const request = { headers: { cookie: `${AUTH_COOKIE_NAME}=%E0%A4%A` } } as Request
    expect(extractAuthCookie(request)).toBeNull()
  })

  it('uses matching secure attributes when setting and clearing', () => {
    const config = { secure: true, sameSite: 'none' as const, maxAgeMs: 60_000 }
    expect(authCookieOptions(config)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/api',
      maxAge: 60_000,
    })
    expect(clearAuthCookieOptions(config)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/api',
    })
  })
})
