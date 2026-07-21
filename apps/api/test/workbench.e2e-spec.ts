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
  TransactionDirection,
  PaymentChannel,
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
    expect(response.body.data.modules[2].buckets).toHaveLength(14)
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
    expect(response.body.data.modules[0]).toMatchObject({
      key: 'organization-scale',
      metrics: [
        { key: 'month-departures', label: '本月发团数' },
        { key: 'month-guests', label: '本月客源人次' },
      ],
    })
    expect(response.body.data.modules[0].buckets).toHaveLength(6)
    expect(response.body.data.modules[0].buckets[5].inProgress).toBe(true)
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

  it('returns coordinator 14-day trend buckets with guest totals, zero days and matching drill-downs', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const addDays = (value: string, days: number) => {
      const date = new Date(`${value}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + days)
      return date.toISOString().slice(0, 10)
    }
    const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
    const suffix = Date.now().toString(26).replace(/[^a-z]/g, 'a').slice(-3).toUpperCase()
    const username = `e2e-workbench-trend-${Date.now()}`
    const organization = await prisma.organization.create({
      data: {
        name: `工作台趋势测试旅行社-${Date.now()}`,
        businessPrefix: `T${suffix}`,
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
        name: '趋势计调测试员',
        roles: { create: { roleId: coordinatorRole.id } },
      },
    })
    const partner = await prisma.partner.create({
      data: {
        organizationId: organization.id,
        name: '趋势测试客源',
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: organization.id,
        name: '趋势测试供应商',
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
      guestCounts?: number[]
      completeMaterials?: boolean
    }) => {
      departureSequence += 1
      const guestCounts = input.guestCounts ?? (input.completeMaterials ? [1] : undefined)
      return prisma.departure.create({
        data: {
          organizationId: organization.id,
          departureNo: `WTT${String(departureSequence).padStart(10, '0')}`,
          name: input.name,
          routeName: '趋势测试路线',
          startDate: asDate(addDays(today, input.startOffset)),
          endDate: asDate(addDays(today, input.endOffset)),
          dayCount: input.endOffset - input.startOffset + 1,
          ownerUserId: user.id,
          status: input.status ?? DepartureStatus.editing,
          ...(guestCounts
            ? {
                sourceOrders: {
                  create: guestCounts.map((guestCount, index) => ({
                    partnerId: partner.id,
                    displayName: `${input.name}客源${index + 1}`,
                    guestCount,
                    adultGuestCount: guestCount,
                    childGuestCount: 0,
                    adultUnitPriceCents: 10000,
                    childUnitPriceCents: 0,
                    grossReceivableCents: guestCount * 10000,
                    discountType: SourceOrderDiscountType.none,
                    discountCents: 0,
                    netReceivableCents: guestCount * 10000,
                    collectionMode: SourceOrderCollectionMode.partner_settled,
                    partnerCollectedCents: guestCount * 10000,
                    guestCollectCents: 0,
                    ...(input.completeMaterials
                      ? {
                          guests: {
                            create: Array.from({ length: guestCount }, (_, guestIndex) => ({
                              name: `${input.name}客人${guestIndex + 1}`,
                            })),
                          },
                        }
                      : {}),
                  })),
                },
              }
            : {}),
          ...(input.completeMaterials
            ? {
                itinerarySegments: {
                  create: {
                    name: `${input.name}行程段`,
                    sortOrder: 1,
                    resources: {
                      create: {
                        resourceKind: ResourceKind.transport,
                        counterpartyType: CounterpartyType.supplier,
                        supplierId: supplier.id,
                        title: `${input.name}用车`,
                        amountCents: 10000,
                      },
                    },
                  },
                },
              }
            : {}),
        },
      })
    }

    try {
      await createDeparture({ name: '今日不入桶', startOffset: 0, endOffset: 1, guestCounts: [9] })
      await createDeparture({
        name: '明日团 A',
        startOffset: 1,
        endOffset: 2,
        guestCounts: [3, 2],
      })
      await createDeparture({
        name: '明日团 B 完整',
        startOffset: 1,
        endOffset: 2,
        completeMaterials: true,
      })
      await createDeparture({
        name: '明日已关闭',
        startOffset: 1,
        endOffset: 2,
        status: DepartureStatus.closed,
        guestCounts: [20],
      })
      await createDeparture({
        name: '十四日后入桶',
        startOffset: 14,
        endOffset: 15,
        guestCounts: [4],
      })
      await createDeparture({
        name: '十五日后不入桶',
        startOffset: 15,
        endOffset: 16,
        guestCounts: [8],
      })

      const cookie = await loginAs(app, username)
      const response = await authRequest(app, cookie).get('/api/workbench').expect(200)
      const trendModule = response.body.data.modules.find(
        (module: { key: string }) => module.key === 'coordinator-trend',
      )

      expect(trendModule.buckets).toHaveLength(14)
      expect(trendModule.buckets[0].date).toBe(addDays(today, 1))
      expect(trendModule.buckets[13].date).toBe(addDays(today, 14))
      expect(trendModule.buckets.every((bucket: { date: string }, index: number) =>
        bucket.date === addDays(today, index + 1),
      )).toBe(true)

      const tomorrow = trendModule.buckets[0]
      expect(tomorrow).toMatchObject({
        date: addDays(today, 1),
        departureCount: 2,
        guestCount: 6,
        dataGapDepartureCount: 1,
        href: `/departure?startDateFrom=${addDays(today, 1)}&startDateTo=${addDays(today, 1)}&excludeClosed=1`,
      })

      const dayFourteen = trendModule.buckets[13]
      expect(dayFourteen).toMatchObject({
        date: addDays(today, 14),
        departureCount: 1,
        guestCount: 4,
        dataGapDepartureCount: 1,
      })

      const emptyDay = trendModule.buckets[1]
      expect(emptyDay).toMatchObject({
        date: addDays(today, 2),
        departureCount: 0,
        guestCount: 0,
        dataGapDepartureCount: 0,
      })

      for (const bucket of [tomorrow, dayFourteen, emptyDay]) {
        const drillDown = await authRequest(app, cookie)
          .get(bucket.href.replace('/departure', '/api/departures'))
          .expect(200)
        expect(drillDown.body.data.total).toBe(bucket.departureCount)
      }
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

  it('returns organization-admin month scale metrics with closed departures, guest totals and matching drill-downs', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const addDays = (value: string, days: number) => {
      const date = new Date(`${value}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + days)
      return date.toISOString().slice(0, 10)
    }
    const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
    const monthKey = (value: string) => value.slice(0, 7)
    const monthStart = (value: string) => `${monthKey(value)}-01`
    const monthEnd = (value: string) => {
      const [year, month] = value.split('-').map(Number)
      return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    }
    const shiftMonth = (value: string, offset: number) => {
      const [year, month] = value.split('-').map(Number)
      const cursor = new Date(Date.UTC(year, month - 1 + offset, 1))
      return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    }
    const daysBetween = (from: string, to: string) =>
      Math.round((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000)

    const currentMonth = monthKey(today)
    const previousMonth = shiftMonth(currentMonth, -1)
    const sixMonthsAgo = shiftMonth(currentMonth, -5)
    const sevenMonthsAgo = shiftMonth(currentMonth, -6)
    const previousMonthLastDay = monthEnd(`${previousMonth}-01`)
    const currentMonthFirstDay = monthStart(today)
    const suffix = Date.now().toString(26).replace(/[^a-z]/g, 'a').slice(-3).toUpperCase()
    const username = `e2e-workbench-scale-${Date.now()}`
    const organization = await prisma.organization.create({
      data: {
        name: `工作台规模测试旅行社-${Date.now()}`,
        businessPrefix: `S${suffix}`,
      },
    })
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: PRESET_ROLE_NAMES.ORG_ADMIN },
      select: { id: true },
    })
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        username,
        passwordHash: await hash('admin123', 10),
        name: '规模管理员测试员',
        roles: { create: { roleId: adminRole.id } },
      },
    })
    const partner = await prisma.partner.create({
      data: {
        organizationId: organization.id,
        name: '规模测试客源',
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    let departureSequence = 0
    const createDeparture = async (input: {
      name: string
      startDate: string
      endDate: string
      status?: DepartureStatus
      guestCounts?: number[]
    }) => {
      departureSequence += 1
      return prisma.departure.create({
        data: {
          organizationId: organization.id,
          departureNo: `WTS${String(departureSequence).padStart(10, '0')}`,
          name: input.name,
          routeName: '规模测试路线',
          startDate: asDate(input.startDate),
          endDate: asDate(input.endDate),
          dayCount: daysBetween(input.startDate, input.endDate) + 1,
          ownerUserId: user.id,
          status: input.status ?? DepartureStatus.editing,
          ...(input.guestCounts
            ? {
                sourceOrders: {
                  create: input.guestCounts.map((guestCount, index) => ({
                    partnerId: partner.id,
                    displayName: `${input.name}客源${index + 1}`,
                    guestCount,
                    adultGuestCount: guestCount,
                    childGuestCount: 0,
                    adultUnitPriceCents: 10000,
                    childUnitPriceCents: 0,
                    grossReceivableCents: guestCount * 10000,
                    discountType: SourceOrderDiscountType.none,
                    discountCents: 0,
                    netReceivableCents: guestCount * 10000,
                    collectionMode: SourceOrderCollectionMode.partner_settled,
                    partnerCollectedCents: guestCount * 10000,
                    guestCollectCents: 0,
                  })),
                },
              }
            : {}),
        },
      })
    }

    try {
      await createDeparture({
        name: '上月末边界',
        startDate: previousMonthLastDay,
        endDate: addDays(previousMonthLastDay, 1),
        guestCounts: [4],
      })
      await createDeparture({
        name: '本月初边界',
        startDate: currentMonthFirstDay,
        endDate: addDays(currentMonthFirstDay, 2),
        guestCounts: [3, 2],
      })
      await createDeparture({
        name: '本月已关闭',
        startDate: today,
        endDate: addDays(today, 1),
        status: DepartureStatus.closed,
        guestCounts: [7],
      })
      await createDeparture({
        name: '六个月前入桶',
        startDate: `${sixMonthsAgo}-15`,
        endDate: addDays(`${sixMonthsAgo}-15`, 1),
        guestCounts: [1],
      })
      await createDeparture({
        name: '七个月前不入桶',
        startDate: `${sevenMonthsAgo}-15`,
        endDate: addDays(`${sevenMonthsAgo}-15`, 1),
        guestCounts: [9],
      })

      const cookie = await loginAs(app, username)
      const response = await authRequest(app, cookie).get('/api/workbench').expect(200)
      const scaleModule = response.body.data.modules.find(
        (module: { key: string }) => module.key === 'organization-scale',
      )

      expect(scaleModule.buckets).toHaveLength(6)
      expect(scaleModule.buckets[0].month).toBe(sixMonthsAgo)
      expect(scaleModule.buckets[5].month).toBe(currentMonth)
      expect(scaleModule.buckets[5].inProgress).toBe(true)
      expect(scaleModule.buckets.slice(0, 5).every(
        (bucket: { inProgress: boolean }) => bucket.inProgress === false,
      )).toBe(true)

      const previousBucket = scaleModule.buckets.find(
        (bucket: { month: string }) => bucket.month === previousMonth,
      )
      expect(previousBucket).toMatchObject({
        month: previousMonth,
        monthStart: monthStart(`${previousMonth}-01`),
        monthEnd: previousMonthLastDay,
        departureCount: 1,
        guestCount: 4,
        inProgress: false,
        href: `/departure?startDateFrom=${monthStart(`${previousMonth}-01`)}&startDateTo=${previousMonthLastDay}`,
      })

      const currentBucket = scaleModule.buckets[5]
      expect(currentBucket).toMatchObject({
        month: currentMonth,
        monthStart: currentMonthFirstDay,
        monthEnd: monthEnd(today),
        departureCount: 2,
        guestCount: 12,
        inProgress: true,
        href: `/departure?startDateFrom=${currentMonthFirstDay}&startDateTo=${monthEnd(today)}`,
      })

      expect(scaleModule.metrics).toEqual([
        {
          key: 'month-departures',
          label: '本月发团数',
          value: 2,
          suffix: '个发团',
          href: currentBucket.href,
        },
        {
          key: 'month-guests',
          label: '本月客源人次',
          value: 12,
          suffix: '人次',
          href: currentBucket.href,
        },
      ])
      expect(JSON.stringify(scaleModule)).not.toMatch(/预测|环比|收入|支出|毛利/)

      const oldestBucket = scaleModule.buckets[0]
      expect(oldestBucket).toMatchObject({
        month: sixMonthsAgo,
        departureCount: 1,
        guestCount: 1,
      })

      for (const bucket of [previousBucket, currentBucket, oldestBucket]) {
        const drillDown = await authRequest(app, cookie)
          .get(bucket.href.replace('/departure', '/api/departures'))
          .expect(200)
        expect(drillDown.body.data.total).toBe(bucket.departureCount)
        const guestTotal = drillDown.body.data.items.reduce(
          (sum: number, item: { totalGuests: number }) => sum + item.totalGuests,
          0,
        )
        expect(guestTotal).toBe(bucket.guestCount)
      }
    } finally {
      await prisma.sourceOrder.deleteMany({
        where: { departure: { organizationId: organization.id } },
      })
      await prisma.departure.deleteMany({ where: { organizationId: organization.id } })
      await prisma.partner.deleteMany({ where: { organizationId: organization.id } })
      await prisma.userRole.deleteMany({ where: { user: { organizationId: organization.id } } })
      await prisma.user.deleteMany({ where: { organizationId: organization.id } })
      await prisma.organization.delete({ where: { id: organization.id } })
    }
  })

  it('returns finance receivable follow-up metrics, aging buckets, closed-departure markers and matching drill-downs', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const addDays = (value: string, days: number) => {
      const date = new Date(`${value}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + days)
      return date.toISOString().slice(0, 10)
    }
    const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
    const daysBetween = (from: string, to: string) =>
      Math.round((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000)
    const suffix = Date.now().toString(26).replace(/[^a-z]/g, 'a').slice(-3).toUpperCase()
    const username = `e2e-workbench-ar-${Date.now()}`
    const organization = await prisma.organization.create({
      data: {
        name: `工作台应收测试旅行社-${Date.now()}`,
        businessPrefix: `R${suffix}`,
      },
    })
    const financeRole = await prisma.role.findUniqueOrThrow({
      where: { name: PRESET_ROLE_NAMES.FINANCE },
      select: { id: true },
    })
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        username,
        passwordHash: await hash('admin123', 10),
        name: '应收财务测试员',
        roles: { create: { roleId: financeRole.id } },
      },
    })
    const partner = await prisma.partner.create({
      data: {
        organizationId: organization.id,
        name: '应收测试客源',
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })

    let departureSequence = 0
    const createDeparture = async (input: {
      name: string
      status?: DepartureStatus
    }) => {
      departureSequence += 1
      return prisma.departure.create({
        data: {
          organizationId: organization.id,
          departureNo: `WTR${String(departureSequence).padStart(10, '0')}`,
          name: input.name,
          routeName: '应收测试路线',
          startDate: asDate(addDays(today, -10)),
          endDate: asDate(addDays(today, -3)),
          dayCount: daysBetween(addDays(today, -10), addDays(today, -3)) + 1,
          ownerUserId: user.id,
          status: input.status ?? DepartureStatus.editing,
        },
      })
    }

    const openDeparture = await createDeparture({ name: '开放发团' })
    const closedDeparture = await createDeparture({
      name: '已关闭发团',
      status: DepartureStatus.closed,
    })

    let scheduleSequence = 0
    const createReceivable = async (input: {
      title: string
      dueDate: string
      amountCents: number
      departureId: string
      cancelledAt?: Date | null
      voidedAt?: Date | null
    }) => {
      scheduleSequence += 1
      return prisma.paymentSchedule.create({
        data: {
          organizationId: organization.id,
          departureId: input.departureId,
          direction: PaymentScheduleDirection.receivable,
          scheduleNo: `WTR-AR-${String(scheduleSequence).padStart(4, '0')}`,
          title: input.title,
          amountCents: input.amountCents,
          dueDate: asDate(input.dueDate),
          counterpartyType: CounterpartyType.partner,
          counterpartyId: partner.id,
          counterpartyName: partner.name,
          sourceType: PaymentScheduleSourceType.MANUAL,
          cancelledAt: input.cancelledAt ?? null,
          voidedAt: input.voidedAt ?? null,
        },
      })
    }

    try {
      const aging7 = await createReceivable({
        title: '账龄7天',
        dueDate: addDays(today, -7),
        amountCents: 70000,
        departureId: openDeparture.id,
      })
      const aging8 = await createReceivable({
        title: '账龄8天',
        dueDate: addDays(today, -8),
        amountCents: 80000,
        departureId: openDeparture.id,
      })
      const aging30 = await createReceivable({
        title: '账龄30天',
        dueDate: addDays(today, -30),
        amountCents: 300000,
        departureId: openDeparture.id,
      })
      const aging31 = await createReceivable({
        title: '账龄31天',
        dueDate: addDays(today, -31),
        amountCents: 310000,
        departureId: closedDeparture.id,
      })
      const dueToday = await createReceivable({
        title: '今天到期',
        dueDate: today,
        amountCents: 10000,
        departureId: openDeparture.id,
      })
      const dueDay7 = await createReceivable({
        title: '第7天到期',
        dueDate: addDays(today, 7),
        amountCents: 17000,
        departureId: openDeparture.id,
      })
      await createReceivable({
        title: '第8天不入近期',
        dueDate: addDays(today, 8),
        amountCents: 18000,
        departureId: openDeparture.id,
      })
      await createReceivable({
        title: '已关闭节点',
        dueDate: addDays(today, -3),
        amountCents: 50000,
        departureId: openDeparture.id,
        cancelledAt: asDate(today),
      })
      await createReceivable({
        title: '已作废节点',
        dueDate: addDays(today, -4),
        amountCents: 60000,
        departureId: openDeparture.id,
        voidedAt: asDate(today),
      })
      await createReceivable({
        title: '超额队列A',
        dueDate: addDays(today, -2),
        amountCents: 2000,
        departureId: openDeparture.id,
      })
      await createReceivable({
        title: '超额队列B',
        dueDate: addDays(today, -1),
        amountCents: 1000,
        departureId: openDeparture.id,
      })
      await createReceivable({
        title: '超额队列C',
        dueDate: addDays(today, 1),
        amountCents: 3000,
        departureId: openDeparture.id,
      })

      const cookie = await loginAs(app, username)
      const response = await authRequest(app, cookie).get('/api/workbench').expect(200)
      expect(response.body.data.template).toBe('finance')
      const receivablesModule = response.body.data.modules.find(
        (module: { key: string }) => module.key === 'finance-receivables',
      )

      expect(receivablesModule.metrics).toEqual([
        {
          key: 'overdue-receivables',
          label: '逾期应收',
          value: 70000 + 80000 + 300000 + 310000 + 2000 + 1000,
          secondaryValue: 6,
          secondarySuffix: '个节点',
          href: '/finance/receivable?receivableFollowUp=overdue',
        },
        {
          key: 'due-within-7-days',
          label: '未来 7 天到期应收',
          value: 10000 + 17000 + 3000,
          secondaryValue: 3,
          secondarySuffix: '个节点',
          href: '/finance/receivable?receivableFollowUp=due_within_7_days',
        },
      ])
      expect(receivablesModule.total).toBe(9)
      expect(receivablesModule.href).toBe('/finance/receivable?receivableFollowUp=follow_up')
      expect(receivablesModule.items).toHaveLength(8)
      expect(receivablesModule.items[0]).toMatchObject({
        kind: 'finance-receivable',
        title: '账龄31天',
        overdueDays: 31,
        unsettledAmountCents: 310000,
        departureClosed: true,
      })
      expect(receivablesModule.items.map((item: { title: string }) => item.title)).toEqual([
        '账龄31天',
        '账龄30天',
        '账龄8天',
        '账龄7天',
        '超额队列A',
        '超额队列B',
        '今天到期',
        '超额队列C',
      ])
      expect(JSON.stringify(receivablesModule)).not.toContain('已关闭节点')
      expect(JSON.stringify(receivablesModule)).not.toContain('已作废节点')
      expect(JSON.stringify(receivablesModule)).not.toContain('第8天不入近期')
      expect(JSON.stringify(receivablesModule.items)).not.toContain('第7天到期')

      expect(receivablesModule.buckets).toEqual([
        {
          key: 'aging_1_7',
          label: '1–7 天',
          scheduleCount: 3,
          unsettledAmountCents: 70000 + 2000 + 1000,
          href: '/finance/receivable?receivableFollowUp=aging_1_7',
        },
        {
          key: 'aging_8_30',
          label: '8–30 天',
          scheduleCount: 2,
          unsettledAmountCents: 80000 + 300000,
          href: '/finance/receivable?receivableFollowUp=aging_8_30',
        },
        {
          key: 'aging_over_30',
          label: '30 天以上',
          scheduleCount: 1,
          unsettledAmountCents: 310000,
          href: '/finance/receivable?receivableFollowUp=aging_over_30',
        },
      ])

      const drillTargets = [
        { href: receivablesModule.metrics[0].href, total: 6 },
        { href: receivablesModule.metrics[1].href, total: 3 },
        { href: receivablesModule.href, total: 9 },
        { href: receivablesModule.buckets[0].href, total: 3 },
        { href: receivablesModule.buckets[1].href, total: 2 },
        { href: receivablesModule.buckets[2].href, total: 1 },
        { href: receivablesModule.items[0].href, total: 1 },
      ]
      for (const target of drillTargets) {
        const drillDown = await authRequest(app, cookie)
          .get(target.href.replace('/finance/receivable', '/api/finance/receivables'))
          .expect(200)
        expect(drillDown.body.data.total).toBe(target.total)
      }

      expect([aging7.id, aging8.id, aging30.id, aging31.id, dueToday.id, dueDay7.id]).toHaveLength(6)
    } finally {
      await prisma.paymentSchedule.deleteMany({ where: { organizationId: organization.id } })
      await prisma.departure.deleteMany({ where: { organizationId: organization.id } })
      await prisma.partner.deleteMany({ where: { organizationId: organization.id } })
      await prisma.userRole.deleteMany({ where: { user: { organizationId: organization.id } } })
      await prisma.user.deleteMany({ where: { organizationId: organization.id } })
      await prisma.organization.delete({ where: { id: organization.id } })
    }
  })

  it('returns finance funds metrics, pending settlement / account-generation queues and matching drill-downs', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
    const suffix = Date.now().toString(26).replace(/[^a-z]/g, 'a').slice(-3).toUpperCase()
    const username = `e2e-workbench-funds-${Date.now()}`
    const organization = await prisma.organization.create({
      data: {
        name: `工作台资金测试旅行社-${Date.now()}`,
        businessPrefix: `F${suffix}`,
      },
    })
    const financeRole = await prisma.role.findUniqueOrThrow({
      where: { name: PRESET_ROLE_NAMES.FINANCE },
      select: { id: true },
    })
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        username,
        passwordHash: await hash('admin123', 10),
        name: '资金财务测试员',
        roles: { create: { roleId: financeRole.id } },
      },
    })
    const partner = await prisma.partner.create({
      data: {
        organizationId: organization.id,
        name: '资金测试客源',
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: organization.id,
        name: '资金测试车队',
        categories: [ResourceKind.transport, ResourceKind.hotel, ResourceKind.meal],
        status: DirectoryProfileStatus.active,
      },
    })

    const openDeparture = await prisma.departure.create({
      data: {
        organizationId: organization.id,
        departureNo: 'WTF0000000001',
        name: '开放资金发团',
        routeName: '资金测试路线',
        startDate: asDate(today),
        endDate: asDate(today),
        dayCount: 1,
        ownerUserId: user.id,
        status: DepartureStatus.editing,
      },
    })
    const closedDeparture = await prisma.departure.create({
      data: {
        organizationId: organization.id,
        departureNo: 'WTF0000000002',
        name: '已关闭资金发团',
        routeName: '资金测试路线',
        startDate: asDate(today),
        endDate: asDate(today),
        dayCount: 1,
        ownerUserId: user.id,
        status: DepartureStatus.closed,
      },
    })

    let scheduleSequence = 0
    const createPayable = async (input: {
      title: string
      amountCents: number
      departureId: string
      cancelledAt?: Date | null
      voidedAt?: Date | null
      sourceType?: string
      sourceId?: string | null
    }) => {
      scheduleSequence += 1
      return prisma.paymentSchedule.create({
        data: {
          organizationId: organization.id,
          departureId: input.departureId,
          direction: PaymentScheduleDirection.payable,
          scheduleNo: `WTF-AP-${String(scheduleSequence).padStart(4, '0')}`,
          title: input.title,
          amountCents: input.amountCents,
          dueDate: asDate(today),
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplier.id,
          counterpartyName: supplier.name,
          sourceType: input.sourceType ?? PaymentScheduleSourceType.MANUAL,
          sourceId: input.sourceId ?? null,
          cancelledAt: input.cancelledAt ?? null,
          voidedAt: input.voidedAt ?? null,
        },
      })
    }

    let txSequence = 0
    const createTransaction = async (input: {
      direction: TransactionDirection
      amountCents: number
      departureId: string
      counterpartyName: string
      voidedAt?: Date | null
    }) => {
      txSequence += 1
      return prisma.financeTransaction.create({
        data: {
          organizationId: organization.id,
          transactionNo: `WTF-TX-${String(txSequence).padStart(4, '0')}`,
          direction: input.direction,
          paymentChannel: PaymentChannel.other,
          amountCents: input.amountCents,
          transactionDate: asDate(today),
          counterpartyType: CounterpartyType.partner,
          counterpartyName: input.counterpartyName,
          departureId: input.departureId,
          voidedAt: input.voidedAt ?? null,
          voidReason: input.voidedAt ? '作废测试' : null,
        },
      })
    }

    try {
      await createPayable({
        title: '开放待付A',
        amountCents: 50000,
        departureId: openDeparture.id,
      })
      await createPayable({
        title: '关闭发团待付',
        amountCents: 30000,
        departureId: closedDeparture.id,
      })
      await createPayable({
        title: '已关闭节点',
        amountCents: 90000,
        departureId: openDeparture.id,
        cancelledAt: asDate(today),
      })
      await createPayable({
        title: '已作废节点',
        amountCents: 80000,
        departureId: openDeparture.id,
        voidedAt: asDate(today),
      })
      const settledPayable = await createPayable({
        title: '已付清节点',
        amountCents: 20000,
        departureId: openDeparture.id,
      })
      const settledTx = await createTransaction({
        direction: TransactionDirection.outflow,
        amountCents: 20000,
        departureId: openDeparture.id,
        counterpartyName: '已核销支出',
      })
      await prisma.financeVerification.create({
        data: {
          organizationId: organization.id,
          verificationNo: 'WTF-VR-0001',
          paymentScheduleId: settledPayable.id,
          transactionId: settledTx.id,
          amountCents: 20000,
          verificationDate: asDate(today),
          createdBy: user.id,
          billUnsettledAfterCents: 0,
        },
      })

      const noneIncome = await createTransaction({
        direction: TransactionDirection.inflow,
        amountCents: 12000,
        departureId: openDeparture.id,
        counterpartyName: '未核销收入',
      })
      const partialExpense = await createTransaction({
        direction: TransactionDirection.outflow,
        amountCents: 10000,
        departureId: closedDeparture.id,
        counterpartyName: '部分核销支出',
      })
      await createTransaction({
        direction: TransactionDirection.inflow,
        amountCents: 7000,
        departureId: openDeparture.id,
        counterpartyName: '已作废流水',
        voidedAt: asDate(today),
      })
      const openPayableForPartial = await createPayable({
        title: '部分核销用应付',
        amountCents: 10000,
        departureId: closedDeparture.id,
      })
      await prisma.financeVerification.create({
        data: {
          organizationId: organization.id,
          verificationNo: 'WTF-VR-0002',
          paymentScheduleId: openPayableForPartial.id,
          transactionId: partialExpense.id,
          amountCents: 4000,
          verificationDate: asDate(today),
          createdBy: user.id,
          billUnsettledAfterCents: 6000,
        },
      })

      const pendingSourceOrder = await prisma.sourceOrder.create({
        data: {
          departureId: openDeparture.id,
          partnerId: partner.id,
          displayName: '待生成应收客源单',
          guestCount: 1,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 18000,
          childUnitPriceCents: 0,
          grossReceivableCents: 18000,
          discountType: SourceOrderDiscountType.none,
          discountCents: 0,
          netReceivableCents: 18000,
          collectionMode: SourceOrderCollectionMode.partner_settled,
          partnerCollectedCents: 18000,
          guestCollectCents: 0,
        },
      })
      const closedSourceOrder = await prisma.sourceOrder.create({
        data: {
          departureId: closedDeparture.id,
          partnerId: partner.id,
          displayName: '关闭发团待生成应收',
          guestCount: 1,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 9000,
          childUnitPriceCents: 0,
          grossReceivableCents: 9000,
          discountType: SourceOrderDiscountType.none,
          discountCents: 0,
          netReceivableCents: 9000,
          collectionMode: SourceOrderCollectionMode.partner_settled,
          partnerCollectedCents: 9000,
          guestCollectCents: 0,
        },
      })

      const openSegment = await prisma.itinerarySegment.create({
        data: {
          departureId: openDeparture.id,
          name: '开放行程段',
          sortOrder: 1,
        },
      })
      const closedSegment = await prisma.itinerarySegment.create({
        data: {
          departureId: closedDeparture.id,
          name: '关闭行程段',
          sortOrder: 1,
        },
      })
      const pendingResource = await prisma.segmentResource.create({
        data: {
          segmentId: openSegment.id,
          resourceKind: ResourceKind.hotel,
          counterpartyType: CounterpartyType.supplier,
          supplierId: supplier.id,
          title: '待生成应付酒店',
          amountCents: 15000,
        },
      })
      await prisma.segmentResource.create({
        data: {
          segmentId: openSegment.id,
          resourceKind: ResourceKind.transport,
          counterpartyType: CounterpartyType.supplier,
          supplierId: supplier.id,
          title: '零元不入缺口',
          amountCents: 0,
        },
      })
      const generatedResource = await prisma.segmentResource.create({
        data: {
          segmentId: closedSegment.id,
          resourceKind: ResourceKind.meal,
          counterpartyType: CounterpartyType.supplier,
          supplierId: supplier.id,
          title: '已生成应付餐食',
          amountCents: 4000,
        },
      })
      await createPayable({
        title: '资源已生成应付',
        amountCents: 4000,
        departureId: closedDeparture.id,
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        sourceId: generatedResource.id,
        cancelledAt: asDate(today),
      })

      const cookie = await loginAs(app, username)
      const response = await authRequest(app, cookie).get('/api/workbench').expect(200)
      expect(response.body.data.template).toBe('finance')
      const fundsModule = response.body.data.modules.find(
        (module: { key: string }) => module.key === 'finance-funds',
      )

      expect(fundsModule.metrics).toEqual([
        {
          key: 'pending-payment',
          label: '待付款',
          value: 86000,
          secondaryValue: 3,
          secondarySuffix: '个节点',
          href: '/finance/payable?payableBalance=open_unpaid',
        },
        {
          key: 'pending-settlement',
          label: '待核销流水',
          value: 12000 + 6000,
          secondaryValue: 2,
          secondarySuffix: '笔（收入 1 · 支出 1）',
          href: '/finance/transactions?status=normal&pendingSettlement=1',
        },
      ])
      expect(fundsModule.total).toBe(2)
      expect(fundsModule.href).toBe('/finance/transactions?status=normal&pendingSettlement=1')
      expect(fundsModule.secondaryTotal).toBe(3)
      expect(fundsModule.secondaryHref).toBe('/account-generation-gaps')

      const settlementItems = fundsModule.items.filter(
        (item: { kind: string }) => item.kind === 'finance-pending-settlement',
      )
      const generationItems = fundsModule.items.filter(
        (item: { kind: string }) => item.kind === 'finance-account-generation',
      )
      expect(settlementItems).toHaveLength(2)
      expect(settlementItems[0]).toMatchObject({
        title: '未核销收入',
        direction: 'inflow',
        unallocatedAmountCents: 12000,
        departureClosed: false,
      })
      expect(settlementItems[1]).toMatchObject({
        title: '部分核销支出',
        direction: 'outflow',
        unallocatedAmountCents: 6000,
        departureClosed: true,
      })
      expect(generationItems).toHaveLength(3)
      expect(generationItems.map((item: { title: string }) => item.title)).toEqual([
        '待生成应收客源单',
        '待生成应付酒店',
        '关闭发团待生成应收',
      ])
      expect(generationItems.find(
        (item: { title: string }) => item.title === '关闭发团待生成应收',
      )).toMatchObject({ generationKind: 'receivable', departureClosed: true })
      expect(generationItems.find(
        (item: { title: string }) => item.title === '待生成应付酒店',
      )).toMatchObject({ generationKind: 'payable', estimatedAmountCents: 15000 })

      expect(JSON.stringify(fundsModule)).not.toContain('已关闭节点')
      expect(JSON.stringify(fundsModule)).not.toContain('已作废节点')
      expect(JSON.stringify(fundsModule)).not.toContain('已作废流水')
      expect(JSON.stringify(fundsModule)).not.toContain('零元不入缺口')
      expect(JSON.stringify(fundsModule)).not.toContain('已生成应付餐食')
      expect(JSON.stringify(fundsModule)).not.toContain('催付')
      expect(JSON.stringify(fundsModule.metrics)).not.toContain('overdue')
      expect(JSON.stringify(fundsModule.metrics)).not.toContain('dueDate')

      const drillTargets = [
        { href: fundsModule.metrics[0].href, api: '/api/finance/payables', total: 3 },
        { href: fundsModule.metrics[1].href, api: '/api/finance/transactions', total: 2 },
        { href: fundsModule.href, api: '/api/finance/transactions', total: 2 },
        {
          href: fundsModule.secondaryHref,
          api: '/api/account-generation-gaps',
          total: 3,
        },
        {
          href: settlementItems[0].href,
          api: '/api/finance/transactions',
          total: 1,
        },
      ]
      for (const target of drillTargets) {
        const path = target.href
          .replace('/finance/payable', '/api/finance/payables')
          .replace('/finance/transactions', '/api/finance/transactions')
          .replace('/account-generation-gaps', '/api/account-generation-gaps')
        const drillDown = await authRequest(app, cookie).get(path).expect(200)
        expect(drillDown.body.data.total).toBe(target.total)
      }

      expect([
        noneIncome.id,
        partialExpense.id,
        pendingSourceOrder.id,
        closedSourceOrder.id,
        pendingResource.id,
      ]).toHaveLength(5)
    } finally {
      await prisma.financeVerification.deleteMany({ where: { organizationId: organization.id } })
      await prisma.financeTransaction.deleteMany({ where: { organizationId: organization.id } })
      await prisma.paymentSchedule.deleteMany({ where: { organizationId: organization.id } })
      await prisma.segmentResource.deleteMany({
        where: { segment: { departure: { organizationId: organization.id } } },
      })
      await prisma.itinerarySegment.deleteMany({
        where: { departure: { organizationId: organization.id } },
      })
      await prisma.sourceOrder.deleteMany({
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
