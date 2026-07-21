/**
 * 工作台显示边界验收数据。
 *
 * 独立组织，覆盖计调 / 财务 / 企管三个模板的长文案、超限队列、密集 strip、空日与风险项。
 *
 * 用法：
 *   pnpm --filter api db:seed-workbench-display
 *   pnpm --filter api db:seed-workbench-display -- --reset   # 先删同名组织再灌
 */
import { hash } from 'bcryptjs'
import {
  CounterpartyType,
  DepartureStatus,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentChannel,
  PaymentScheduleDirection,
  PrismaClient,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
  TransactionDirection,
  UserStatus,
} from '@prisma/client'
import { PaymentScheduleSourceType, PRESET_ROLE_NAMES } from '@xiaotuanbao/shared'

const prisma = new PrismaClient()

const ORG_NAME = '工作台显示边界验收旅行社（超长组织名压测用·丝绸之路运营中心）'
const BUSINESS_PREFIX = 'WBDB'
const PASSWORD = 'admin123'

const USERS = [
  {
    username: 'wbdb_jd',
    name: '欧阳修远·首席计调专员（边界显示）',
    roleName: PRESET_ROLE_NAMES.COORDINATOR,
  },
  {
    username: 'wbdb_cw',
    name: '司马懿安·财务结算主管（边界显示）',
    roleName: PRESET_ROLE_NAMES.FINANCE,
  },
  {
    username: 'wbdb_admin',
    name: '诸葛明远·企业管理员（边界显示）',
    roleName: PRESET_ROLE_NAMES.ORG_ADMIN,
  },
] as const

const LONG_DEPARTURE =
  '【边界】丝绸之路天山北坡黄金线暨喀纳斯禾木环线深度体验团（含往返机票与全程五星酒店）超长标题压测ABCDEFGHIJKLMNOP'
const LONG_PARTNER =
  '北京中青旅国际旅游有限公司华北大区组团中心暨内蒙古呼包鄂专线业务部往来对象超长名称压测'
const LONG_ORDER =
  '【边界客源单】华东国旅上海分公司定制团结算客源单超长显示名压测一二三四五六七八九十'
const LONG_SCHEDULE =
  '【边界应收】喀纳斯环线团尾款暨增补项目结算节点超长标题压测一二三四五六七八九十ABCDEFG'
const LONG_TX_COUNTERPARTY =
  '乌鲁木齐丝路国际旅行社有限责任公司财务往来超长名称压测（待核销流水标题）'

function shanghaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function daysBetween(from: string, to: string): number {
  return Math.round((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000) + 1
}

function monthStartOffset(today: string, monthsAgo: number): string {
  const [y, m] = today.split('-').map(Number)
  const total = y * 12 + (m - 1) - monthsAgo
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-10`
}

async function wipeOrganization(organizationId: string) {
  await prisma.financeVerification.deleteMany({ where: { organizationId } })
  await prisma.financeTransaction.deleteMany({ where: { organizationId } })
  await prisma.paymentSchedule.deleteMany({ where: { organizationId } })
  await prisma.sourceOrderGuest.deleteMany({
    where: { sourceOrder: { departure: { organizationId } } },
  })
  await prisma.sourceOrder.deleteMany({
    where: { departure: { organizationId } },
  })
  await prisma.segmentResource.deleteMany({
    where: { segment: { departure: { organizationId } } },
  })
  await prisma.itinerarySegment.deleteMany({
    where: { departure: { organizationId } },
  })
  await prisma.departure.deleteMany({ where: { organizationId } })
  await prisma.partner.deleteMany({ where: { organizationId } })
  await prisma.supplier.deleteMany({ where: { organizationId } })
  await prisma.documentSequence.deleteMany({ where: { organizationId } })
  await prisma.userRole.deleteMany({ where: { user: { organizationId } } })
  await prisma.user.deleteMany({ where: { organizationId } })
  await prisma.organization.delete({ where: { id: organizationId } })
}

async function assignRole(userId: string, roleName: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } })
  await prisma.userRole.create({ data: { userId, roleId: role.id } })
}

async function main() {
  const reset = process.argv.includes('--reset')
  const existing = await prisma.organization.findFirst({
    where: { name: ORG_NAME, deletedAt: null },
  })

  if (existing) {
    if (!reset) {
      console.error(
        `组织已存在：${ORG_NAME} (${existing.id})\n` +
          `如需重灌：pnpm --filter api db:seed-workbench-display -- --reset`,
      )
      process.exit(2)
    }
    console.log(`--reset：删除已有组织 ${existing.id}`)
    await wipeOrganization(existing.id)
  }

  const prefixTaken = await prisma.organization.findFirst({
    where: { businessPrefix: BUSINESS_PREFIX },
  })
  if (prefixTaken) {
    console.error(`businessPrefix ${BUSINESS_PREFIX} 已被 ${prefixTaken.name} 占用`)
    process.exit(2)
  }

  const today = shanghaiToday()
  const passwordHash = await hash(PASSWORD, 10)
  const organization = await prisma.organization.create({
    data: { name: ORG_NAME, businessPrefix: BUSINESS_PREFIX },
  })

  const users: Record<string, { id: string; username: string; name: string }> = {}
  for (const def of USERS) {
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        username: def.username,
        passwordHash,
        name: def.name,
        status: UserStatus.enabled,
      },
    })
    await assignRole(user.id, def.roleName)
    users[def.username] = user
    console.log(`User ${def.username} / ${PASSWORD}`)
  }

  const ownerId = users.wbdb_jd.id
  const financeUserId = users.wbdb_cw.id

  const partnerLong = await prisma.partner.create({
    data: {
      organizationId: organization.id,
      name: LONG_PARTNER,
      partnerKind: PartnerKind.group_agent,
      partnerType: PartnerType.group_agency,
      status: DirectoryProfileStatus.active,
    },
  })
  const partnerShort = await prisma.partner.create({
    data: {
      organizationId: organization.id,
      name: '边界短名客源',
      partnerKind: PartnerKind.group_agent,
      partnerType: PartnerType.group_agency,
      status: DirectoryProfileStatus.active,
    },
  })
  const supplier = await prisma.supplier.create({
    data: {
      organizationId: organization.id,
      name: '边界测试供应商·丝路旅汽调度中心',
      categories: [ResourceKind.transport, ResourceKind.hotel],
      status: DirectoryProfileStatus.active,
    },
  })

  let departureSeq = 0
  let scheduleSeq = 0
  let txSeq = 0
  let verifySeq = 0

  const nextDepartureNo = () => {
    departureSeq += 1
    return `WBDB${String(departureSeq).padStart(8, '0')}`
  }
  const nextScheduleNo = (dir: 'AR' | 'AP') => {
    scheduleSeq += 1
    return `WBDB-${dir}-${String(scheduleSeq).padStart(4, '0')}`
  }
  const nextTxNo = () => {
    txSeq += 1
    return `WBDB-TX-${String(txSeq).padStart(4, '0')}`
  }
  const nextVerifyNo = () => {
    verifySeq += 1
    return `WBDB-CL-${String(verifySeq).padStart(4, '0')}`
  }

  type SourceOrderInput = {
    partnerId: string
    displayName: string
    guestCount: number
    recordedGuests: number
    unitPriceCents?: number
  }

  const createDeparture = async (input: {
    name: string
    startOffset: number
    endOffset: number
    status?: DepartureStatus
    ownerUserId?: string
    sourceOrder?: SourceOrderInput
    segments?: Array<{ hasResource: boolean; resourceTitle?: string; amountCents?: number }>
  }) => {
    const startDate = addDays(today, input.startOffset)
    const endDate = addDays(today, input.endOffset)
    return prisma.departure.create({
      data: {
        organizationId: organization.id,
        departureNo: nextDepartureNo(),
        name: input.name,
        routeName: '边界验收路线·天山北坡',
        startDate: asDate(startDate),
        endDate: asDate(endDate),
        dayCount: daysBetween(startDate, endDate),
        ownerUserId: input.ownerUserId ?? ownerId,
        status: input.status ?? DepartureStatus.editing,
        ...(input.sourceOrder
          ? {
              sourceOrders: {
                create: {
                  partnerId: input.sourceOrder.partnerId,
                  displayName: input.sourceOrder.displayName,
                  guestCount: input.sourceOrder.guestCount,
                  adultGuestCount: input.sourceOrder.guestCount,
                  childGuestCount: 0,
                  adultUnitPriceCents: input.sourceOrder.unitPriceCents ?? 10000,
                  childUnitPriceCents: 0,
                  grossReceivableCents:
                    input.sourceOrder.guestCount * (input.sourceOrder.unitPriceCents ?? 10000),
                  discountType: SourceOrderDiscountType.none,
                  discountCents: 0,
                  netReceivableCents:
                    input.sourceOrder.guestCount * (input.sourceOrder.unitPriceCents ?? 10000),
                  collectionMode: SourceOrderCollectionMode.partner_settled,
                  partnerCollectedCents:
                    input.sourceOrder.guestCount * (input.sourceOrder.unitPriceCents ?? 10000),
                  guestCollectCents: 0,
                  guests: {
                    create: Array.from(
                      { length: input.sourceOrder.recordedGuests },
                      (_, index) => ({
                        name: `边界客人${index + 1}`,
                      }),
                    ),
                  },
                },
              },
            }
          : {}),
        ...(input.segments
          ? {
              itinerarySegments: {
                create: input.segments.map((segment, index) => ({
                  name: `行程段${index + 1}`,
                  sortOrder: index + 1,
                  resources: segment.hasResource
                    ? {
                        create: {
                          resourceKind: ResourceKind.transport,
                          counterpartyType: CounterpartyType.supplier,
                          supplierId: supplier.id,
                          title: segment.resourceTitle ?? `用车资源${index + 1}`,
                          amountCents: segment.amountCents ?? 10000,
                        },
                      }
                    : undefined,
                })),
              },
            }
          : {}),
      },
      include: { sourceOrders: true, itinerarySegments: { include: { resources: true } } },
    })
  }

  const createReceivable = async (input: {
    title: string
    dueDate: string
    amountCents: number
    departureId: string
    counterpartyName?: string
    counterpartyId?: string
  }) =>
    prisma.paymentSchedule.create({
      data: {
        organizationId: organization.id,
        departureId: input.departureId,
        direction: PaymentScheduleDirection.receivable,
        scheduleNo: nextScheduleNo('AR'),
        title: input.title,
        amountCents: input.amountCents,
        dueDate: asDate(input.dueDate),
        counterpartyType: CounterpartyType.partner,
        counterpartyId: input.counterpartyId ?? partnerLong.id,
        counterpartyName: input.counterpartyName ?? partnerLong.name,
        sourceType: PaymentScheduleSourceType.MANUAL,
      },
    })

  const createPayable = async (input: {
    title: string
    amountCents: number
    departureId: string
    dueDate?: string
  }) =>
    prisma.paymentSchedule.create({
      data: {
        organizationId: organization.id,
        departureId: input.departureId,
        direction: PaymentScheduleDirection.payable,
        scheduleNo: nextScheduleNo('AP'),
        title: input.title,
        amountCents: input.amountCents,
        dueDate: asDate(input.dueDate ?? addDays(today, 3)),
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplier.id,
        counterpartyName: supplier.name,
        sourceType: PaymentScheduleSourceType.MANUAL,
      },
    })

  const createTransaction = async (input: {
    direction: TransactionDirection
    amountCents: number
    departureId: string
    counterpartyName: string
    transactionDate?: string
  }) =>
    prisma.financeTransaction.create({
      data: {
        organizationId: organization.id,
        transactionNo: nextTxNo(),
        direction: input.direction,
        paymentChannel: PaymentChannel.other,
        amountCents: input.amountCents,
        transactionDate: asDate(input.transactionDate ?? today),
        counterpartyType: CounterpartyType.partner,
        counterpartyName: input.counterpartyName,
        departureId: input.departureId,
      },
    })

  /** 关闭「待生成应收/应付」缺口，避免填充数据挤占可见队列 */
  const sealDepartureFinanceGaps = async (departure: {
    id: string
    sourceOrders: Array<{ id: string; netReceivableCents: number; partnerId: string }>
    itinerarySegments: Array<{ resources: Array<{ id: string; amountCents: number; title: string }> }>
  }) => {
    for (const order of departure.sourceOrders) {
      await prisma.paymentSchedule.create({
        data: {
          organizationId: organization.id,
          departureId: departure.id,
          direction: PaymentScheduleDirection.receivable,
          scheduleNo: nextScheduleNo('AR'),
          title: '已生成应收（填充封闭）',
          amountCents: order.netReceivableCents,
          dueDate: asDate(today),
          counterpartyType: CounterpartyType.partner,
          counterpartyId: order.partnerId,
          counterpartyName: partnerShort.name,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          sourceId: order.id,
          cancelledAt: asDate(today),
        },
      })
    }
    for (const segment of departure.itinerarySegments) {
      for (const resource of segment.resources) {
        if (resource.amountCents <= 0) continue
        await prisma.paymentSchedule.create({
          data: {
            organizationId: organization.id,
            departureId: departure.id,
            direction: PaymentScheduleDirection.payable,
            scheduleNo: nextScheduleNo('AP'),
            title: `已生成应付（填充封闭）${resource.title}`.slice(0, 80),
            amountCents: resource.amountCents,
            dueDate: asDate(today),
            counterpartyType: CounterpartyType.supplier,
            counterpartyId: supplier.id,
            counterpartyName: supplier.name,
            sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
            sourceId: resource.id,
            cancelledAt: asDate(today),
          },
        })
      }
    }
  }

  // ——— A. 计调：近期发团超限 + 长标题 + 多缺口 + 14 日 strip ———
  await createDeparture({
    name: LONG_DEPARTURE,
    startOffset: 0,
    endOffset: 2,
    // 无客源 / 无行程 → 双缺口
  })
  // 当前缺口码最多同时 2 项（另有 N 项 UI 靠 mock）；此团压「名单不全 + 无行程资源」双 Tag
  const dualGap = await createDeparture({
    name: '【双缺口】今日出发·无资源且名单不全边界团',
    startOffset: 0,
    endOffset: 1,
    sourceOrder: {
      partnerId: partnerShort.id,
      displayName: '双缺口客源',
      guestCount: 3,
      recordedGuests: 1,
    },
    segments: [{ hasResource: false }],
  })
  // 只封闭应收生成缺口，保留名单/资源资料缺口用于近期表 Tag
  for (const order of dualGap.sourceOrders) {
    await prisma.paymentSchedule.create({
      data: {
        organizationId: organization.id,
        departureId: dualGap.id,
        direction: PaymentScheduleDirection.receivable,
        scheduleNo: nextScheduleNo('AR'),
        title: '已生成应收（双缺口团封闭）',
        amountCents: order.netReceivableCents,
        dueDate: asDate(today),
        counterpartyType: CounterpartyType.partner,
        counterpartyId: order.partnerId,
        counterpartyName: partnerShort.name,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        sourceId: order.id,
        cancelledAt: asDate(today),
      },
    })
  }

  const completeShort = await createDeparture({
    name: '进行中·资料完整短名',
    startOffset: -1,
    endOffset: 1,
    sourceOrder: {
      partnerId: partnerShort.id,
      displayName: '完整客源',
      guestCount: 2,
      recordedGuests: 2,
    },
    segments: [{ hasResource: true }],
  })
  await sealDepartureFinanceGaps(completeShort)

  // 填满近期表：窗口内再造至 ≥9 条（含上面）
  for (let i = 1; i <= 7; i += 1) {
    const filler = await createDeparture({
      name: `近期超额队列表项 ${i}·未来发团`,
      startOffset: i === 7 ? 7 : Math.min(i, 6),
      endOffset: i === 7 ? 8 : Math.min(i, 6) + 1,
      sourceOrder:
        i % 2 === 0
          ? {
              partnerId: partnerShort.id,
              displayName: `超额客源${i}`,
              guestCount: 1,
              recordedGuests: 1,
            }
          : undefined,
      segments: i % 3 === 0 ? [{ hasResource: true }] : undefined,
    })
    if (filler.sourceOrders.length > 0 || filler.itinerarySegments.some((s) => s.resources.length > 0)) {
      await sealDepartureFinanceGaps(filler)
    }
  }

  // 14 日趋势：分散到第 2/4/10/13 日；部分日空着（仅要人数/发团数，封闭缺口）
  for (const offset of [2, 4, 10, 13]) {
    const trend = await createDeparture({
      name: `趋势条 ${offset} 日后出发`,
      startOffset: offset,
      endOffset: offset + 1,
      sourceOrder: {
        partnerId: partnerShort.id,
        displayName: `趋势客源${offset}`,
        guestCount: 4 + offset,
        recordedGuests: 4 + offset,
      },
      // 不挂资源，避免挤占财务「待生成」队列
    })
    await sealDepartureFinanceGaps(trend)
  }

  // ——— B. 计调结算：可结清 ≥6、待生成应收 ≥6（长 title + 长 departureName）———
  for (let i = 1; i <= 6; i += 1) {
    // endDate 升序取前 5：把超长团名放到最早结束日，确保进可见队列
    const ready = await createDeparture({
      name: i === 1 ? LONG_DEPARTURE.replace('【边界】', '【可结清】') : `可确认结清队列 ${i}`,
      startOffset: -30 + i,
      endOffset: -28 + i,
      status: DepartureStatus.pending_settlement,
      sourceOrder: {
        partnerId: partnerShort.id,
        displayName: `结清客源${i}`,
        guestCount: 1,
        recordedGuests: 1,
      },
    })
    await prisma.paymentSchedule.create({
      data: {
        organizationId: organization.id,
        departureId: ready.id,
        direction: PaymentScheduleDirection.receivable,
        scheduleNo: nextScheduleNo('AR'),
        title: `已关闭应收${i}`,
        amountCents: 10000,
        dueDate: asDate(addDays(today, -28 + i)),
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerShort.id,
        counterpartyName: partnerShort.name,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        sourceId: ready.sourceOrders[0].id,
        cancelledAt: asDate(today),
      },
    })
  }

  for (let i = 1; i <= 6; i += 1) {
    // startDate 升序取前 5：i=1 最早出发 + 超长 displayName/发团名并排
    await createDeparture({
      name: i === 1 ? LONG_DEPARTURE.replace('【边界】', '【待应收发团】') : `待生成应收发团 ${i}`,
      startOffset: -12 + i,
      endOffset: -10 + i,
      status: DepartureStatus.editing,
      sourceOrder: {
        partnerId: partnerLong.id,
        displayName: i === 1 ? LONG_ORDER : `待生成应收客源单 ${i}`,
        guestCount: 1,
        recordedGuests: 1,
        unitPriceCents: 99_000 - i * 100,
      },
    })
  }

  // ——— C. 财务：应收跟进 ≥9、账龄三档、关闭发团 Tag、极大金额 ———
  const arOpen = await createDeparture({
    name: '应收跟进母团·开放',
    startOffset: -40,
    endOffset: -30,
    sourceOrder: {
      partnerId: partnerLong.id,
      displayName: '应收母团客源',
      guestCount: 1,
      recordedGuests: 1,
    },
    segments: [{ hasResource: true }],
  })
  await sealDepartureFinanceGaps(arOpen)
  const arClosed = await createDeparture({
    name: '应收跟进母团·已关闭（边界 Tag）',
    startOffset: -45,
    endOffset: -35,
    status: DepartureStatus.closed,
  })

  await createReceivable({
    title: LONG_SCHEDULE,
    dueDate: addDays(today, -31),
    amountCents: 999_999_900,
    departureId: arClosed.id,
    counterpartyName: LONG_PARTNER,
  })
  await createReceivable({
    title: '账龄30天·中额',
    dueDate: addDays(today, -30),
    amountCents: 300_000,
    departureId: arOpen.id,
    counterpartyName: '短名往来A',
  })
  await createReceivable({
    title: '账龄8天',
    dueDate: addDays(today, -8),
    amountCents: 80_000,
    departureId: arOpen.id,
  })
  await createReceivable({
    title: '账龄7天',
    dueDate: addDays(today, -7),
    amountCents: 70_000,
    departureId: arOpen.id,
  })
  await createReceivable({
    title: '账龄3天',
    dueDate: addDays(today, -3),
    amountCents: 30_000,
    departureId: arOpen.id,
  })
  await createReceivable({
    title: '今天到期应收',
    dueDate: today,
    amountCents: 12_000,
    departureId: arOpen.id,
  })
  await createReceivable({
    title: '未来3天到期',
    dueDate: addDays(today, 3),
    amountCents: 15_000,
    departureId: arOpen.id,
  })
  for (let i = 1; i <= 3; i += 1) {
    await createReceivable({
      title: `超额应收跟进 ${i}`,
      dueDate: addDays(today, -1 - i),
      amountCents: 1000 * i,
      departureId: arOpen.id,
      counterpartyName: i === 1 ? LONG_PARTNER : `短往来${i}`,
    })
  }

  // ——— D. 资金：待核销 ≥6、待生成账款缺口 ≥6、待付款 ———
  for (let i = 1; i <= 6; i += 1) {
    // 待核销按未分配金额降序：超长往来名给最大金额，保证进可见 5
    await createTransaction({
      direction: i % 2 === 0 ? TransactionDirection.outflow : TransactionDirection.inflow,
      amountCents: i === 1 ? 888_000 : 50_000 + i * 1000,
      departureId: i === 1 ? arClosed.id : arOpen.id,
      counterpartyName: i === 1 ? LONG_TX_COUNTERPARTY : `待核销往来 ${i}`,
      // 部分 >7 天未核销 → 企管 stale settlement risk
      transactionDate: i <= 2 ? addDays(today, -10 - i) : today,
    })
  }

  await createPayable({
    title: '开放待付·大额',
    amountCents: 880_000,
    departureId: arOpen.id,
  })
  await createPayable({
    title: '关闭发团待付',
    amountCents: 120_000,
    departureId: arClosed.id,
  })

  // 待生成应付：开放团上挂未生成资源；关闭团上挂未生成客源（上面待应收已覆盖部分 generation）
  for (let i = 1; i <= 4; i += 1) {
    const gapDep = await createDeparture({
      name: i === 1 ? '【缺口】待生成应付超长资源标题母团ABCDEF' : `账款缺口团 ${i}`,
      startOffset: -12,
      endOffset: -10,
      status: i === 2 ? DepartureStatus.closed : DepartureStatus.editing,
      // 不挂客源单，避免挤占「待生成应收」；只留应付资源缺口
      segments: [
        {
          hasResource: true,
          resourceTitle:
            i === 1
              ? '【边界资源】五星酒店连住含早及接送超长应付资源标题压测XYZ'
              : `待生成应付资源 ${i}`,
          amountCents: i === 1 ? 660_000 : 15_000 + i * 500,
        },
      ],
    })
    void gapDep
  }

  // ——— E. 企管规模：近 6 月有团/无团混排（本月已有进行中）———
  for (const monthsAgo of [1, 2, 4, 5]) {
    const start = monthStartOffset(today, monthsAgo)
    const end = addDays(start, 2)
    const scale = await prisma.departure.create({
      data: {
        organizationId: organization.id,
        departureNo: nextDepartureNo(),
        name: `规模条 ${monthsAgo} 月前发团`,
        routeName: '边界验收路线·天山北坡',
        startDate: asDate(start),
        endDate: asDate(end),
        dayCount: daysBetween(start, end),
        ownerUserId: ownerId,
        status: DepartureStatus.closed,
        sourceOrders: {
          create: {
            partnerId: partnerShort.id,
            displayName: `规模客源${monthsAgo}`,
            guestCount: 10 + monthsAgo,
            adultGuestCount: 10 + monthsAgo,
            childGuestCount: 0,
            adultUnitPriceCents: 10000,
            childUnitPriceCents: 0,
            grossReceivableCents: (10 + monthsAgo) * 10000,
            discountType: SourceOrderDiscountType.none,
            discountCents: 0,
            netReceivableCents: (10 + monthsAgo) * 10000,
            collectionMode: SourceOrderCollectionMode.partner_settled,
            partnerCollectedCents: (10 + monthsAgo) * 10000,
            guestCollectCents: 0,
          },
        },
      },
      include: { sourceOrders: true, itinerarySegments: { include: { resources: true } } },
    })
    await sealDepartureFinanceGaps(scale)
  }

  // 关闭发团仍有开放应收 → 企管 high risk（arClosed 已有超大逾期应收）
  // 再补一条关闭+开放应付已覆盖

  // 部分核销一笔，保证核销路径无脏数据（可选）
  const partialPayable = await createPayable({
    title: '部分核销用应付',
    amountCents: 10_000,
    departureId: arOpen.id,
  })
  const partialTx = await createTransaction({
    direction: TransactionDirection.outflow,
    amountCents: 10_000,
    departureId: arOpen.id,
    counterpartyName: '部分核销支出',
  })
  await prisma.financeVerification.create({
    data: {
      organizationId: organization.id,
      verificationNo: nextVerifyNo(),
      paymentScheduleId: partialPayable.id,
      transactionId: partialTx.id,
      amountCents: 4000,
      verificationDate: asDate(today),
      createdBy: financeUserId,
      billUnsettledAfterCents: 6000,
    },
  })

  const departureCount = await prisma.departure.count({
    where: { organizationId: organization.id },
  })
  const scheduleCount = await prisma.paymentSchedule.count({
    where: { organizationId: organization.id },
  })
  const txCount = await prisma.financeTransaction.count({
    where: { organizationId: organization.id },
  })

  console.log('')
  console.log('=== 工作台显示边界数据已写入 ===')
  console.log(`组织：${ORG_NAME}`)
  console.log(`organizationId：${organization.id}`)
  console.log(`asOf 基准日（上海）：${today}`)
  console.log(`发团 ${departureCount} · 账款节点 ${scheduleCount} · 流水 ${txCount}`)
  console.log('')
  console.log('登录后打开「工作台 /」回测：')
  console.log(`  计调  ${USERS[0].username} / ${PASSWORD}`)
  console.log(`  财务  ${USERS[1].username} / ${PASSWORD}`)
  console.log(`  企管  ${USERS[2].username} / ${PASSWORD}`)
  console.log('')
  console.log('建议肉眼核对：')
  console.log('  · 页头超长组织名换行')
  console.log('  · 计调近期表 ≥9 → 只露 8 + 查看全部；超长团名换行；双缺口双 Tag')
  console.log('  · 结算双队列各 ≥6 → 只露 5；长 title / departureName 并排')
  console.log('  · 14 日趋势条有团/空日混排 + Tooltip 零延迟扫视')
  console.log('  · 财务跟进 ≥9 → 只露 8；长往来名；关闭 Tag；极大金额；账龄三档 strip')
  console.log('  · 资金待核销/待生成各超限；企管风险卡 ≥6 与 6 月规模 strip')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
