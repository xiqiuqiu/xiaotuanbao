import { INestApplication } from '@nestjs/common'
import { authRequest, createTestApp, loginAs } from './helpers'
import { PrismaService } from '../src/database/prisma/prisma.service'

/** 4-letter A–Z prefix unlikely to collide across e2e runs. */
function freshBusinessPrefix(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let prefix = ''
  for (let i = 0; i < 4; i += 1) {
    prefix += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return prefix
}

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

  it('creates a customer organization shell with enabled status and no users', async () => {
    const name = `E2E创建壳${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const businessPrefix = freshBusinessPrefix()

    const response = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send({ name, businessPrefix })
      .expect(201)

    const created = response.body.data as {
      id: string
      name: string
      businessPrefix: string
      status: string
    }

    expect(created).toMatchObject({
      name,
      businessPrefix,
      status: 'enabled',
    })
    expect(created.id).toBeTruthy()

    const userCount = await prisma.user.count({
      where: { organizationId: created.id },
    })
    expect(userCount).toBe(0)

    const listed = await authRequest(app, platformCookie)
      .get('/api/platform/organizations')
      .expect(200)
    const items = listed.body.data.items as Array<{ id: string }>
    expect(items.some((item) => item.id === created.id)).toBe(true)
  })

  it('rejects duplicate organization name and business prefix', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const name = `E2E重名壳${stamp}`
    const businessPrefix = freshBusinessPrefix()

    await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send({ name, businessPrefix })
      .expect(201)

    const nameConflict = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send({ name, businessPrefix: freshBusinessPrefix() })
      .expect(409)
    expect(nameConflict.body.message).toBe('组织名称已存在')

    const prefixConflict = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send({ name: `E2E重前缀壳${stamp}`, businessPrefix })
      .expect(409)
    expect(prefixConflict.body.message).toBe('组织业务前缀已存在')
  })

  it('rejects tenant users from create organization API', async () => {
    await authRequest(app, tenantCookie)
      .post('/api/platform/organizations')
      .send({
        name: `E2E租户拒绝${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        businessPrefix: freshBusinessPrefix(),
      })
      .expect(403)
  })

  it('renames a customer organization without changing business prefix', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const businessPrefix = freshBusinessPrefix()

    const created = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send({ name: `E2E改名前${stamp}`, businessPrefix })
      .expect(201)

    const organizationId = created.body.data.id as string
    const renamedName = `E2E改名后${stamp}`

    const response = await authRequest(app, platformCookie)
      .patch(`/api/platform/organizations/${organizationId}`)
      .send({ name: renamedName })
      .expect(200)

    expect(response.body.data).toMatchObject({
      id: organizationId,
      name: renamedName,
      businessPrefix,
      status: 'enabled',
    })

    await authRequest(app, platformCookie)
      .patch(`/api/platform/organizations/${organizationId}`)
      .send({ name: `${renamedName}-前缀拒`, businessPrefix: 'XXXX' })
      .expect(400)

    const profile = await authRequest(app, platformCookie)
      .get(`/api/platform/organizations/${organizationId}`)
      .expect(200)
    expect(profile.body.data).toMatchObject({
      name: renamedName,
      businessPrefix,
    })
  })

  it('rejects rename when organization name already exists', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const firstName = `E2E改名冲突甲${stamp}`
    const secondName = `E2E改名冲突乙${stamp}`

    await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send({ name: firstName, businessPrefix: freshBusinessPrefix() })
      .expect(201)

    const second = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send({ name: secondName, businessPrefix: freshBusinessPrefix() })
      .expect(201)

    const conflict = await authRequest(app, platformCookie)
      .patch(`/api/platform/organizations/${second.body.data.id}`)
      .send({ name: firstName })
      .expect(409)
    expect(conflict.body.message).toBe('组织名称已存在')
  })

  it('renames a disabled customer organization', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const businessPrefix = freshBusinessPrefix()

    const created = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send({ name: `E2E停用改名前${stamp}`, businessPrefix })
      .expect(201)

    const organizationId = created.body.data.id as string
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'disabled' },
    })

    const renamedName = `E2E停用改名后${stamp}`
    const response = await authRequest(app, platformCookie)
      .patch(`/api/platform/organizations/${organizationId}`)
      .send({ name: renamedName })
      .expect(200)

    expect(response.body.data).toMatchObject({
      id: organizationId,
      name: renamedName,
      businessPrefix,
      status: 'disabled',
    })
  })

  it('rejects tenant users from rename organization API', async () => {
    const demo = await prisma.organization.findFirstOrThrow({
      where: { name: '演示旅行社', deletedAt: null },
    })

    await authRequest(app, tenantCookie)
      .patch(`/api/platform/organizations/${demo.id}`)
      .send({ name: `E2E租户改名拒绝${Date.now()}` })
      .expect(403)
  })
})
