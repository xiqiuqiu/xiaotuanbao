import { registerAs } from '@nestjs/config'
import { STORED_OBJECT_MAX_UPLOAD_BYTES } from '../modules/stored-object/stored-object.constants'

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

  const s3Endpoint = process.env.S3_ENDPOINT?.trim()
  const s3Bucket = process.env.S3_BUCKET?.trim()
  const s3AccessKey = process.env.S3_ACCESS_KEY?.trim()
  const s3SecretKey = process.env.S3_SECRET_KEY?.trim()
  const s3Region = (process.env.S3_REGION ?? 'garage').trim() || 'garage'

  if (!s3Endpoint || !s3Bucket || !s3AccessKey || !s3SecretKey) {
    throw new Error(
      'FileStore 需要配置 S3_ENDPOINT、S3_BUCKET、S3_ACCESS_KEY、S3_SECRET_KEY（ADR-0027；禁止回落本地盘）',
    )
  }

  return {
    nodeEnv,
    port: Number(process.env.API_PORT ?? 3000),
    jwtSecret,
    jwtExpiresIn,
    jwtExpiresInMs: parseDurationMs(jwtExpiresIn),
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
    s3: {
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKey: s3AccessKey,
      secretKey: s3SecretKey,
    },
    storedObjectMaxUploadBytes: STORED_OBJECT_MAX_UPLOAD_BYTES,
    authCookieSecure,
    authCookieSameSite: authCookieSameSite as 'lax' | 'strict' | 'none',
    authCookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    authAllowedOrigins: parseOrigins(process.env.WEB_ORIGINS, nodeEnv),
    authAllowLegacyBearer: process.env.AUTH_ALLOW_LEGACY_BEARER === 'true',
    aiCreateAssist: {
      enabled: process.env.AI_CREATE_ASSIST_ENABLED === 'true',
      userIds: (process.env.AI_CREATE_ASSIST_USER_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      agentServiceSecret: process.env.AGENT_SERVICE_SECRET?.trim() ?? '',
      agentRuntimeUrl: (process.env.AGENT_RUNTIME_URL ?? '/copilotkit').trim(),
      delegationTtlSec: Number(process.env.AI_CREATE_ASSIST_DELEGATION_TTL_SEC ?? 600),
      runTimeoutMs: Number(process.env.AI_CREATE_ASSIST_RUN_TIMEOUT_MS ?? 120_000),
    },
  }
})
