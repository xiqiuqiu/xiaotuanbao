/**
 * 一次性脚本：创建「新疆西部中旅」组织 + 全面功能测试数据（编号走 document_sequences）。
 * 在 API 容器内执行：
 *   node /tmp/seed-xbzt-test-org.cjs
 *
 * 幂等：若组织名已存在则跳过创建并退出（避免重复灌数）。
 */
'use strict'

const { hash } = require('bcryptjs')
const {
  PrismaClient,
  DirectoryProfileStatus,
  InvoiceAvailable,
  InvoiceType,
  PartnerContactRole,
  PartnerKind,
  PartnerType,
  SettlementCycle,
  SettlementMethod,
  ResourceKind,
  DepartureType,
  DepartureStatus,
  DepartureRouteSource,
  SourceOrderDiscountType,
  SourceOrderCollectionMode,
  GuestGender,
  CounterpartyType,
  PaymentScheduleDirection,
  TransactionDirection,
  PaymentChannel,
  VerificationStatus,
  DocumentSequenceType,
  UserStatus,
} = require('@prisma/client')
const {
  formatDepartureNo,
  formatScheduleNo,
  formatTransactionNo,
  formatVerificationNo,
  PaymentScheduleDirection: SharedDirection,
  PRESET_ROLE_NAMES,
} = require('@xiaotuanbao/shared')

const prisma = new PrismaClient()

const ORG_NAME = '新疆西部中旅旅游发展有限公司'
const BUSINESS_PREFIX = 'X'
const PASSWORD = 'admin123'

const USERS = [
  { username: 'xbzl_admin', name: '西部中旅管理员', roleName: PRESET_ROLE_NAMES.ORG_ADMIN },
  { username: 'xbzl_jd', name: '艾力·计调', roleName: PRESET_ROLE_NAMES.COORDINATOR },
  { username: 'xbzl_cw', name: '古丽·财务', roleName: PRESET_ROLE_NAMES.FINANCE },
]

function shanghaiParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, d] = fmt.format(date).split('-')
  return { y, m, d, ymd: `${y}${m}${d}`, ym: `${y}${m}`, iso: `${y}-${m}-${d}` }
}

function dateOffset(daysFromToday) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + daysFromToday)
  return shanghaiParts(d)
}

function dayCount(startIso, endIso) {
  const a = new Date(`${startIso}T12:00:00+08:00`)
  const b = new Date(`${endIso}T12:00:00+08:00`)
  return Math.round((b - a) / 86400000) + 1
}

async function nextSequence(organizationId, documentType, periodKey) {
  const row = await prisma.documentSequence.upsert({
    where: {
      organizationId_documentType_periodKey: { organizationId, documentType, periodKey },
    },
    create: { organizationId, documentType, periodKey, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
  })
  return row.lastSequence
}

async function allocDepartureNo(organizationId, ym) {
  const seq = await nextSequence(organizationId, DocumentSequenceType.departure, ym)
  return formatDepartureNo(BUSINESS_PREFIX, ym, seq)
}

async function allocScheduleNo(organizationId, direction, ym) {
  const documentType =
    direction === PaymentScheduleDirection.receivable
      ? DocumentSequenceType.ar
      : DocumentSequenceType.ap
  const shared =
    direction === PaymentScheduleDirection.receivable
      ? SharedDirection.RECEIVABLE
      : SharedDirection.PAYABLE
  const seq = await nextSequence(organizationId, documentType, ym)
  return formatScheduleNo(shared, BUSINESS_PREFIX, ym, seq)
}

async function allocTxNo(organizationId, ymd) {
  const seq = await nextSequence(organizationId, DocumentSequenceType.tx, ymd)
  return formatTransactionNo(BUSINESS_PREFIX, ymd, seq)
}

async function allocClNo(organizationId, ym) {
  const seq = await nextSequence(organizationId, DocumentSequenceType.cl, ym)
  return formatVerificationNo(BUSINESS_PREFIX, ym, seq)
}

async function assignRole(userId, roleName) {
  const role = await prisma.role.findUnique({ where: { name: roleName } })
  if (!role) throw new Error(`Role missing: ${roleName}`)
  await prisma.userRole.deleteMany({ where: { userId } })
  await prisma.userRole.create({ data: { userId, roleId: role.id } })
}

async function createOrgAndUsers() {
  const existing = await prisma.organization.findFirst({
    where: { name: ORG_NAME, deletedAt: null },
  })
  if (existing) {
    console.error(`Organization already exists: ${ORG_NAME} (${existing.id}). Abort.`)
    process.exit(2)
  }

  const prefixTaken = await prisma.organization.findFirst({
    where: { businessPrefix: BUSINESS_PREFIX },
  })
  if (prefixTaken) {
    console.error(`businessPrefix ${BUSINESS_PREFIX} already used by ${prefixTaken.name}. Abort.`)
    process.exit(2)
  }

  const passwordHash = await hash(PASSWORD, 10)
  const organization = await prisma.organization.create({
    data: {
      name: ORG_NAME,
      businessPrefix: BUSINESS_PREFIX,
    },
  })

  const createdUsers = {}
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        username: u.username,
        passwordHash,
        name: u.name,
        status: UserStatus.enabled,
        isPlatformAdmin: false,
      },
    })
    await assignRole(user.id, u.roleName)
    createdUsers[u.username] = user
    console.log(`User ${u.username} / ${PASSWORD} (${u.roleName})`)
  }

  return { organization, users: createdUsers }
}

async function seedDirectory(organizationId) {
  const suppliers = {}
  const supplierDefs = [
    {
      key: 'tianchi',
      name: '天山天池景区',
      categories: [ResourceKind.scenic],
      status: DirectoryProfileStatus.active,
      contactName: '票务部',
      contactPhone: '0994-3232000',
      settlementMethod: SettlementMethod.prepay,
      settlementCycle: SettlementCycle.per_group,
      referenceQuoteNotes: '团队票 95/人，需提前预约',
      invoiceAvailable: InvoiceAvailable.yes,
      invoiceType: InvoiceType.special,
      taxRate: '6%',
    },
    {
      key: 'kanas',
      name: '喀纳斯景区管理处',
      categories: [ResourceKind.scenic],
      status: DirectoryProfileStatus.active,
      contactName: '团队接待',
      contactPhone: '0906-6322001',
      settlementMethod: SettlementMethod.prepay,
      settlementCycle: SettlementCycle.per_group,
      referenceQuoteNotes: '进山费+环保车 160/人',
      invoiceAvailable: InvoiceAvailable.yes,
      invoiceType: InvoiceType.special,
      taxRate: '6%',
    },
    {
      key: 'hotel',
      name: '乌鲁木齐国际大巴扎酒店',
      categories: [ResourceKind.hotel, ResourceKind.meal],
      status: DirectoryProfileStatus.active,
      contactName: '热依拉',
      contactPhone: '0991-2888001',
      settlementMethod: SettlementMethod.postpay,
      settlementCycle: SettlementCycle.monthly,
      settlementNotes: '出团后 10 个工作日结清',
      referenceQuoteNotes: '标间 420/间夜，含双早',
      invoiceAvailable: InvoiceAvailable.yes,
      invoiceType: InvoiceType.special,
      taxRate: '6%',
      accountName: '乌鲁木齐国际大巴扎酒店有限公司',
      bankName: '中国工商银行乌鲁木齐分行',
      bankAccount: '6222026500001122334',
    },
    {
      key: 'meal',
      name: '新疆大盘鸡（二道桥店）',
      categories: [ResourceKind.meal],
      status: DirectoryProfileStatus.active,
      contactName: '买买提',
      contactPhone: '13999118802',
      settlementMethod: SettlementMethod.cash,
      settlementCycle: SettlementCycle.per_group,
      referenceQuoteNotes: '团队餐标 68/88/108',
      invoiceAvailable: InvoiceAvailable.yes,
      invoiceType: InvoiceType.normal,
      taxRate: '3%',
    },
    {
      key: 'bus',
      name: '新疆丝路旅汽',
      categories: [ResourceKind.transport],
      status: DirectoryProfileStatus.active,
      contactName: '调度中心',
      contactPhone: '0991-3777001',
      settlementMethod: SettlementMethod.postpay,
      settlementCycle: SettlementCycle.semi_monthly,
      referenceQuoteNotes: '45 座 1800/天（疆内）',
      invoiceAvailable: InvoiceAvailable.yes,
      invoiceType: InvoiceType.special,
      taxRate: '9%',
    },
    {
      key: 'guide',
      name: '阿依古丽导游工作室',
      categories: [ResourceKind.guide],
      status: DirectoryProfileStatus.active,
      contactName: '阿依古丽',
      contactPhone: '13899916601',
      settlementMethod: SettlementMethod.cash,
      settlementCycle: SettlementCycle.per_group,
      referenceQuoteNotes: '中文导游 500/天',
      invoiceAvailable: InvoiceAvailable.no,
    },
    {
      key: 'disabled',
      name: '吐鲁番葡萄沟（暂停）',
      categories: [ResourceKind.scenic],
      status: DirectoryProfileStatus.disabled,
      contactName: '票务',
      contactPhone: '0995-8662000',
      settlementMethod: SettlementMethod.prepay,
      settlementCycle: SettlementCycle.per_group,
      businessNotes: '暂停合作，勿排团',
    },
  ]

  for (const def of supplierDefs) {
    const { key, ...data } = def
    suppliers[key] = await prisma.supplier.create({
      data: { organizationId, ...data },
    })
  }

  const partners = {}
  const partnerDefs = [
    {
      key: 'beijing',
      name: '北京中旅组团中心',
      partnerKind: PartnerKind.group_agent,
      partnerType: PartnerType.group_agency,
      status: DirectoryProfileStatus.active,
      contactName: '刘计调',
      contactRole: PartnerContactRole.operator,
      contactPhone: '13801008801',
      settlementMethod: SettlementMethod.postpay,
      paymentTermRule: SettlementCycle.monthly,
    },
    {
      key: 'shanghai',
      name: '上海春秋疆线部',
      partnerKind: PartnerKind.group_agent,
      partnerType: PartnerType.group_agency,
      status: DirectoryProfileStatus.active,
      contactName: '陈销售',
      contactRole: PartnerContactRole.sales,
      contactPhone: '13801668802',
      settlementMethod: SettlementMethod.postpay,
      paymentTermRule: SettlementCycle.monthly,
    },
    {
      key: 'local',
      name: '伊犁河谷地接社',
      partnerKind: PartnerKind.peer,
      partnerType: PartnerType.local_agency,
      status: DirectoryProfileStatus.active,
      contactName: '木拉提',
      contactRole: PartnerContactRole.owner,
      contactPhone: '13999927703',
      settlementMethod: SettlementMethod.cash,
      paymentTermRule: SettlementCycle.per_group,
    },
    {
      key: 'ota',
      name: '飞猪新疆专线',
      partnerKind: PartnerKind.both,
      partnerType: PartnerType.wholesaler,
      status: DirectoryProfileStatus.active,
      contactName: '平台对接',
      contactRole: PartnerContactRole.customer_service,
      contactPhone: '4008001234',
      settlementMethod: SettlementMethod.postpay,
      paymentTermRule: SettlementCycle.as_agreed,
    },
    {
      key: 'archived',
      name: '喀什老城地接（已终止）',
      partnerKind: PartnerKind.peer,
      partnerType: PartnerType.local_agency,
      status: DirectoryProfileStatus.archived,
      contactName: '历史档案',
      contactPhone: '13999880000',
      settlementMethod: SettlementMethod.cash,
      paymentTermRule: SettlementCycle.per_group,
      settlementNotes: '仅供历史追溯',
    },
  ]

  for (const def of partnerDefs) {
    const { key, ...data } = def
    partners[key] = await prisma.partner.create({
      data: { organizationId, ...data },
    })
  }

  const template = await prisma.routeTemplate.create({
    data: {
      organizationId,
      name: '天山天池+乌市2日线',
      defaultDayCount: 2,
      notes: '西部中旅测试线路模板',
      segments: {
        create: [
          {
            sortOrder: 0,
            name: '天池一日',
            dayCount: 1,
            destination: '天山天池',
            resources: {
              create: [
                {
                  resourceKind: ResourceKind.scenic,
                  counterpartyType: CounterpartyType.supplier,
                  supplierId: suppliers.tianchi.id,
                  title: '天池团队票',
                  amountCents: 190000,
                },
                {
                  resourceKind: ResourceKind.meal,
                  counterpartyType: CounterpartyType.supplier,
                  supplierId: suppliers.meal.id,
                  title: '大盘鸡团队午餐',
                  amountCents: 136000,
                },
              ],
            },
          },
          {
            sortOrder: 1,
            name: '乌市市区',
            dayCount: 1,
            destination: '乌鲁木齐',
            resources: {
              create: [
                {
                  resourceKind: ResourceKind.hotel,
                  counterpartyType: CounterpartyType.supplier,
                  supplierId: suppliers.hotel.id,
                  title: '大巴扎酒店',
                  amountCents: 84000,
                },
              ],
            },
          },
        ],
      },
    },
  })

  console.log(
    `Directory: ${Object.keys(suppliers).length} suppliers, ${Object.keys(partners).length} partners, template ${template.name}`,
  )
  return { suppliers, partners, template }
}

async function createVerification(params) {
  const {
    organizationId,
    scheduleId,
    transactionId,
    amountCents,
    verificationDateIso,
    createdBy,
    ym,
    billUnsettledAfterCents,
  } = params
  const verificationNo = await allocClNo(organizationId, ym)
  return prisma.financeVerification.create({
    data: {
      organizationId,
      verificationNo,
      paymentScheduleId: scheduleId,
      transactionId,
      amountCents,
      verificationDate: new Date(verificationDateIso),
      createdBy,
      billUnsettledAfterCents,
      status: VerificationStatus.normal,
    },
  })
}

async function createMatchedPayment(params) {
  const {
    organizationId,
    schedule,
    amountCents,
    transactionDateIso,
    ymd,
    ym,
    direction,
    paymentChannel,
    counterpartyType,
    counterpartyId,
    counterpartyName,
    departureId,
    createdBy,
    notes,
  } = params

  const transactionNo = await allocTxNo(organizationId, ymd)
  const tx = await prisma.financeTransaction.create({
    data: {
      organizationId,
      transactionNo,
      direction,
      paymentChannel,
      amountCents,
      transactionDate: new Date(transactionDateIso),
      counterpartyType,
      counterpartyId: counterpartyId ?? null,
      counterpartyName: counterpartyName ?? null,
      departureId,
      notes: notes ?? null,
    },
  })

  await createVerification({
    organizationId,
    scheduleId: schedule.id,
    transactionId: tx.id,
    amountCents,
    verificationDateIso: transactionDateIso,
    createdBy,
    ym,
    billUnsettledAfterCents: Math.max(0, schedule.amountCents - amountCents),
  })

  return tx
}

async function seedBusinessLoop(organizationId, ownerUserId, financeUserId, directory) {
  const { suppliers, partners } = directory
  const today = shanghaiParts()
  const ym = today.ym

  const d1Start = dateOffset(-14)
  const d1End = dateOffset(-13)
  const d2Start = dateOffset(-7)
  const d2Mid = dateOffset(-6)
  const d2End = dateOffset(-5)
  const d3Start = dateOffset(5)
  const d3End = dateOffset(6)

  // ── 发团 1：已结清闭环 ──
  const dep1No = await allocDepartureNo(organizationId, ym)
  const dep1 = await prisma.departure.create({
    data: {
      organizationId,
      departureNo: dep1No,
      name: `天山天池2日线 ${Number(d1Start.m)}月${Number(d1Start.d)}日团`,
      routeName: '天山天池+乌市2日线',
      routeSource: DepartureRouteSource.manual,
      departureType: DepartureType.independent,
      startDate: new Date(d1Start.iso),
      endDate: new Date(d1End.iso),
      dayCount: dayCount(d1Start.iso, d1End.iso),
      ownerUserId,
      status: DepartureStatus.settled,
      notes: '测试：应收应付全部结清',
    },
  })

  const so1Net = 20 * 88000
  const so1 = await prisma.sourceOrder.create({
    data: {
      departureId: dep1.id,
      partnerId: partners.beijing.id,
      displayName: partners.beijing.name,
      guestCount: 20,
      adultGuestCount: 20,
      childGuestCount: 0,
      adultUnitPriceCents: 88000,
      childUnitPriceCents: 0,
      grossReceivableCents: so1Net,
      discountType: SourceOrderDiscountType.none,
      discountCents: 0,
      netReceivableCents: so1Net,
      collectionMode: SourceOrderCollectionMode.guest_only,
      depositCents: 0,
      balanceCents: so1Net,
      partnerCollectedCents: 0,
      guestCollectCents: so1Net,
      guests: {
        create: [
          { name: '张三', phone: '13900001111', gender: GuestGender.male },
          { name: '李四', phone: '13900002222', gender: GuestGender.female },
        ],
      },
    },
  })

  const seg1 = await prisma.itinerarySegment.create({
    data: {
      departureId: dep1.id,
      name: '天池一日',
      startDate: new Date(d1Start.iso),
      endDate: new Date(d1Start.iso),
      dayCount: 1,
      destination: '天山天池',
    },
  })

  const resScenic = await prisma.segmentResource.create({
    data: {
      segmentId: seg1.id,
      resourceKind: ResourceKind.scenic,
      counterpartyType: CounterpartyType.supplier,
      supplierId: suppliers.tianchi.id,
      title: '天池团队票',
      amountCents: 190000,
    },
  })
  const resMeal = await prisma.segmentResource.create({
    data: {
      segmentId: seg1.id,
      resourceKind: ResourceKind.meal,
      counterpartyType: CounterpartyType.supplier,
      supplierId: suppliers.meal.id,
      title: '大盘鸡团队午餐',
      amountCents: 136000,
    },
  })

  const ar1No = await allocScheduleNo(organizationId, PaymentScheduleDirection.receivable, ym)
  const ar1 = await prisma.paymentSchedule.create({
    data: {
      organizationId,
      departureId: dep1.id,
      direction: PaymentScheduleDirection.receivable,
      scheduleNo: ar1No,
      title: `${so1.displayName} 应收`,
      amountCents: so1Net,
      dueDate: new Date(d1Start.iso),
      counterpartyType: CounterpartyType.guest,
      counterpartyName: so1.displayName,
      sourceType: 'source_order',
      sourceId: so1.id,
    },
  })

  const ap1aNo = await allocScheduleNo(organizationId, PaymentScheduleDirection.payable, ym)
  const ap1a = await prisma.paymentSchedule.create({
    data: {
      organizationId,
      departureId: dep1.id,
      direction: PaymentScheduleDirection.payable,
      scheduleNo: ap1aNo,
      title: resScenic.title,
      amountCents: 190000,
      dueDate: new Date(d1Start.iso),
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: suppliers.tianchi.id,
      counterpartyName: suppliers.tianchi.name,
      sourceType: 'segment_resource',
      sourceId: resScenic.id,
    },
  })

  const ap1bNo = await allocScheduleNo(organizationId, PaymentScheduleDirection.payable, ym)
  const ap1b = await prisma.paymentSchedule.create({
    data: {
      organizationId,
      departureId: dep1.id,
      direction: PaymentScheduleDirection.payable,
      scheduleNo: ap1bNo,
      title: resMeal.title,
      amountCents: 136000,
      dueDate: new Date(d1Start.iso),
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: suppliers.meal.id,
      counterpartyName: suppliers.meal.name,
      sourceType: 'segment_resource',
      sourceId: resMeal.id,
    },
  })

  await createMatchedPayment({
    organizationId,
    schedule: ar1,
    amountCents: so1Net,
    transactionDateIso: d1Start.iso,
    ymd: d1Start.ymd,
    ym,
    direction: TransactionDirection.inflow,
    paymentChannel: PaymentChannel.bank_transfer,
    counterpartyType: CounterpartyType.guest,
    counterpartyName: so1.displayName,
    departureId: dep1.id,
    createdBy: financeUserId,
  })
  await createMatchedPayment({
    organizationId,
    schedule: ap1a,
    amountCents: 190000,
    transactionDateIso: d1Start.iso,
    ymd: d1Start.ymd,
    ym,
    direction: TransactionDirection.outflow,
    paymentChannel: PaymentChannel.wechat,
    counterpartyType: CounterpartyType.supplier,
    counterpartyId: suppliers.tianchi.id,
    counterpartyName: suppliers.tianchi.name,
    departureId: dep1.id,
    createdBy: financeUserId,
  })
  await createMatchedPayment({
    organizationId,
    schedule: ap1b,
    amountCents: 136000,
    transactionDateIso: d1Start.iso,
    ymd: d1Start.ymd,
    ym,
    direction: TransactionDirection.outflow,
    paymentChannel: PaymentChannel.cash,
    counterpartyType: CounterpartyType.supplier,
    counterpartyId: suppliers.meal.id,
    counterpartyName: suppliers.meal.name,
    departureId: dep1.id,
    createdBy: financeUserId,
  })

  console.log(`Departure 1 ${dep1No} settled`)

  // ── 发团 2：待结算 + 部分收款 + 待匹配流水 ──
  const dep2No = await allocDepartureNo(organizationId, ym)
  const dep2 = await prisma.departure.create({
    data: {
      organizationId,
      departureNo: dep2No,
      name: `喀纳斯3日线 ${Number(d2Start.m)}月${Number(d2Start.d)}日团`,
      routeName: '喀纳斯深度3日线',
      routeSource: DepartureRouteSource.manual,
      departureType: DepartureType.combined,
      startDate: new Date(d2Start.iso),
      endDate: new Date(d2End.iso),
      dayCount: dayCount(d2Start.iso, d2End.iso),
      ownerUserId,
      status: DepartureStatus.pending_settlement,
      notes: '测试：部分收款 + 预置未核销流水可匹配',
    },
  })

  const so2Net = 18 * 168000
  const so2 = await prisma.sourceOrder.create({
    data: {
      departureId: dep2.id,
      partnerId: partners.shanghai.id,
      displayName: partners.shanghai.name,
      guestCount: 18,
      adultGuestCount: 18,
      childGuestCount: 0,
      adultUnitPriceCents: 168000,
      childUnitPriceCents: 0,
      grossReceivableCents: so2Net,
      discountType: SourceOrderDiscountType.none,
      discountCents: 0,
      netReceivableCents: so2Net,
      collectionMode: SourceOrderCollectionMode.partner_settled,
      depositCents: 0,
      balanceCents: 0,
      partnerCollectedCents: so2Net,
      guestCollectCents: 0,
    },
  })

  const seg2 = await prisma.itinerarySegment.create({
    data: {
      departureId: dep2.id,
      name: '喀纳斯核心区',
      startDate: new Date(d2Start.iso),
      endDate: new Date(d2Mid.iso),
      dayCount: dayCount(d2Start.iso, d2Mid.iso),
      destination: '喀纳斯',
    },
  })

  const resHotel = await prisma.segmentResource.create({
    data: {
      segmentId: seg2.id,
      resourceKind: ResourceKind.hotel,
      counterpartyType: CounterpartyType.supplier,
      supplierId: suppliers.hotel.id,
      title: '大巴扎酒店连住',
      amountCents: 252000,
    },
  })
  const resBus = await prisma.segmentResource.create({
    data: {
      segmentId: seg2.id,
      resourceKind: ResourceKind.transport,
      counterpartyType: CounterpartyType.supplier,
      supplierId: suppliers.bus.id,
      title: '丝路旅汽包车',
      amountCents: 540000,
    },
  })
  await prisma.segmentResource.create({
    data: {
      segmentId: seg2.id,
      resourceKind: ResourceKind.scenic,
      counterpartyType: CounterpartyType.supplier,
      supplierId: suppliers.kanas.id,
      title: '喀纳斯进山+环保车',
      amountCents: 288000,
    },
  })

  const ar2No = await allocScheduleNo(organizationId, PaymentScheduleDirection.receivable, ym)
  const ar2 = await prisma.paymentSchedule.create({
    data: {
      organizationId,
      departureId: dep2.id,
      direction: PaymentScheduleDirection.receivable,
      scheduleNo: ar2No,
      title: `${so2.displayName} 应收`,
      amountCents: so2Net,
      dueDate: new Date(d2Start.iso),
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partners.shanghai.id,
      counterpartyName: partners.shanghai.name,
      sourceType: 'source_order',
      sourceId: so2.id,
    },
  })

  const ap2No = await allocScheduleNo(organizationId, PaymentScheduleDirection.payable, ym)
  const ap2 = await prisma.paymentSchedule.create({
    data: {
      organizationId,
      departureId: dep2.id,
      direction: PaymentScheduleDirection.payable,
      scheduleNo: ap2No,
      title: resHotel.title,
      amountCents: 252000,
      dueDate: new Date(d2End.iso),
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: suppliers.hotel.id,
      counterpartyName: suppliers.hotel.name,
      sourceType: 'segment_resource',
      sourceId: resHotel.id,
    },
  })

  // 部分收款已核销
  const partial = 1500000
  await createMatchedPayment({
    organizationId,
    schedule: ar2,
    amountCents: partial,
    transactionDateIso: d2Start.iso,
    ymd: d2Start.ymd,
    ym,
    direction: TransactionDirection.inflow,
    paymentChannel: PaymentChannel.bank_transfer,
    counterpartyType: CounterpartyType.partner,
    counterpartyId: partners.shanghai.id,
    counterpartyName: partners.shanghai.name,
    departureId: dep2.id,
    createdBy: financeUserId,
    notes: '首期团款',
  })

  // 待匹配：尾款流入 + 酒店应付流出
  const txTailNo = await allocTxNo(organizationId, d2Mid.ymd)
  await prisma.financeTransaction.create({
    data: {
      organizationId,
      transactionNo: txTailNo,
      direction: TransactionDirection.inflow,
      paymentChannel: PaymentChannel.wechat,
      amountCents: so2Net - partial,
      transactionDate: new Date(d2Mid.iso),
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partners.shanghai.id,
      counterpartyName: partners.shanghai.name,
      departureId: dep2.id,
      notes: '待匹配至喀纳斯团应收尾款',
    },
  })

  const txHotelNo = await allocTxNo(organizationId, d2End.ymd)
  await prisma.financeTransaction.create({
    data: {
      organizationId,
      transactionNo: txHotelNo,
      direction: TransactionDirection.outflow,
      paymentChannel: PaymentChannel.bank_transfer,
      amountCents: 252000,
      transactionDate: new Date(d2End.iso),
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: suppliers.hotel.id,
      counterpartyName: suppliers.hotel.name,
      departureId: dep2.id,
      notes: '待匹配至酒店应付',
    },
  })

  // 未提交应付的包车资源：便于测「提交应付」
  void resBus

  console.log(`Departure 2 ${dep2No} pending_settlement (partial AR + unmatched TX)`)

  // ── 发团 3：编辑中，财务未触发 ──
  const dep3No = await allocDepartureNo(organizationId, ym)
  const dep3 = await prisma.departure.create({
    data: {
      organizationId,
      departureNo: dep3No,
      name: `伊犁河谷2日线 ${Number(d3Start.m)}月${Number(d3Start.d)}日团`,
      routeName: '伊犁河谷风光2日线',
      routeSource: DepartureRouteSource.manual,
      departureType: DepartureType.combined,
      startDate: new Date(d3Start.iso),
      endDate: new Date(d3End.iso),
      dayCount: dayCount(d3Start.iso, d3End.iso),
      ownerUserId,
      status: DepartureStatus.editing,
      notes: '测试：可手动触发提交应收/应付',
    },
  })

  await prisma.sourceOrder.create({
    data: {
      departureId: dep3.id,
      partnerId: partners.local.id,
      displayName: partners.local.name,
      guestCount: 25,
      adultGuestCount: 22,
      childGuestCount: 3,
      adultUnitPriceCents: 98000,
      childUnitPriceCents: 68000,
      grossReceivableCents: 22 * 98000 + 3 * 68000,
      discountType: SourceOrderDiscountType.lump_sum,
      discountCents: 50000,
      discountNotes: '老客户优惠',
      netReceivableCents: 22 * 98000 + 3 * 68000 - 50000,
      collectionMode: SourceOrderCollectionMode.guest_only,
      depositCents: 0,
      balanceCents: 22 * 98000 + 3 * 68000 - 50000,
      partnerCollectedCents: 0,
      guestCollectCents: 22 * 98000 + 3 * 68000 - 50000,
      guests: {
        create: [{ name: '王五', gender: GuestGender.unknown }],
      },
    },
  })

  const seg3 = await prisma.itinerarySegment.create({
    data: {
      departureId: dep3.id,
      name: '那拉提草原',
      startDate: new Date(d3Start.iso),
      endDate: new Date(d3Start.iso),
      dayCount: 1,
      destination: '那拉提',
    },
  })

  await prisma.segmentResource.create({
    data: {
      segmentId: seg3.id,
      resourceKind: ResourceKind.guide,
      counterpartyType: CounterpartyType.supplier,
      supplierId: suppliers.guide.id,
      title: '阿依古丽导游',
      amountCents: 100000,
    },
  })
  await prisma.segmentResource.create({
    data: {
      segmentId: seg3.id,
      resourceKind: ResourceKind.transport,
      counterpartyType: CounterpartyType.supplier,
      supplierId: suppliers.bus.id,
      title: '伊犁包车',
      amountCents: 360000,
    },
  })

  console.log(`Departure 3 ${dep3No} editing`)

  // ── 发团 4：已取消的应付节点（测取消） ──
  const dep4No = await allocDepartureNo(organizationId, ym)
  const d4 = dateOffset(-20)
  const dep4 = await prisma.departure.create({
    data: {
      organizationId,
      departureNo: dep4No,
      name: `吐鲁番1日线 ${Number(d4.m)}月${Number(d4.d)}日团（取消应付样例）`,
      routeName: '吐鲁番一日游',
      routeSource: DepartureRouteSource.manual,
      departureType: DepartureType.independent,
      startDate: new Date(d4.iso),
      endDate: new Date(d4.iso),
      dayCount: 1,
      ownerUserId,
      status: DepartureStatus.editing,
      notes: '测试：含已取消应付节点',
    },
  })

  const apCancelNo = await allocScheduleNo(organizationId, PaymentScheduleDirection.payable, ym)
  await prisma.paymentSchedule.create({
    data: {
      organizationId,
      departureId: dep4.id,
      direction: PaymentScheduleDirection.payable,
      scheduleNo: apCancelNo,
      title: '已取消的景区票应付',
      amountCents: 50000,
      dueDate: new Date(d4.iso),
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: suppliers.disabled.id,
      counterpartyName: suppliers.disabled.name,
      sourceType: 'manual',
      cancelledAt: new Date(),
      cancelReason: '供应商暂停合作，节点作废',
    },
  })

  console.log(`Departure 4 ${dep4No} with cancelled AP ${apCancelNo}`)

  // OTA 伙伴空团位：仅目录覆盖
  void partners.ota
  void partners.archived

  return {
    departures: [dep1No, dep2No, dep3No, dep4No],
  }
}

async function main() {
  console.log('=== Seed XBZL test organization ===')
  const { organization, users } = await createOrgAndUsers()
  const directory = await seedDirectory(organization.id)
  const loop = await seedBusinessLoop(
    organization.id,
    users.xbzl_jd.id,
    users.xbzl_cw.id,
    directory,
  )

  const counts = {
    suppliers: await prisma.supplier.count({ where: { organizationId: organization.id } }),
    partners: await prisma.partner.count({ where: { organizationId: organization.id } }),
    routeTemplates: await prisma.routeTemplate.count({ where: { organizationId: organization.id } }),
    departures: await prisma.departure.count({ where: { organizationId: organization.id } }),
    sourceOrders: await prisma.sourceOrder.count({
      where: { departure: { organizationId: organization.id } },
    }),
    paymentSchedules: await prisma.paymentSchedule.count({
      where: { organizationId: organization.id },
    }),
    transactions: await prisma.financeTransaction.count({
      where: { organizationId: organization.id },
    }),
    verifications: await prisma.financeVerification.count({
      where: { organizationId: organization.id },
    }),
  }

  console.log('=== DONE ===')
  console.log(JSON.stringify({
    organization: { id: organization.id, name: ORG_NAME, businessPrefix: BUSINESS_PREFIX },
    accounts: USERS.map((u) => ({
      username: u.username,
      password: PASSWORD,
      name: u.name,
      role: u.roleName,
    })),
    departureNos: loop.departures,
    counts,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
