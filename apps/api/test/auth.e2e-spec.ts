import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from './helpers'

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
