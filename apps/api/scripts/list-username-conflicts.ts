import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{
      normalized: string
      c: number
      usernames: string[]
      ids: string[]
      org_ids: string[]
    }>
  >`
    SELECT lower(btrim(username)) AS normalized, count(*)::int AS c,
           array_agg(username ORDER BY created_at) AS usernames,
           array_agg(id ORDER BY created_at) AS ids,
           array_agg(organization_id ORDER BY created_at) AS org_ids
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY lower(btrim(username))
    HAVING count(*) > 1
    ORDER BY c DESC
    LIMIT 100
  `
  console.log(JSON.stringify(rows, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
