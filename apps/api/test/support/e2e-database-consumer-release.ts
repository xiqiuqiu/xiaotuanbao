import type { Client } from 'pg'

const globalState = globalThis as typeof globalThis & {
  __xiaotuanbaoE2eConsumerLease?: Client
}

export default async function stopE2eDatabaseConsumerLease(): Promise<void> {
  const client = globalState.__xiaotuanbaoE2eConsumerLease
  delete globalState.__xiaotuanbaoE2eConsumerLease
  await client?.end()
}
