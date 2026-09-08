import { PrismaClient } from '@prisma/client'

// 只复制真实列类型到临时表，不写入任何业务记录。
describe('review version storage', () => {
  const prisma = new PrismaClient()
  afterAll(() => prisma.$disconnect())

  it('round-trips adjacent millisecond versions in packages and audit records', async () => {
    const version = Date.parse('2026-09-07T13:58:44.503Z')
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE qa_package_version ON COMMIT DROP AS
        SELECT base_object_version AS version FROM ai_review_packages WITH NO DATA`
      await tx.$executeRaw`CREATE TEMP TABLE qa_record_version ON COMMIT DROP AS
        SELECT object_version AS version FROM ai_review_records WITH NO DATA`
      await tx.$executeRaw`INSERT INTO qa_package_version VALUES (${version}), (${version + 1})`
      await tx.$executeRaw`INSERT INTO qa_record_version VALUES (${version}), (${version + 1})`
      const packages = await tx.$queryRaw<Array<{ version: number }>>`SELECT version FROM qa_package_version ORDER BY version`
      const records = await tx.$queryRaw<Array<{ version: number }>>`SELECT version FROM qa_record_version ORDER BY version`
      expect(packages.map((row) => row.version)).toEqual([version, version + 1])
      expect(records.map((row) => row.version)).toEqual([version, version + 1])
    })
  })
})
