import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const orgName = process.env.SEED_ORG_NAME ?? '演示旅行社'
  const adminUsername = process.env.SEED_ADMIN_USERNAME ?? 'admin'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123'
  const adminName = process.env.SEED_ADMIN_NAME ?? '演示管理员'

  const existing = await prisma.organization.findFirst({
    where: { name: orgName, deletedAt: null },
  })

  if (existing) {
    console.log(`Seed skipped: organization "${orgName}" already exists.`)
    return
  }

  const passwordHash = await hash(adminPassword, 10)

  const organization = await prisma.organization.create({
    data: {
      name: orgName,
      users: {
        create: {
          username: adminUsername,
          passwordHash,
          name: adminName,
          isPlatformAdmin: false,
        },
      },
    },
  })

  console.log(`Seeded organization "${organization.name}" with admin user "${adminUsername}".`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
