import { listenConnectionString, PostgresAgentLiveOutput } from './agent-live-output.postgres'
import {
  LIVE_OUTPUT_TRANSACTION_TIMEOUT_MS,
  type LiveOutputSnapshot,
} from './agent-live-output'

const snapshot: LiveOutputSnapshot = {
  attemptId: 'attempt-1',
  organizationId: 'org-1',
  conversationId: 'conversation-1',
  batchId: 'batch-1',
  generation: 1,
  revision: 1,
  reasoningText: '',
  text: '已收到',
}

describe('listenConnectionString', () => {
  it('strips Prisma-only query params so pg LISTEN can connect', () => {
    expect(
      listenConnectionString(
        'postgresql://xiaotuanbao:secret@127.0.0.1:5432/xiaotuanbao?schema=public&connection_limit=20',
      ),
    ).toBe('postgresql://xiaotuanbao:secret@127.0.0.1:5432/xiaotuanbao')
  })
})

describe('PostgresAgentLiveOutput', () => {
  it('uses a long enough transaction timeout for slow live-output writes', async () => {
    let options: unknown
    const prisma = {
      $transaction: async (callback: (tx: any) => Promise<boolean>, txOptions: unknown) => {
        options = txOptions
        return callback({
          aiAgentAttempt: {
            findUnique: async () => ({ status: 'running' }),
          },
          aiAgentLiveOutput: {
            findFirst: async () => null,
            deleteMany: async () => undefined,
            upsert: async () => undefined,
          },
          $executeRaw: async () => undefined,
        })
      },
    }
    const live = new PostgresAgentLiveOutput(prisma as never)

    await live.publish(snapshot)

    expect(options).toEqual({
      maxWait: LIVE_OUTPUT_TRANSACTION_TIMEOUT_MS,
      timeout: LIVE_OUTPUT_TRANSACTION_TIMEOUT_MS,
    })
  })
})
