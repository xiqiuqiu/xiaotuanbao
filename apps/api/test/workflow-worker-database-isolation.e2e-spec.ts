import { execFileSync, spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'
import {
  dropE2eDatabase,
  prepareE2eDatabase,
  type E2eDatabaseLease,
} from './support/e2e-database-isolation'
import {
  resolvedItemOutcome,
  startDeterministicHeadlessAgent,
} from './support/deterministic-headless-agent'

const AGENT_SECRET = 'e2e-agent-service-secret'

describe('workflow worker database isolation', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  let emptyWorkerDatabase: E2eDatabaseLease
  const apiRoot = resolve(__dirname, '..')

  beforeAll(async () => {
    let apiBaseUrl = ''
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET
    agent = await startDeterministicHeadlessAgent({
      getApiBaseUrl: () => apiBaseUrl,
      serviceSecret: AGENT_SECRET,
      outcome: resolvedItemOutcome({
        kind: 'answered',
        message: '隔离 worker 已处理测试任务。',
        completionBasis: { kind: 'final_answer' },
      }),
    })
    process.env.AGENT_INTERNAL_URL = agent.origin

    app = await createTestApp()
    const address = app.getHttpServer().address() as AddressInfo
    apiBaseUrl = `http://127.0.0.1:${address.port}`
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    const owner = await prisma.user.findFirstOrThrow({
      where: { username: 'wangjie', deletedAt: null },
    })
    ownerUserId = owner.id

    emptyWorkerDatabase = await prepareE2eDatabase(process.env.DATABASE_URL!)
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: emptyWorkerDatabase.databaseUrl },
      stdio: 'pipe',
    })
  })

  afterAll(async () => {
    const failures: unknown[] = []
    const settle = async (operation: Promise<unknown> | undefined) => {
      try {
        await operation
      } catch (error) {
        failures.push(error)
      }
    }
    await settle(prisma?.$disconnect())
    await settle(app?.close())
    await settle(agent?.close())
    if (emptyWorkerDatabase) {
      await settle(
        dropE2eDatabase(
          process.env.DATABASE_URL!,
          emptyWorkerDatabase.schema,
          emptyWorkerDatabase.runId,
        ),
      )
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'workflow worker isolation teardown failed')
    }
  })

  async function expectProcessCount(
    database: E2eDatabaseLease,
    expected: number,
  ): Promise<void> {
    const child = spawn(
      'pnpm',
      ['exec', 'jest', '--config', 'jest-workflow-probe.config.js', '--runInBand'],
      {
        cwd: apiRoot,
        env: {
          ...process.env,
          DATABASE_URL: database.databaseUrl,
          XIAOTUANBAO_E2E_EXPECTED_PROCESSED: String(expected),
          XIAOTUANBAO_E2E_RUN_ID: database.runId,
          XIAOTUANBAO_E2E_SCHEMA: database.schema,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    const code = await new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (exitCode) => resolve(exitCode ?? 1))
    })
    if (code !== 0) {
      throw new Error(
        `workflow consumer probe failed code=${code} stdout=${stdout} stderr=${stderr}`,
      )
    }
  }

  // Each assertion boots a real one-shot Nest/Jest consumer; cold CI runners can
  // exceed the suite-wide 30s default even though the processor calls are bounded.
  it('lets a same-schema consumer claim the queued job but hides it from another schema', async () => {
    const opened = await authRequest(app, coordinatorToken)
      .post('/api/agent/tasks/departure-creation/sessions')
      .send({
        draft: {
          mode: 'manual',
          routeName: 'e2e-worker-isolation-route',
          name: 'e2e-worker-isolation-departure',
          startDate: '2026-10-20',
          endDate: '2026-10-22',
          ownerUserId,
          departureType: DepartureType.combined,
        },
      })
      .expect(201)
    const taskId = opened.body.data.task.id as string
    const conversationId = opened.body.data.conversation.id as string

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-worker-isolation-${taskId}`)
      .send({ text: '请记录这条隔离测试消息', primaryTaskId: taskId })
      .expect(201)
    expect(
      await prisma.aiWorkflowJob.count({
        where: { conversationId, status: 'pending' },
      }),
    ).toBe(1)

    await expectProcessCount(emptyWorkerDatabase, 0)
    expect(
      await prisma.aiWorkflowJob.count({
        where: { conversationId, status: 'pending' },
      }),
    ).toBe(1)

    await expectProcessCount(
      {
        databaseUrl: process.env.DATABASE_URL!,
        runId: process.env.XIAOTUANBAO_E2E_RUN_ID!,
        schema: process.env.XIAOTUANBAO_E2E_SCHEMA!,
      },
      1,
    )
    expect(
      await prisma.aiWorkflowJob.count({
        where: { conversationId, status: 'pending' },
      }),
    ).toBe(0)
    expect(agent.callCount()).toBe(1)
  }, 60_000)
})
