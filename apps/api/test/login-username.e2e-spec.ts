import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PRESET_ROLE_NAMES } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs } from './helpers'
import { PrismaService } from '../src/database/prisma/prisma.service'

const TEST_ORIGIN = 'http://localhost:5173'

function freshBusinessPrefix(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let prefix = ''
  for (let i = 0; i < 4; i += 1) {
    prefix += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return prefix
}

function onboardPayload(overrides: Record<string, unknown> = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    name: `E2E登录名${stamp}`,
    businessPrefix: freshBusinessPrefix(),
    adminUsername: `e2e-login-${stamp}`,
    adminName: '开户管理员',
    adminPassword: 'admin1234',
    ...overrides,
  }
}

describe('Login Username global uniqueness (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let platformCookie: string
  let tenantCookie: string
  let orgAdminRoleId: string

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(PrismaService)
    platformCookie = await loginAs(app, 'platform')
    tenantCookie = await loginAs(app, 'admin')
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: PRESET_ROLE_NAMES.ORG_ADMIN },
    })
    orgAdminRoleId = role.id
  })

  afterAll(async () => {
    await app.close()
  })

  it('logs in with mixed-case username to the same User', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ username: 'AdMiN', password: 'admin123' })
      .expect(201)

    expect(response.body.data.user.username).toBe('admin')
  })

  it('persists employee username as lowercase and rejects cross-organization collision', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const username = `CrossOrg${stamp}`

    const created = await authRequest(app, tenantCookie)
      .post('/api/users')
      .send({
        username,
        name: '跨组织甲',
        roleId: orgAdminRoleId,
        status: 'enabled',
        password: 'admin1234',
      })
      .expect(201)

    expect(created.body.data.username).toBe(username.toLowerCase())

    const otherOrg = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send(onboardPayload({ adminUsername: `other-admin-${stamp}` }))
      .expect(201)

    const otherAdmin = await prisma.user.findFirstOrThrow({
      where: {
        organizationId: otherOrg.body.data.id as string,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    })
    const otherSession = await loginAs(app, otherAdmin.username, 'admin1234')

    const conflict = await authRequest(app, otherSession)
      .post('/api/users')
      .send({
        username: username.toUpperCase(),
        name: '跨组织乙',
        roleId: orgAdminRoleId,
        status: 'enabled',
        password: 'admin1234',
      })
      .expect(409)
    expect(conflict.body.message).toBe('用户名已存在')
  })

  it('rejects employee username that collides with Platform Admin', async () => {
    const conflict = await authRequest(app, tenantCookie)
      .post('/api/users')
      .send({
        username: 'PLATFORM',
        name: '撞平台管理员',
        roleId: orgAdminRoleId,
        status: 'enabled',
        password: 'admin1234',
      })
      .expect(409)
    expect(conflict.body.message).toBe('用户名已存在')
  })

  it('rejects onboarding admin username collision and leaves no orphan organization', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const name = `E2E开户撞名${stamp}`
    const conflict = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send(
        onboardPayload({
          name,
          adminUsername: 'admin',
        }),
      )
      .expect(409)
    expect(conflict.body.message).toBe('用户名已存在')

    const orphan = await prisma.organization.findFirst({
      where: { name, deletedAt: null },
    })
    expect(orphan).toBeNull()
  })

  it('keeps disabled employee username occupied', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const username = `disabled-user-${stamp}`

    const created = await authRequest(app, tenantCookie)
      .post('/api/users')
      .send({
        username,
        name: '待停用',
        roleId: orgAdminRoleId,
        status: 'enabled',
        password: 'admin1234',
      })
      .expect(201)

    await authRequest(app, tenantCookie)
      .post(`/api/users/${created.body.data.id}/disable`)
      .expect(201)

    const conflict = await authRequest(app, tenantCookie)
      .post('/api/users')
      .send({
        username: username.toUpperCase(),
        name: '想占用',
        roleId: orgAdminRoleId,
        status: 'enabled',
        password: 'admin1234',
      })
      .expect(409)
    expect(conflict.body.message).toBe('用户名已存在')
  })

  it('rejects renaming employee login username onto an occupied name', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const first = await authRequest(app, tenantCookie)
      .post('/api/users')
      .send({
        username: `rename-a-${stamp}`,
        name: '改名甲',
        roleId: orgAdminRoleId,
        status: 'enabled',
        password: 'admin1234',
      })
      .expect(201)

    await authRequest(app, tenantCookie)
      .post('/api/users')
      .send({
        username: `rename-b-${stamp}`,
        name: '改名乙',
        roleId: orgAdminRoleId,
        status: 'enabled',
        password: 'admin1234',
      })
      .expect(201)

    const conflict = await authRequest(app, tenantCookie)
      .patch(`/api/users/${first.body.data.id}`)
      .send({
        username: `Rename-B-${stamp}`,
        name: '改名甲',
        roleId: orgAdminRoleId,
        status: 'enabled',
      })
      .expect(409)
    expect(conflict.body.message).toBe('用户名已存在')
  })

  it('persists onboarded and renamed usernames as lowercase', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const adminUsername = `OnboardAdmin${stamp}`
    const created = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send(onboardPayload({ adminUsername }))
      .expect(201)

    const admin = await prisma.user.findFirstOrThrow({
      where: { organizationId: created.body.data.id as string, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    expect(admin.username).toBe(adminUsername.toLowerCase())

    const adminSession = await loginAs(app, admin.username, 'admin1234')
    const renamed = await authRequest(app, adminSession)
      .patch(`/api/users/${admin.id}`)
      .send({
        username: `RenameMe${stamp}`,
        name: admin.name,
        roleId: orgAdminRoleId,
        status: 'enabled',
      })
      .expect(200)

    expect(renamed.body.data.username).toBe(`renameme${stamp}`)
  })

  it('keeps username occupied when the owning Organization is disabled', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const adminUsername = `disabled-org-admin-${stamp}`
    const created = await authRequest(app, platformCookie)
      .post('/api/platform/organizations')
      .send(onboardPayload({ adminUsername }))
      .expect(201)

    const organizationId = created.body.data.id as string
    await authRequest(app, platformCookie)
      .post(`/api/platform/organizations/${organizationId}/disable`)
      .expect(201)

    const conflict = await authRequest(app, tenantCookie)
      .post('/api/users')
      .send({
        username: adminUsername.toUpperCase(),
        name: '想占用停用组织管理员',
        roleId: orgAdminRoleId,
        status: 'enabled',
        password: 'admin1234',
      })
      .expect(409)
    expect(conflict.body.message).toBe('用户名已存在')
  })
})
