import type { CookieOptions, Request } from 'express'

export const AUTH_COOKIE_NAME = 'xtb_session'

export interface AuthCookieConfig {
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  maxAgeMs: number
  domain?: string
}

export function extractAuthCookie(request: Request): string | null {
  const rawCookie = request.headers.cookie
  if (!rawCookie) {
    return null
  }

  for (const part of rawCookie.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === AUTH_COOKIE_NAME) {
      try {
        return decodeURIComponent(valueParts.join('=')) || null
      } catch {
        return null
      }
    }
  }
  return null
}

export function authCookieOptions(config: AuthCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: '/api',
    maxAge: config.maxAgeMs,
    ...(config.domain ? { domain: config.domain } : {}),
  }
}

export function clearAuthCookieOptions(config: AuthCookieConfig): CookieOptions {
  const { maxAge: _maxAge, ...options } = authCookieOptions(config)
  return options
}
