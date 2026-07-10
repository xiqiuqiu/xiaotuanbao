import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from './helpers'

describe('E2E HTTP server stability', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('serves repeated concurrent request bursts without resetting sockets', async () => {
    for (let round = 0; round < 20; round += 1) {
      const responses = await Promise.all(
        Array.from({ length: 32 }, () => request(app.getHttpServer()).get('/api/health')),
      )
      expect(responses.every((response) => response.status === 200)).toBe(true)
    }
  })
})
