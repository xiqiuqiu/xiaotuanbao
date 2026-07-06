import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 登录接口就绪后在此初始化演示 Organization 与 User。
  const count = await prisma.organization.count()
  if (count > 0) {
    console.log('Seed skipped: organizations already exist.')
    return
  }

  console.log('Seed skipped: no default data configured yet.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
