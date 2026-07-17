import { INestApplication } from '@nestjs/common'
import { authRequest, createTestApp, loginAs } from './helpers'
import { PrismaService } from '../src/database/prisma/prisma.service'

describe('Platform organizations catalog (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let platformCookie: string
  let tenantCookie: string

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(PrismaService)
    platformCookie = await loginAs(app, 'platform')
    tenantCookie = await loginAs(app, 'admin')
  })

  afterAll(async () => {
    await app.close()
  })

  it('lists customer organizations and excludes Platform Organization', async () => {
    const response = await authRequest(app, platformCookie)
      .get('/api/platform/organizations')
      .expect(200)

    const { items, total } = response.body.data as {
      items: Array<{ id: string; name: string; businessPrefix: string; status: string }>
      total: number
    }

    expect(total).toBeGreaterThanOrEqual(1)
    expect(items.every((item) => item.name !== '平台运营组织')).toBe(true)
    expect(items.every((item) => item.businessPrefix !== 'PLAT')).toBe(true)
    expect(items.some((item) => item.name === '演示旅行社')).toBe(true)

    const platformOrg = await prisma.organization.findFirstOrThrow({
      where: { name: '平台运营组织', deletedAt: null },
    })
    expect(items.some((item) => item.id === platformOrg.id)).toBe(false)
    expect(items.every((item) => item.status === 'enabled' || item.status === 'disabled')).toBe(
      true,
    )
  })

  it('returns organization profile metadata without business payload fields', async () => {
    const demo = await prisma.organization.findFirstOrThrow({
      where: { name: '演示旅行社', deletedAt: null },
    })

    const response = await authRequest(app, platformCookie)
      .get(`/api/platform/organizations/${demo.id}`)
      .expect(200)

    expect(response.body.data).toEqual({
      id: demo.id,
      name: demo.name,
      businessPrefix: demo.businessPrefix,
      status: 'enabled',
      createdAt: demo.createdAt.toISOString(),
      updatedAt: demo.updatedAt.toISOString(),
    })
    expect(response.body.data).not.toHaveProperty('users')
    expect(response.body.data).not.toHaveProperty('departures')
  })

  it('hides Platform Organization profile from the catalog API', async () => {
    const platformOrg = await prisma.organization.findFirstOrThrow({
      where: { name: '平台运营组织', deletedAt: null },
    })

    await authRequest(app, platformCookie)
      .get(`/api/platform/organizations/${platformOrg.id}`)
      .expect(404)
  })

  it('rejects tenant users from organization catalog APIs', async () => {
    const demo = await prisma.organization.findFirstOrThrow({
      where: { name: '演示旅行社', deletedAt: null },
    })

    await authRequest(app, tenantCookie).get('/api/platform/organizations').expect(403)
    await authRequest(app, tenantCookie)
      .get(`/api/platform/organizations/${demo.id}`)
      .expect(403)
  })
})
