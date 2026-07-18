import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { authRequest, createTestApp, loginAs } from './helpers'

const COORDINATOR_MENU_KEYS = ['/', '/departure', '/partner', '/supplier']
const FINANCE_MENU_KEYS = [
  '/',
  '/departure',
  '/finance/payable',
  '/finance/receivable',
  '/finance/transactions',
  '/finance/verification',
  '/partner',
  '/supplier',
]
const ADMIN_MENU_KEYS = [
  ...FINANCE_MENU_KEYS,
  '/system/organization',
  '/system/roles',
  '/system/users',
]
const COORDINATOR_ACTION_KEYS = ['departure:write', 'partner:write']
const FINANCE_ACTION_KEYS: string[] = []
const ADMIN_ACTION_KEYS = ['departure:write', 'partner:write']

describe('Auth cookie session (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('uses an HttpOnly cookie without exposing the JWT and clears it on logout', async () => {
    const agent = request.agent(app.getHttpServer())
    const loginResponse = await agent
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201)

    expect(loginResponse.body.data).not.toHaveProperty('accessToken')
    expect(loginResponse.headers['set-cookie']?.[0]).toContain('xtb_session=')
    expect(loginResponse.headers['set-cookie']?.[0]).toContain('HttpOnly')
    expect(loginResponse.headers['set-cookie']?.[0]).toContain('Path=/api')
    expect(loginResponse.headers['set-cookie']?.[0]).toContain('SameSite=Lax')

    await agent.get('/api/auth/me').expect(200)
    await agent
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .expect(204)
    await agent.get('/api/auth/me').expect(401)
  })

  it('rejects unsafe requests without an allowed exact Origin', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(403)
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173.evil.example')
      .send({ username: 'admin', password: 'admin123' })
      .expect(403)
  })
})

describe('Auth menu/action keys per preset role (ADR-0023, e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('login returns menuKeys and 计调 actionKeys with departure:write (ADR-0023)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ username: 'wangjie', password: 'admin123' })
      .expect(201)

    expect(response.body.data.menuKeys).toEqual(COORDINATOR_MENU_KEYS)
    expect(response.body.data.actionKeys).toEqual(COORDINATOR_ACTION_KEYS)
  })

  it('GET /auth/me gives 计调 only 工作台/发团/合作伙伴/供应商 plus departure:write', async () => {
    const cookie = await loginAs(app, 'wangjie')
    const response = await authRequest(app, cookie).get('/api/auth/me').expect(200)

    expect(response.body.data.menuKeys).toEqual(COORDINATOR_MENU_KEYS)
    expect(response.body.data.menuKeys).not.toContain('/finance/receivable')
    expect(response.body.data.menuKeys).not.toContain('/finance/transactions')
    expect(response.body.data.actionKeys).toEqual(COORDINATOR_ACTION_KEYS)
  })

  it('GET /auth/me gives 财务 the business + finance menus and no action keys', async () => {
    const cookie = await loginAs(app, 'acai')
    const response = await authRequest(app, cookie).get('/api/auth/me').expect(200)

    expect(response.body.data.menuKeys).toEqual(FINANCE_MENU_KEYS)
    expect(response.body.data.menuKeys).not.toContain('/system/users')
    expect(response.body.data.actionKeys).toEqual(FINANCE_ACTION_KEYS)
    expect(response.body.data.actionKeys).not.toContain('departure:write')
  })

  it('GET /auth/me gives 企业管理员 all menus and departure:write', async () => {
    const cookie = await loginAs(app, 'admin')
    const response = await authRequest(app, cookie).get('/api/auth/me').expect(200)

    expect(response.body.data.menuKeys).toEqual(ADMIN_MENU_KEYS)
    expect(response.body.data.actionKeys).toEqual(ADMIN_ACTION_KEYS)
  })
})
