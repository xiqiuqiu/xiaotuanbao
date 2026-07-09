import {
  MENU_KEY_LABELS,
  PRESET_ROLE_MENU_KEYS,
  PRESET_ROLE_NAMES,
  UserStatus,
  V1_MENU_KEYS,
} from '@xiaotuanbao/shared'
import {
  DirectoryProfileStatus,
  InvoiceAvailable,
  InvoiceType,
  PartnerContactRole,
  PartnerKind,
  PartnerType,
  PrismaClient,
  SettlementCycle,
  SettlementMethod,
  ResourceKind,
} from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function seedRoleCatalog() {
  for (const key of V1_MENU_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, name: MENU_KEY_LABELS[key] },
      update: { name: MENU_KEY_LABELS[key] },
    })
  }

  const permissions = await prisma.permission.findMany()
  const permissionByKey = new Map(permissions.map((item) => [item.key, item]))

  for (const roleName of Object.values(PRESET_ROLE_NAMES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName },
      update: {},
    })

    const menuKeys = PRESET_ROLE_MENU_KEYS[roleName]
    for (const menuKey of menuKeys) {
      const permission = permissionByKey.get(menuKey)
      if (!permission) {
        throw new Error(`Missing permission for menu key: ${menuKey}`)
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
        update: {},
      })
    }
  }
}

async function assignRole(username: string, organizationId: string, roleName: string) {
  const user = await prisma.user.findFirst({
    where: { username, organizationId, deletedAt: null },
  })
  const role = await prisma.role.findUnique({ where: { name: roleName } })

  if (!user || !role) {
    return
  }

  await prisma.userRole.deleteMany({ where: { userId: user.id } })
  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id },
  })
}

async function seedDemoOrganization() {
  const orgName = process.env.SEED_ORG_NAME ?? '演示旅行社'
  const adminUsername = process.env.SEED_ADMIN_USERNAME ?? 'admin'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123'
  const adminName = process.env.SEED_ADMIN_NAME ?? '演示管理员'

  let organization = await prisma.organization.findFirst({
    where: { name: orgName, deletedAt: null },
  })

  if (!organization) {
    const passwordHash = await hash(adminPassword, 10)
    organization = await prisma.organization.create({
      data: {
        name: orgName,
        businessPrefix: process.env.SEED_ORG_BUSINESS_PREFIX ?? 'XTB',
        users: {
          create: {
            username: adminUsername,
            passwordHash,
            name: adminName,
            isPlatformAdmin: false,
            status: UserStatus.ENABLED,
          },
        },
      },
    })
    console.log(`Seeded organization "${organization.name}" with admin user "${adminUsername}".`)
  } else if (!organization.businessPrefix) {
    organization = await prisma.organization.update({
      where: { id: organization.id },
      data: { businessPrefix: process.env.SEED_ORG_BUSINESS_PREFIX ?? 'XTB' },
    })
  }

  await assignRole(adminUsername, organization.id, PRESET_ROLE_NAMES.ORG_ADMIN)

  const demoUsers = [
    {
      username: 'wangjie',
      name: '王姐',
      password: 'admin123',
      roleName: PRESET_ROLE_NAMES.COORDINATOR,
    },
    {
      username: 'acai',
      name: '阿财',
      password: 'admin123',
      roleName: PRESET_ROLE_NAMES.FINANCE,
    },
    {
      username: 'mazong',
      name: '马总',
      password: 'admin123',
      roleName: PRESET_ROLE_NAMES.ORG_ADMIN,
    },
  ] as const

  for (const demoUser of demoUsers) {
    const existing = await prisma.user.findFirst({
      where: {
        organizationId: organization.id,
        username: demoUser.username,
        deletedAt: null,
      },
    })

    if (!existing) {
      const passwordHash = await hash(demoUser.password, 10)
      await prisma.user.create({
        data: {
          organizationId: organization.id,
          username: demoUser.username,
          passwordHash,
          name: demoUser.name,
          status: UserStatus.ENABLED,
        },
      })
      console.log(`Seeded demo user "${demoUser.username}".`)
    }

    await assignRole(demoUser.username, organization.id, demoUser.roleName)
  }

  await seedDemoSuppliers(organization.id)
  await seedDemoPartners(organization.id)

  return organization
}

const DEMO_SUPPLIERS = [
  {
    name: '西湖国宾馆',
    categories: [ResourceKind.hotel, ResourceKind.meal],
    status: DirectoryProfileStatus.active,
    contactName: '李经理',
    contactPhone: '13805718801',
    settlementMethod: SettlementMethod.postpay,
    settlementCycle: SettlementCycle.monthly,
    settlementNotes: '出团后 15 个工作日结清',
    referenceQuoteNotes: '标间 680/间夜，含双早',
    invoiceAvailable: InvoiceAvailable.yes,
    invoiceType: InvoiceType.special,
    taxRate: '6%',
    accountName: '杭州西湖国宾馆管理有限公司',
    bankName: '中国工商银行杭州西湖支行',
    bankAccount: '6222021200001234567',
    businessNotes: '旺季需提前 7 天确认房量，支持临时加房',
  },
  {
    name: '楼外楼（孤山店）',
    categories: [ResourceKind.meal],
    status: DirectoryProfileStatus.active,
    contactName: '王主管',
    contactPhone: '13905718802',
    settlementMethod: SettlementMethod.cash,
    settlementCycle: SettlementCycle.per_group,
    settlementNotes: '每团现结，签单后 3 日内付款',
    referenceQuoteNotes: '团队餐标 80/100/120 三档',
    invoiceAvailable: InvoiceAvailable.yes,
    invoiceType: InvoiceType.normal,
    taxRate: '3%',
    accountName: '杭州楼外楼餐饮有限公司',
    bankName: '中国建设银行杭州分行',
    bankAccount: '6227001200007654321',
    businessNotes: '需提前 2 天报人数，最大接待 300 人',
  },
  {
    name: '杭州中亚旅汽',
    categories: [ResourceKind.transport],
    status: DirectoryProfileStatus.active,
    contactName: '赵调度',
    contactPhone: '13705718803',
    settlementMethod: SettlementMethod.postpay,
    settlementCycle: SettlementCycle.semi_monthly,
    settlementNotes: '半月结对账，次月 5 日前付款',
    referenceQuoteNotes: '33 座 800/天，45 座 1200/天',
    invoiceAvailable: InvoiceAvailable.yes,
    invoiceType: InvoiceType.special,
    taxRate: '9%',
    accountName: '杭州中亚旅游汽车有限公司',
    bankName: '中国银行杭州余杭支行',
    bankAccount: '6216601200009876543',
    businessNotes: '含司机餐补，不含过路费',
  },
  {
    name: '张导游（西湖线）',
    categories: [ResourceKind.guide],
    status: DirectoryProfileStatus.disabled,
    contactName: '张导',
    contactPhone: '13605718804',
    settlementMethod: SettlementMethod.cash,
    settlementCycle: SettlementCycle.per_group,
    referenceQuoteNotes: '中文导游 400/天，含讲解',
    invoiceAvailable: InvoiceAvailable.no,
    businessNotes: '暂时不接新团，恢复合作前请勿安排',
  },
  {
    name: '灵隐飞来峰',
    categories: [ResourceKind.scenic],
    status: DirectoryProfileStatus.active,
    contactName: '票务中心',
    contactPhone: '0571-87968665',
    settlementMethod: SettlementMethod.prepay,
    settlementCycle: SettlementCycle.per_group,
    referenceQuoteNotes: '团队票 45/人，需提前 1 天预约',
    invoiceAvailable: InvoiceAvailable.yes,
    invoiceType: InvoiceType.normal,
    taxRate: '6%',
  },
  {
    name: '宋城演艺',
    categories: [ResourceKind.entertainment],
    status: DirectoryProfileStatus.active,
    contactName: '陈销售',
    contactPhone: '13505718805',
    settlementMethod: SettlementMethod.prepay,
    settlementCycle: SettlementCycle.per_group,
    settlementNotes: '预付锁票，取消需提前 48 小时',
    referenceQuoteNotes: '千古情团队票 280/人',
    invoiceAvailable: InvoiceAvailable.yes,
    invoiceType: InvoiceType.special,
    taxRate: '6%',
    accountName: '杭州宋城集团控股有限公司',
    bankName: '招商银行杭州分行',
    bankAccount: '6214851200001122334',
  },
  {
    name: '浙江大地保险',
    categories: [ResourceKind.insurance],
    status: DirectoryProfileStatus.active,
    contactName: '周专员',
    contactPhone: '13405718806',
    settlementMethod: SettlementMethod.postpay,
    settlementCycle: SettlementCycle.monthly,
    referenceQuoteNotes: '境内游 10/人/天，含意外医疗',
    invoiceAvailable: InvoiceAvailable.yes,
    invoiceType: InvoiceType.normal,
    taxRate: '6%',
  },
  {
    name: '千岛湖中心湖区票务',
    categories: [ResourceKind.ticket],
    status: DirectoryProfileStatus.active,
    contactName: '孙票务',
    contactPhone: '13305718807',
    settlementMethod: SettlementMethod.cash,
    settlementCycle: SettlementCycle.per_group,
    referenceQuoteNotes: '船票+门票联票 150/人',
    invoiceAvailable: InvoiceAvailable.no,
  },
  {
    name: '河坊街丝绸馆（已合作终止）',
    categories: [ResourceKind.shop],
    status: DirectoryProfileStatus.archived,
    contactName: '刘店长',
    contactPhone: '13205718808',
    settlementMethod: SettlementMethod.cash,
    settlementCycle: SettlementCycle.per_group,
    businessNotes: '2025 年已终止合作，仅供历史团单追溯',
  },
  {
    name: '黄山迎客松酒店',
    categories: [ResourceKind.hotel],
    status: DirectoryProfileStatus.active,
    contactName: '吴经理',
    contactPhone: '13105598809',
    settlementMethod: SettlementMethod.prepay,
    settlementCycle: SettlementCycle.weekly,
    settlementNotes: '预付 50%，余款离店前结清',
    referenceQuoteNotes: '标间 520/间夜，淡季可议价',
    invoiceAvailable: InvoiceAvailable.yes,
    invoiceType: InvoiceType.special,
    taxRate: '6%',
    accountName: '黄山迎客松宾馆有限公司',
    bankName: '中国农业银行黄山分行',
    bankAccount: '6228481200005566778',
    businessNotes: '山顶酒店，行李需索道托运',
  },
  {
    name: '乌镇西栅景区',
    categories: [ResourceKind.scenic],
    status: DirectoryProfileStatus.active,
    contactName: '钱对接',
    contactPhone: '13005718810',
    settlementMethod: SettlementMethod.postpay,
    settlementCycle: SettlementCycle.as_agreed,
    settlementNotes: '按实际入园人数结算，对账后 10 日付款',
    referenceQuoteNotes: '西栅团队票 120/人，含游船',
    invoiceAvailable: InvoiceAvailable.yes,
    invoiceType: InvoiceType.normal,
    taxRate: '6%',
  },
  {
    name: '备用资源-其他类',
    categories: [ResourceKind.other],
    status: DirectoryProfileStatus.active,
    contactName: '计调自建',
    contactPhone: '12905718811',
    businessNotes: '杂项资源占位，字段最少便于测轻量创建对比',
  },
]

async function seedDemoSuppliers(organizationId: string) {
  for (const supplier of DEMO_SUPPLIERS) {
    const { name, ...fields } = supplier
    await prisma.supplier.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name,
        },
      },
      create: {
        organizationId,
        name,
        ...fields,
      },
      update: fields,
    })
  }

  console.log(`Seeded ${DEMO_SUPPLIERS.length} demo suppliers.`)
}

const DEMO_PARTNERS = [
  {
    name: '华东国旅（上海）',
    partnerKind: PartnerKind.group_agent,
    partnerType: PartnerType.group_agency,
    status: DirectoryProfileStatus.active,
    contactName: '陈计调',
    contactRole: PartnerContactRole.operator,
    contactPhone: '13801668801',
    settlementMethod: SettlementMethod.postpay,
    paymentTermRule: SettlementCycle.monthly,
    settlementNotes: '月结 30 天，每月 5 日前对账',
  },
  {
    name: '浙旅集团杭州分公司',
    partnerKind: PartnerKind.group_agent,
    partnerType: PartnerType.integrated_agency,
    status: DirectoryProfileStatus.active,
    contactName: '林经理',
    contactRole: PartnerContactRole.sales,
    contactPhone: '13801668802',
    settlementMethod: SettlementMethod.postpay,
    paymentTermRule: SettlementCycle.semi_monthly,
    settlementNotes: '半月结对账',
  },
  {
    name: '苏州水乡地接社',
    partnerKind: PartnerKind.peer,
    partnerType: PartnerType.local_agency,
    status: DirectoryProfileStatus.active,
    contactName: '周计调',
    contactRole: PartnerContactRole.operator,
    contactPhone: '13801668803',
    settlementMethod: SettlementMethod.prepay,
    paymentTermRule: SettlementCycle.per_group,
    settlementNotes: '预付 50%，余款回团后 7 日结清',
  },
  {
    name: '黄山徽行天下地接',
    partnerKind: PartnerKind.peer,
    partnerType: PartnerType.local_agency,
    status: DirectoryProfileStatus.active,
    contactName: '吴老板',
    contactRole: PartnerContactRole.owner,
    contactPhone: '13801668804',
    settlementMethod: SettlementMethod.cash,
    paymentTermRule: SettlementCycle.per_group,
    settlementNotes: '每团结清',
  },
  {
    name: '携程渠道华东区',
    partnerKind: PartnerKind.both,
    partnerType: PartnerType.wholesaler,
    status: DirectoryProfileStatus.active,
    contactName: '郑对接',
    contactRole: PartnerContactRole.sales,
    contactPhone: '13801668805',
    settlementMethod: SettlementMethod.postpay,
    paymentTermRule: SettlementCycle.monthly,
    settlementNotes: '按平台规则月结',
  },
  {
    name: '同程旅行浙江站',
    partnerKind: PartnerKind.both,
    partnerType: PartnerType.wholesaler,
    status: DirectoryProfileStatus.active,
    contactName: '钱专员',
    contactRole: PartnerContactRole.customer_service,
    contactPhone: '13801668806',
    settlementMethod: SettlementMethod.postpay,
    paymentTermRule: SettlementCycle.as_agreed,
    settlementNotes: '按合同约定',
  },
  {
    name: '南京中山国旅',
    partnerKind: PartnerKind.group_agent,
    partnerType: PartnerType.group_agency,
    status: DirectoryProfileStatus.disabled,
    contactName: '孙计调',
    contactRole: PartnerContactRole.operator,
    contactPhone: '13801668807',
    settlementMethod: SettlementMethod.postpay,
    paymentTermRule: SettlementCycle.monthly,
    settlementNotes: '暂停合作中，恢复前勿发团',
  },
  {
    name: '无锡太湖国旅（已终止）',
    partnerKind: PartnerKind.group_agent,
    partnerType: PartnerType.group_agency,
    status: DirectoryProfileStatus.archived,
    contactName: '冯经理',
    contactRole: PartnerContactRole.finance,
    contactPhone: '13801668808',
    settlementMethod: SettlementMethod.cash,
    paymentTermRule: SettlementCycle.per_group,
    settlementNotes: '2025 年已终止合作，仅供历史追溯',
  },
  {
    name: '福建土楼专线地接',
    partnerKind: PartnerKind.peer,
    partnerType: PartnerType.local_agency,
    status: DirectoryProfileStatus.active,
    contactName: '黄计调',
    contactRole: PartnerContactRole.operator,
    contactPhone: '13801668809',
    settlementMethod: SettlementMethod.postpay,
    paymentTermRule: SettlementCycle.weekly,
    settlementNotes: '周结，每周一核对上周团款',
  },
  {
    name: '备用合作伙伴',
    partnerKind: PartnerKind.both,
    partnerType: PartnerType.other,
    status: DirectoryProfileStatus.active,
    contactName: '计调自建',
    contactPhone: '13801668810',
    settlementNotes: '字段最少，便于测轻量创建',
  },
]

async function seedDemoPartners(organizationId: string) {
  for (const partner of DEMO_PARTNERS) {
    const { name, ...fields } = partner
    await prisma.partner.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name,
        },
      },
      create: {
        organizationId,
        name,
        ...fields,
      },
      update: fields,
    })
  }

  console.log(`Seeded ${DEMO_PARTNERS.length} demo partners.`)
}

async function main() {
  await seedRoleCatalog()
  await seedDemoOrganization()
  console.log('Seed completed.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
