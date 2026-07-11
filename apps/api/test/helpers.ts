import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter'
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor'
import { PrismaService } from '../src/database/prisma/prisma.service'

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication()
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
    .send({ username, password })
    .expect(201)

  return response.body.data.accessToken as string
}

export function authRequest(app: INestApplication, token: string) {
  const mutation = (method: 'post' | 'patch' | 'put' | 'delete', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  return {
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => mutation('post', url),
    patch: (url: string) => mutation('patch', url),
    put: (url: string) => mutation('put', url),
    delete: (url: string) => mutation('delete', url),
  }
}

export const DEPARTURE_NO_REGEX = /^[A-Z]{2,4}\d{6}\d{4}$/
export const AR_AP_SCHEDULE_NO_REGEX = /^A[RP][A-Z]{2,4}\d{6}\d{6}$/
export const TX_NO_REGEX = /^TX[A-Z]{2,4}\d{8}\d{6}$/
export const CL_NO_REGEX = /^CL[A-Z]{2,4}\d{6}\d{6}$/

export function uniqueBusinessPrefix(seed: string): string {
  const letters = seed.replace(/[^a-z]/gi, '').toUpperCase()
  const suffix = (letters + 'ABC').slice(0, 3)
  return `X${suffix}`
}
