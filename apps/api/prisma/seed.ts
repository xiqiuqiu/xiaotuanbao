import {
  MENU_KEY_LABELS,
  PRESET_ROLE_MENU_KEYS,
  PRESET_ROLE_NAMES,
  UserStatus,
  V1_MENU_KEYS,
} from '@xiaotuanbao/shared'
import { PrismaClient } from '@prisma/client'
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
