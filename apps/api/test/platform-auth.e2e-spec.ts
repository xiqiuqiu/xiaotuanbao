import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { authRequest, createTestApp, loginAs } from './helpers'

const TEST_ORIGIN = 'http://localhost:5173'

describe('Platform Admin auth (e2e)', () => {
  let app: INestApplication
  let platformCookie: string
  let tenantCookie: string

  beforeAll(async () => {
    app = await createTestApp()
    platformCookie = await loginAs(app, 'platform')
    tenantCookie = await loginAs(app, 'admin')
  })

  afterAll(async () => {
    await app.close()
  })

  it('exposes isPlatformAdmin on login and me for platform accounts', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ username: 'platform', password: 'admin123' })
      .expect(201)

    expect(loginResponse.body.data.user).toMatchObject({
      username: 'platform',
      isPlatformAdmin: true,
    })
    expect(loginResponse.body.data.menuKeys).toEqual([])

    const meResponse = await authRequest(app, platformCookie).get('/api/auth/me').expect(200)

    expect(meResponse.body.data.user).toMatchObject({
      username: 'platform',
      isPlatformAdmin: true,
    })
    expect(meResponse.body.data.menuKeys).toEqual([])
  })

  it('exposes isPlatformAdmin=false for tenant accounts', async () => {
    const meResponse = await authRequest(app, tenantCookie).get('/api/auth/me').expect(200)

    expect(meResponse.body.data.user).toMatchObject({
      username: 'admin',
      isPlatformAdmin: false,
    })
  })

  it('allows Platform Admin to access a protected platform API', async () => {
    const response = await authRequest(app, platformCookie).get('/api/platform/session').expect(200)

    expect(response.body.data).toMatchObject({
      ok: true,
      isPlatformAdmin: true,
    })
  })

  it('rejects tenant users from platform APIs', async () => {
    await authRequest(app, tenantCookie).get('/api/platform/session').expect(403)
  })
})
