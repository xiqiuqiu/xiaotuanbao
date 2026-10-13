import { Client } from 'pg'
import { E2E_CONSUMER_APPLICATION_PREFIX } from './e2e-database-isolation'

const globalState = globalThis as typeof globalThis & {
  __xiaotuanbaoE2eConsumerLease?: Client
}

export default async function startE2eDatabaseConsumerLease(): Promise<void> {
  const isDemoSeed = process.argv.some((value) =>
    value.includes('seed-demo-business-loop.e2e-spec.ts'),
  )
  if (
    process.env.XIAOTUANBAO_E2E_SHARED_DATABASE_MODE === 'seed-demo-loop' &&
    isDemoSeed
  ) {
    return
  }
  const databaseUrl = process.env.DATABASE_URL
  const runId = process.env.XIAOTUANBAO_E2E_RUN_ID
  if (!databaseUrl || !runId) {
    throw new Error('Cannot start the E2E consumer lease without DATABASE_URL and run ID')
  }
  const connectionUrl = new URL(databaseUrl)
  connectionUrl.searchParams.delete('schema')
  const client = new Client({
    connectionString: connectionUrl.toString(),
    application_name: `${E2E_CONSUMER_APPLICATION_PREFIX}${runId}`,
  })
  await client.connect()
  globalState.__xiaotuanbaoE2eConsumerLease = client
}
