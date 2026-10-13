const schemaPattern = /^e2e_jest_[a-z0-9_]+$/
const sharedMode = process.env.XIAOTUANBAO_E2E_SHARED_DATABASE_MODE
const isDemoSeed = process.argv.some((value) =>
  value.includes('seed-demo-business-loop.e2e-spec.ts'),
)

if (sharedMode !== 'seed-demo-loop' || !isDemoSeed) {
  const schema = process.env.XIAOTUANBAO_E2E_SCHEMA
  const runId = process.env.XIAOTUANBAO_E2E_RUN_ID
  const databaseUrl = process.env.DATABASE_URL
  let configuredSchema: string | null = null
  try {
    configuredSchema = databaseUrl ? new URL(databaseUrl).searchParams.get('schema') : null
  } catch {
    configuredSchema = null
  }

  if (
    !schema ||
    !runId ||
    !schemaPattern.test(schema) ||
    schema !== `e2e_jest_${runId}` ||
    configuredSchema !== schema
  ) {
    throw new Error(
      'Refusing to run API E2E against a shared database. Use the package test:e2e scripts so a private schema is provisioned.',
    )
  }
}
