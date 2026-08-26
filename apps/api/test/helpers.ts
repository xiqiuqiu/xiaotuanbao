import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter'
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor'
import { configureHttpBodyParsers } from '../src/common/http-body-parser'
import { PrismaService } from '../src/database/prisma/prisma.service'

const TEST_ORIGIN = 'http://localhost:5173'

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false })
  configureHttpBodyParsers(app)
  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalInterceptors(new TransformInterceptor())
  // Bind one stable ephemeral listener for the suite. Letting each Supertest
  // request auto-bind the same unstarted server races under concurrent bursts
  // and intermittently resets unrelated requests with ECONNRESET.
  await app.listen(0, '127.0.0.1')
  const close = app.close.bind(app)
  app.close = async () => {
    await app.get(PrismaService).financeIdempotencyRecord.deleteMany({
      where: { idempotencyKey: { startsWith: 'e2e-' } },
    })
    await close()
  }
  return app
}

export async function loginAs(
  app: INestApplication,
  username: string,
  password = 'admin123',
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ username, password })
    .expect(201)

  const rawSetCookie = response.headers['set-cookie'] as string | string[] | undefined
  const setCookie = Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [rawSetCookie] : []
  const sessionCookie = setCookie?.find((cookie) => cookie.startsWith('xtb_session='))
  if (!sessionCookie) {
    throw new Error('登录响应缺少 xtb_session Cookie')
  }
  return sessionCookie.split(';', 1)[0]
}

export function authRequest(app: INestApplication, sessionCookie: string) {
  const mutation = (method: 'post' | 'patch' | 'put' | 'delete', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Cookie', sessionCookie)
      .set('Origin', TEST_ORIGIN)
      .set('Idempotency-Key', `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  return {
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('Cookie', sessionCookie),
    post: (url: string) => mutation('post', url),
    patch: (url: string) => mutation('patch', url),
    put: (url: string) => mutation('put', url),
    delete: (url: string) => mutation('delete', url),
  }
}

/** Accepts legacy yyyyMM and current yyMM period segments. */
export const DEPARTURE_NO_REGEX = /^[A-Z]{2,4}(?:\d{6}|\d{4})\d{4}$/
/** Accepts legacy yyyyMM and current yyMM period segments. */
export const AR_AP_SCHEDULE_NO_REGEX = /^A[RP][A-Z]{2,4}(?:\d{6}|\d{4})\d{6}$/
/** Accepts legacy yyyyMMdd and current yyMMdd period segments. */
export const TX_NO_REGEX = /^TX[A-Z]{2,4}(?:\d{8}|\d{6})\d{6}$/
/** Accepts legacy yyyyMM and current yyMM period segments. */
export const CL_NO_REGEX = /^CL[A-Z]{2,4}(?:\d{6}|\d{4})\d{6}$/

export function uniqueBusinessPrefix(seed: string): string {
  const letters = seed.replace(/[^a-z]/gi, '').toUpperCase()
  const suffix = (letters + 'ABC').slice(0, 3)
  return `X${suffix}`
}
