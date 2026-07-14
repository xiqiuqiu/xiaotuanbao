import { registerAs } from '@nestjs/config'

const DEFAULT_JWT_SECRET = 'please-change-this-secret'
const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function parseOrigins(raw: string | undefined, nodeEnv: string): string[] {
  if (!raw && nodeEnv === 'production') {
    throw new Error('生产环境必须配置 WEB_ORIGINS')
  }

  const origins = (raw ? raw.split(',') : DEFAULT_DEV_ORIGINS).map((value) => value.trim())
  for (const origin of origins) {
    const url = new URL(origin)
    if (url.origin !== origin || url.username || url.password) {
      throw new Error(`WEB_ORIGINS 必须是精确 origin，当前值无效：${origin}`)
    }
  }
  return origins
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value)
  if (!match) {
    throw new Error(`JWT_EXPIRES_IN 格式无效：${value}`)
  }
  const amount = Number(match[1])
  const unit = match[2] as 's' | 'm' | 'h' | 'd'
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
  return amount * multiplier
}

export default registerAs('app', () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development'
  const jwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '7d'
  const authCookieSecure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === 'true'
    : nodeEnv === 'production'
  const authCookieSameSite = process.env.AUTH_COOKIE_SAME_SITE ?? 'lax'

  if (nodeEnv === 'production' && jwtSecret === DEFAULT_JWT_SECRET) {
    throw new Error('生产环境必须配置非默认 JWT_SECRET')
  }
  if (!['lax', 'strict', 'none'].includes(authCookieSameSite)) {
    throw new Error(`AUTH_COOKIE_SAME_SITE 无效：${authCookieSameSite}`)
  }
  if (nodeEnv === 'production' && !authCookieSecure) {
    throw new Error('生产环境 AUTH_COOKIE_SECURE 必须为 true')
  }
  if (authCookieSameSite === 'none' && !authCookieSecure) {
    throw new Error('AUTH_COOKIE_SAME_SITE=none 时 AUTH_COOKIE_SECURE 必须为 true')
  }

  return {
    nodeEnv,
    port: Number(process.env.API_PORT ?? 3000),
    jwtSecret,
    jwtExpiresIn,
    jwtExpiresInMs: parseDurationMs(jwtExpiresIn),
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
    authCookieSecure,
    authCookieSameSite: authCookieSameSite as 'lax' | 'strict' | 'none',
    authCookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    authAllowedOrigins: parseOrigins(process.env.WEB_ORIGINS, nodeEnv),
    authAllowLegacyBearer: process.env.AUTH_ALLOW_LEGACY_BEARER === 'true',
  }
})
