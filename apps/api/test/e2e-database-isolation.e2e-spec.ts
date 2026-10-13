import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'
import {
  cleanupStaleE2eSchemas,
  dropE2eDatabase,
  E2E_CONSUMER_APPLICATION_PREFIX,
  ownedE2eSchemaRunId,
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
    const consumerApplication = `${E2E_CONSUMER_APPLICATION_PREFIX}${process.env.XIAOTUANBAO_E2E_RUN_ID}`
    const consumers = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_stat_activity
      WHERE application_name = ${consumerApplication}
    `
    expect(consumers[0]?.count).toBe(1n)
  })

  it('only recognizes ownership when the marker run matches the schema name', () => {
    expect(
      ownedE2eSchemaRunId(
        'e2e_jest_owned_run',
        'xiaotuanbao-e2e:owned_run:1791849600000',
      ),
    ).toBe('owned_run')
    expect(
      ownedE2eSchemaRunId(
        'e2e_jest_foreign_run',
        'xiaotuanbao-e2e:owned_run:1791849600000',
      ),
    ).toBeNull()
    expect(ownedE2eSchemaRunId('e2e_jest_unowned', null)).toBeNull()
  })

  it('keeps an abandoned schema while a Jest consumer lease is active, then recovers it', async () => {
    const databaseUrl = process.env.DATABASE_URL!
    let abandoned = undefined as Awaited<ReturnType<typeof prepareE2eDatabase>> | undefined
    let active = undefined as Awaited<ReturnType<typeof prepareE2eDatabase>> | undefined
    let consumer = undefined as Client | undefined

    try {
      abandoned = await prepareE2eDatabase(databaseUrl)
      await releaseE2eDatabaseLease(abandoned.runId)
      const baseUrl = new URL(databaseUrl)
      baseUrl.searchParams.delete('schema')
      consumer = new Client({
        connectionString: baseUrl.toString(),
        application_name: `${E2E_CONSUMER_APPLICATION_PREFIX}${abandoned.runId}`,
      })
      await consumer.connect()
      active = await prepareE2eDatabase(databaseUrl)

      const schemas = await prisma.$queryRaw<Array<{ schema: string }>>`
        SELECT nspname AS schema
        FROM pg_namespace
        WHERE nspname IN (${abandoned.schema}, ${active.schema})
        ORDER BY nspname
      `
      expect(schemas.map((row) => row.schema)).toEqual(
        [abandoned.schema, active.schema].sort(),
      )

      expect(await cleanupStaleE2eSchemas(databaseUrl)).toEqual([])
      await consumer.end()
      consumer = undefined
      expect(await cleanupStaleE2eSchemas(databaseUrl)).toEqual([abandoned.schema])
      expect(await prisma.user.count({ where: { username: 'wangjie' } })).toBe(1)
    } finally {
      await consumer?.end()
      if (active) {
        await dropE2eDatabase(databaseUrl, active.schema, active.runId)
      }
      if (abandoned) {
        await dropE2eDatabase(databaseUrl, abandoned.schema, abandoned.runId)
      }
    }
  })
})
