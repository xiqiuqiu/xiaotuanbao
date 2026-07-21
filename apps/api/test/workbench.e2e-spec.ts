import { INestApplication } from '@nestjs/common'
import { PaymentScheduleSourceType, PRESET_ROLE_NAMES } from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  DepartureStatus,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  ResourceKind,
  PaymentScheduleDirection,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
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
    expect(response.body.data.modules[0].metrics).toHaveLength(4)
    expect(response.body.data.modules[1].metrics).toHaveLength(1)
    expect(response.body.data.modules[2].metrics).toHaveLength(0)
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

  it('returns coordinator recent-departure metrics, structured data gaps and matching drill-down totals', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const addDays = (value: string, days: number) => {
      const date = new Date(`${value}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + days)
      return date.toISOString().slice(0, 10)
    }
    const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
    const suffix = Date.now().toString(26).replace(/[^a-z]/g, 'a').slice(-3).toUpperCase()
    const username = `e2e-workbench-coordinator-${Date.now()}`
    const organization = await prisma.organization.create({
      data: {
        name: `工作台计调测试旅行社-${Date.now()}`,
        businessPrefix: `W${suffix}`,
      },
    })
    const coordinatorRole = await prisma.role.findUniqueOrThrow({
      where: { name: PRESET_ROLE_NAMES.COORDINATOR },
      select: { id: true },
    })
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        username,
        passwordHash: await hash('admin123', 10),
        name: '计调测试员',
        roles: { create: { roleId: coordinatorRole.id } },
      },
    })
    const partner = await prisma.partner.create({
      data: {
        organizationId: organization.id,
        name: '工作台测试客源',
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: organization.id,
        name: '工作台测试供应商',
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    let departureSequence = 0

    const createDeparture = async (input: {
      name: string
      startOffset: number
      endOffset: number
      status?: DepartureStatus
      sourceOrder?: { guestCount: number; recordedGuests: number }
      segments?: Array<{ hasResource: boolean }>
    }) => {
      departureSequence += 1
      return prisma.departure.create({
        data: {
          organizationId: organization.id,
          departureNo: `WBT${String(departureSequence).padStart(10, '0')}`,
          name: input.name,
          routeName: '工作台测试路线',
          startDate: asDate(addDays(today, input.startOffset)),
          endDate: asDate(addDays(today, input.endOffset)),
          dayCount: input.endOffset - input.startOffset + 1,
          ownerUserId: user.id,
          status: input.status ?? DepartureStatus.editing,
          ...(input.sourceOrder
            ? {
                sourceOrders: {
                  create: {
                    partnerId: partner.id,
                    displayName: `${input.name}客源`,
                    guestCount: input.sourceOrder.guestCount,
                    adultGuestCount: input.sourceOrder.guestCount,
                    childGuestCount: 0,
                    adultUnitPriceCents: 10000,
                    childUnitPriceCents: 0,
                    grossReceivableCents: input.sourceOrder.guestCount * 10000,
                    discountType: SourceOrderDiscountType.none,
                    discountCents: 0,
                    netReceivableCents: input.sourceOrder.guestCount * 10000,
                    collectionMode: SourceOrderCollectionMode.partner_settled,
                    partnerCollectedCents: input.sourceOrder.guestCount * 10000,
                    guestCollectCents: 0,
                    guests: {
                      create: Array.from({ length: input.sourceOrder.recordedGuests }, (_, index) => ({
                        name: `${input.name}客人${index + 1}`,
                      })),
                    },
                  },
                },
              }
            : {}),
          ...(input.segments
            ? {
                itinerarySegments: {
                  create: input.segments.map((segment, index) => ({
                    name: `${input.name}行程段${index + 1}`,
                    sortOrder: index + 1,
                    resources: segment.hasResource
                      ? {
                          create: {
                            resourceKind: ResourceKind.transport,
                            counterpartyType: CounterpartyType.supplier,
                            supplierId: supplier.id,
                            title: `${input.name}用车`,
                            amountCents: 10000,
                          },
                        }
                      : undefined,
                  })),
                },
              }
            : {}),
        },
      })
    }

    try {
      await createDeparture({ name: '今日出发资料缺失', startOffset: 0, endOffset: 2 })
      await createDeparture({
        name: '进行中资料完整',
        startOffset: -1,
        endOffset: 0,
        sourceOrder: { guestCount: 1, recordedGuests: 1 },
        segments: [{ hasResource: true }],
      })
      await createDeparture({
        name: '明日出发名单待补',
        startOffset: 1,
        endOffset: 3,
        sourceOrder: { guestCount: 2, recordedGuests: 1 },
        segments: [{ hasResource: true }, { hasResource: false }],
      })
      await createDeparture({
        name: '明日出发资料完整',
        startOffset: 1,
        endOffset: 3,
        sourceOrder: { guestCount: 1, recordedGuests: 1 },
        segments: [{ hasResource: true }],
      })
      await createDeparture({
        name: '七日后无任何资源',
        startOffset: 7,
        endOffset: 8,
        sourceOrder: { guestCount: 1, recordedGuests: 1 },
        segments: [{ hasResource: false }],
      })
      await createDeparture({ name: '八日后不计入', startOffset: 8, endOffset: 9 })
      await createDeparture({
        name: '已关闭不计入',
        startOffset: 1,
        endOffset: 2,
        status: DepartureStatus.closed,
      })

      const cookie = await loginAs(app, username)
      const response = await authRequest(app, cookie).get('/api/workbench').expect(200)
      const coordinatorModule = response.body.data.modules.find(
        (module: { key: string }) => module.key === 'coordinator-departures',
      )

      expect(coordinatorModule).toMatchObject({
        key: 'coordinator-departures',
        total: 5,
        href: expect.stringContaining('operationalWindow=current_and_next_7_days'),
        metrics: [
          { key: 'in-progress', label: '进行中发团', value: 2, suffix: '个发团' },
          { key: 'next-7-days', label: '未来 7 天发团', value: 3, suffix: '个发团' },
          { key: 'data-gaps', label: '资料待补充', value: 3, suffix: '个发团' },
          { key: 'settlement-ready', label: '可确认结清', value: 0, suffix: '个发团' },
        ],
      })
      expect(coordinatorModule.items).toHaveLength(5)
      expect(coordinatorModule.items.map((item: { title: string }) => item.title)).toEqual([
        '今日出发资料缺失',
        '进行中资料完整',
        '明日出发名单待补',
        '明日出发资料完整',
        '七日后无任何资源',
      ])
      expect(coordinatorModule.items[0]).toMatchObject({
        kind: 'coordinator-departure',
        ownerName: '计调测试员',
        startDate: today,
        endDate: addDays(today, 2),
        timeHint: '今日出发',
        status: 'editing',
        href: expect.stringMatching(/^\/departure\//),
        dataGaps: [
          { code: 'no_source_orders', label: '无客源单' },
          { code: 'no_itinerary_segments', label: '无行程段' },
        ],
        pendingReceivableCount: 0,
      })
      expect(coordinatorModule.items[1]).toMatchObject({
        timeHint: '进行中',
        dataGaps: [],
        pendingReceivableCount: 1,
      })
      expect(coordinatorModule.items[2]).toMatchObject({
        timeHint: '1 天后出发',
        dataGaps: [{ code: 'incomplete_guest_roster', label: '客人名单待补充' }],
      })
      expect(coordinatorModule.items[3]).toMatchObject({
        timeHint: '1 天后出发',
        dataGaps: [],
      })
      expect(coordinatorModule.items[4]).toMatchObject({
        timeHint: '7 天后出发',
        dataGaps: [{ code: 'no_segment_resources', label: '无行程资源' }],
      })

      for (const metric of coordinatorModule.metrics) {
        const drillDown = await authRequest(app, cookie)
          .get(metric.href.replace('/departure', '/api/departures'))
          .expect(200)
        expect(drillDown.body.data.total).toBe(metric.value)
      }
      const viewAll = await authRequest(app, cookie)
        .get(coordinatorModule.href.replace('/departure', '/api/departures'))
        .expect(200)
      expect(viewAll.body.data.total).toBe(coordinatorModule.total)

      const incompleteOrder = await prisma.sourceOrder.findFirstOrThrow({
        where: {
          departure: { organizationId: organization.id, name: '明日出发名单待补' },
        },
      })
      await prisma.sourceOrderGuest.create({
        data: { sourceOrderId: incompleteOrder.id, name: '补录客人' },
      })

      const refreshed = await authRequest(app, cookie).get('/api/workbench').expect(200)
      const refreshedModule = refreshed.body.data.modules.find(
        (module: { key: string }) => module.key === 'coordinator-departures',
      )
      expect(refreshedModule.metrics[2].value).toBe(2)
      expect(
        refreshedModule.items.find(
          (item: { title: string }) => item.title === '明日出发名单待补',
        ).dataGaps,
      ).toEqual([])
    } finally {
      await prisma.sourceOrderGuest.deleteMany({
        where: { sourceOrder: { departure: { organizationId: organization.id } } },
      })
      await prisma.sourceOrder.deleteMany({
        where: { departure: { organizationId: organization.id } },
      })
      await prisma.segmentResource.deleteMany({
        where: { segment: { departure: { organizationId: organization.id } } },
      })
      await prisma.itinerarySegment.deleteMany({
        where: { departure: { organizationId: organization.id } },
      })
      await prisma.departure.deleteMany({ where: { organizationId: organization.id } })
      await prisma.partner.deleteMany({ where: { organizationId: organization.id } })
      await prisma.supplier.deleteMany({ where: { organizationId: organization.id } })
      await prisma.userRole.deleteMany({ where: { user: { organizationId: organization.id } } })
      await prisma.user.deleteMany({ where: { organizationId: organization.id } })
      await prisma.organization.delete({ where: { id: organization.id } })
    }
  })

  it('returns settlement-ready departures and only ungenerated receivable source orders with matching drill-down totals', async () => {
    const suffix = Date.now().toString(26).replace(/[^a-z]/g, 'a').slice(-3).toUpperCase()
    const username = `e2e-workbench-settlement-${Date.now()}`
    const organization = await prisma.organization.create({
      data: {
        name: `工作台结算测试旅行社-${Date.now()}`,
        businessPrefix: `S${suffix}`,
      },
    })
    const coordinatorRole = await prisma.role.findUniqueOrThrow({
      where: { name: PRESET_ROLE_NAMES.COORDINATOR },
      select: { id: true },
    })
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        username,
        passwordHash: await hash('admin123', 10),
        name: '结算计调测试员',
        roles: { create: { roleId: coordinatorRole.id } },
      },
    })
    const partner = await prisma.partner.create({
      data: {
        organizationId: organization.id,
        name: '结算测试客源',
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: organization.id,
        name: '结算测试供应商',
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    let sequence = 0
    const createDepartureWithOrder = async (name: string, status: DepartureStatus) => {
      sequence += 1
      return prisma.departure.create({
        data: {
          organizationId: organization.id,
          departureNo: `WBS${String(sequence).padStart(10, '0')}`,
          name,
          routeName: '结算测试路线',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-03T00:00:00.000Z'),
          dayCount: 3,
          ownerUserId: user.id,
          status,
          sourceOrders: {
            create: {
              partnerId: partner.id,
              displayName: `${name}客源单`,
              guestCount: 1,
              adultGuestCount: 1,
              childGuestCount: 0,
              adultUnitPriceCents: 10000,
              childUnitPriceCents: 0,
              grossReceivableCents: 10000,
              discountType: SourceOrderDiscountType.none,
              discountCents: 0,
              netReceivableCents: 10000,
              collectionMode: SourceOrderCollectionMode.partner_settled,
              partnerCollectedCents: 10000,
              guestCollectCents: 0,
            },
          },
        },
        include: { sourceOrders: true },
      })
    }

    try {
      const ready = await createDepartureWithOrder(
        '账款均关闭可确认结清',
        DepartureStatus.pending_settlement,
      )
      const open = await createDepartureWithOrder(
        '仍有开放账款不可结清',
        DepartureStatus.pending_settlement,
      )
      await createDepartureWithOrder('没有账款不可结清', DepartureStatus.pending_settlement)
      for (let index = 1; index <= 6; index += 1) {
        await createDepartureWithOrder(`待生成应收 ${index}`, DepartureStatus.editing)
      }

      await prisma.itinerarySegment.create({
        data: {
          departureId: open.id,
          name: '存在待生成应付的行程段',
          sortOrder: 1,
          resources: {
            create: {
              resourceKind: ResourceKind.transport,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplier.id,
              title: '待生成应付资源',
              amountCents: 5000,
            },
          },
        },
      })

      await prisma.paymentSchedule.createMany({
        data: [
          {
            organizationId: organization.id,
            departureId: ready.id,
            direction: PaymentScheduleDirection.receivable,
            scheduleNo: 'WBS-AR-0001',
            title: '已关闭应收',
            amountCents: 10000,
            dueDate: new Date('2026-06-01T00:00:00.000Z'),
            counterpartyType: CounterpartyType.partner,
            counterpartyId: partner.id,
            counterpartyName: partner.name,
            sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
            sourceId: ready.sourceOrders[0].id,
            cancelledAt: new Date('2026-06-02T00:00:00.000Z'),
          },
          {
            organizationId: organization.id,
            departureId: open.id,
            direction: PaymentScheduleDirection.receivable,
            scheduleNo: 'WBS-AR-0002',
            title: '开放应收',
            amountCents: 10000,
            dueDate: new Date('2026-06-01T00:00:00.000Z'),
            counterpartyType: CounterpartyType.partner,
            counterpartyId: partner.id,
            counterpartyName: partner.name,
            sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
            sourceId: open.sourceOrders[0].id,
          },
        ],
      })

      const cookie = await loginAs(app, username)
      const response = await authRequest(app, cookie).get('/api/workbench').expect(200)
      const departureModule = response.body.data.modules.find(
        (module: { key: string }) => module.key === 'coordinator-departures',
      )
      const settlementModule = response.body.data.modules.find(
        (module: { key: string }) => module.key === 'coordinator-settlement',
      )

      expect(departureModule.metrics[3]).toMatchObject({
        key: 'settlement-ready',
        label: '可确认结清',
        value: 1,
        suffix: '个发团',
        href: '/departure?settlementReadiness=ready',
      })
      expect(settlementModule.metrics).toEqual([
        expect.objectContaining({
          key: 'pending-receivables',
          label: '待生成应收',
          value: 7,
          suffix: '个客源单',
          href: '/source-orders?receivableGeneration=not_generated',
        }),
      ])
      expect(settlementModule.items.filter(
        (item: { kind: string }) => item.kind === 'coordinator-settlement-ready',
      )).toHaveLength(1)
      expect(settlementModule.items.filter(
        (item: { kind: string }) => item.kind === 'coordinator-receivable-pending',
      )).toHaveLength(5)
      expect(JSON.stringify(settlementModule)).not.toContain('payable')
      expect(JSON.stringify(response.body.data)).not.toContain('待提交结算')

      const financeCookie = await loginAs(app, createdUsernames[0])
      const financeWorkbench = await authRequest(app, financeCookie)
        .get('/api/workbench')
        .expect(200)
      expect(financeWorkbench.body.data.template).toBe('finance')
      expect(JSON.stringify(financeWorkbench.body.data)).not.toContain('settlement-ready')

      const readyList = await authRequest(app, cookie)
        .get('/api/departures?settlementReadiness=ready')
        .expect(200)
      expect(readyList.body.data.total).toBe(departureModule.metrics[3].value)

      const pendingReceivables = await authRequest(app, cookie)
        .get('/api/source-orders?receivableGeneration=not_generated&pageSize=100')
        .expect(200)
      expect(pendingReceivables.body.data.total).toBe(settlementModule.metrics[0].value)
      expect(pendingReceivables.body.data.items).toHaveLength(7)
    } finally {
      await prisma.paymentSchedule.deleteMany({ where: { organizationId: organization.id } })
      await prisma.sourceOrder.deleteMany({
        where: { departure: { organizationId: organization.id } },
      })
      await prisma.segmentResource.deleteMany({
        where: { segment: { departure: { organizationId: organization.id } } },
      })
      await prisma.itinerarySegment.deleteMany({
        where: { departure: { organizationId: organization.id } },
      })
      await prisma.departure.deleteMany({ where: { organizationId: organization.id } })
      await prisma.partner.deleteMany({ where: { organizationId: organization.id } })
      await prisma.supplier.deleteMany({ where: { organizationId: organization.id } })
      await prisma.userRole.deleteMany({ where: { user: { organizationId: organization.id } } })
      await prisma.user.deleteMany({ where: { organizationId: organization.id } })
      await prisma.organization.delete({ where: { id: organization.id } })
    }
  })
})
