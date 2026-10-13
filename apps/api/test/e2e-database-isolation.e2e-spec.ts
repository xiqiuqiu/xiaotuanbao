import { PrismaClient } from '@prisma/client'
import {
  cleanupStaleE2eSchemas,
  dropE2eDatabase,
  prepareE2eDatabase,
  releaseE2eDatabaseLease,
} from './support/e2e-database-isolation'

describe('API E2E database isolation', () => {
  const prisma = new PrismaClient()

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('runs the Jest invocation in its own schema instead of the development worker queue', async () => {
    const [database] = await prisma.$queryRaw<
      Array<{ schema: string; searchPath: string[] }>
    >`SELECT current_schema() AS schema, current_schemas(false) AS "searchPath"`
    const isolatedSchema = process.env.XIAOTUANBAO_E2E_SCHEMA

    expect(isolatedSchema).toMatch(/^e2e_jest_[a-z0-9_]+$/)
    expect(database).toEqual({
      schema: isolatedSchema,
      searchPath: [isolatedSchema],
    })
  })

  it('recovers an abandoned owned schema without deleting an unowned lookalike', async () => {
    const databaseUrl = process.env.DATABASE_URL!
    const foreignSchema = `e2e_jest_foreign_${process.pid}_${Date.now()}`
    let abandoned = undefined as Awaited<ReturnType<typeof prepareE2eDatabase>> | undefined
    let active = undefined as Awaited<ReturnType<typeof prepareE2eDatabase>> | undefined

    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${foreignSchema}"`)
    try {
      abandoned = await prepareE2eDatabase(databaseUrl)
      await releaseE2eDatabaseLease(abandoned.runId)
      active = await prepareE2eDatabase(databaseUrl)

      const schemas = await prisma.$queryRaw<Array<{ schema: string }>>`
        SELECT nspname AS schema
        FROM pg_namespace
        WHERE nspname IN (${abandoned.schema}, ${active.schema}, ${foreignSchema})
        ORDER BY nspname
      `
      expect(schemas.map((row) => row.schema)).toEqual(
        [active.schema, foreignSchema].sort(),
      )

      expect(await cleanupStaleE2eSchemas(databaseUrl)).toEqual([])
      expect(await prisma.user.count({ where: { username: 'wangjie' } })).toBe(1)
    } finally {
      if (active) {
        await dropE2eDatabase(databaseUrl, active.schema, active.runId)
      }
      if (abandoned) {
        await dropE2eDatabase(databaseUrl, abandoned.schema, abandoned.runId)
      }
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${foreignSchema}" CASCADE`)
    }
  })
})
