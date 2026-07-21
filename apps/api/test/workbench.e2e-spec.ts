import { INestApplication } from '@nestjs/common'
import { PRESET_ROLE_NAMES } from '@xiaotuanbao/shared'
import { hash } from 'bcryptjs'
import { PrismaService } from '../src/database/prisma/prisma.service'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Workbench contract (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  const createdUsernames = [
    `e2e-workbench-finance-${Date.now()}`,
    `e2e-workbench-admin-${Date.now()}`,
  ]

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(PrismaService)

    const organization = await prisma.user.findFirstOrThrow({
      where: { username: 'admin', deletedAt: null },
      select: { organizationId: true },
    })
    const roles = await prisma.role.findMany({
      where: { name: { in: Object.values(PRESET_ROLE_NAMES) } },
      select: { id: true, name: true },
    })
    const roleId = (name: string) =>
      roles.find((role: { id: string; name: string }) => role.name === name)!.id
    const passwordHash = await hash('admin123', 10)

    await prisma.user.create({
      data: {
        organizationId: organization.organizationId,
        username: createdUsernames[0],
        passwordHash,
        name: '多角色财务测试员',
        roles: {
          create: [
            { roleId: roleId(PRESET_ROLE_NAMES.FINANCE) },
            { roleId: roleId(PRESET_ROLE_NAMES.COORDINATOR) },
          ],
        },
      },
    })
    await prisma.user.create({
      data: {
        organizationId: organization.organizationId,
        username: createdUsernames[1],
        passwordHash,
        name: '多角色管理员测试员',
        roles: {
          create: [
            { roleId: roleId(PRESET_ROLE_NAMES.ORG_ADMIN) },
            { roleId: roleId(PRESET_ROLE_NAMES.FINANCE) },
            { roleId: roleId(PRESET_ROLE_NAMES.COORDINATOR) },
          ],
        },
      },
    })
  })

  afterAll(async () => {
    if (!prisma || !app) {
      return
    }
    await prisma.userRole.deleteMany({
      where: { user: { username: { in: createdUsernames } } },
    })
    await prisma.user.deleteMany({ where: { username: { in: createdUsernames } } })
    await app.close()
  })

  it('returns one coordinator template, one shared asOf and only permission-backed actions', async () => {
    const cookie = await loginAs(app, 'wangjie')
    const response = await authRequest(app, cookie).get('/api/workbench').expect(200)

    expect(response.body.data).toMatchObject({
      template: 'coordinator',
      organization: { name: '演示旅行社' },
      modules: [
        { key: 'coordinator-departures' },
        { key: 'coordinator-settlement' },
        { key: 'coordinator-trend' },
      ],
      actions: [
        {
          key: 'create-departure',
          label: '新建发团',
          href: '/departure/new',
          emphasis: 'primary',
        },
      ],
    })
    expect(new Date(response.body.data.asOf).toISOString()).toBe(response.body.data.asOf)
    expect(response.body.data.modules.every((module: { metrics: unknown[] }) => module.metrics.length === 0)).toBe(true)
  })

  it('selects finance over coordinator without composing templates or exposing create action', async () => {
    const cookie = await loginAs(app, createdUsernames[0])
    const response = await authRequest(app, cookie).get('/api/workbench').expect(200)

    expect(response.body.data.template).toBe('finance')
    expect(response.body.data.modules.map((module: { key: string }) => module.key)).toEqual([
      'finance-receivables',
      'finance-funds',
    ])
    expect(response.body.data.actions).toEqual([])
  })

  it('omits a module when the selected template lacks one of its required permissions', async () => {
    const financeRole = await prisma.role.findUniqueOrThrow({
      where: { name: PRESET_ROLE_NAMES.FINANCE },
      select: { id: true },
    })
    const transactionPermission = await prisma.permission.findUniqueOrThrow({
      where: { key: '/finance/transactions' },
      select: { id: true },
    })
    const relation = {
      roleId: financeRole.id,
      permissionId: transactionPermission.id,
    }

    await prisma.rolePermission.delete({ where: { roleId_permissionId: relation } })
    try {
      const cookie = await loginAs(app, createdUsernames[0])
      const response = await authRequest(app, cookie).get('/api/workbench').expect(200)

      expect(response.body.data.template).toBe('finance')
      expect(response.body.data.modules.map((module: { key: string }) => module.key)).toEqual([
        'finance-receivables',
      ])
    } finally {
      await prisma.rolePermission.create({ data: relation })
    }
  })

  it('selects organization admin first and presents create departure as a secondary entry', async () => {
    const cookie = await loginAs(app, createdUsernames[1])
    const response = await authRequest(app, cookie).get('/api/workbench').expect(200)

    expect(response.body.data.template).toBe('organization_admin')
    expect(response.body.data.modules.map((module: { key: string }) => module.key)).toEqual([
      'organization-scale',
      'organization-risk',
    ])
    expect(response.body.data.actions).toEqual([
      {
        key: 'create-departure',
        label: '新建发团',
        href: '/departure/new',
        requiredPermission: 'departure:write',
        emphasis: 'secondary',
      },
    ])
  })

  it('derives Organization only from the authenticated session', async () => {
    const cookie = await loginAs(app, 'acai')
    const response = await authRequest(app, cookie)
      .get('/api/workbench?organizationId=forged-organization')
      .expect(200)
    const user = await prisma.user.findFirstOrThrow({
      where: { username: 'acai', deletedAt: null },
      include: { organization: true },
    })

    expect(response.body.data.organization).toEqual({
      id: user.organizationId,
      name: user.organization.name,
    })
  })
})
