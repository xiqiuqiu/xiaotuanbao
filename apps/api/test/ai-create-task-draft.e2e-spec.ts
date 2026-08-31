import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('AI create task + departure creation draft (e2e) #296', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-ai-draft-${Date.now()}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
    ownerUserId = user.id
  })

  afterAll(async () => {
    await prisma.aiCreateIdempotencyRecord.deleteMany({
      where: { organizationId, idempotencyKey: { startsWith: testPrefix } },
    })
    await prisma.departureCreationDraft.deleteMany({
      where: { task: { agentTask: { organizationId, ownerUserId } } },
    })
    await prisma.agentTask.deleteMany({
      where: { organizationId, ownerUserId },
    })
    await prisma.segmentResource.deleteMany({
      where: {
        segment: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.itinerarySegment.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  function draftBody(overrides: Record<string, unknown> = {}) {
    return {
      mode: 'manual',
      routeName: `${testPrefix}-路线`,
      name: `${testPrefix}-团`,
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      ownerUserId,
      departureType: DepartureType.combined,
      expectedGuestCountHint: 12,
      ...overrides,
    }
  }

  it('forbids finance role from creating or reading AI create drafts', async () => {
    await authRequest(app, financeToken)
      .post('/api/ai-create-tasks/draft')
      .send({ draft: draftBody({ name: `${testPrefix}-finance` }) })
      .expect(403)
  })

  it('creates in-progress task + draft on first valid save and returns version 1', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({ draft: draftBody({ name: `${testPrefix}-first` }) })
      .expect(201)

    expect(response.body.data).toMatchObject({
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: ownerUserId,
      draft: {
        version: 1,
        snapshot: {
          mode: 'manual',
          routeName: `${testPrefix}-路线`,
          name: `${testPrefix}-first`,
          expectedGuestCountHint: 12,
        },
      },
    })

    const task = await prisma.aiCreateTask.findUnique({
      where: { id: response.body.data.id },
      include: { draft: true, agentTask: true },
    })
    expect(task?.agentTask.status).toBe('active')
    expect(task?.draft?.version).toBe(1)
    expect(task?.departureId).toBeNull()
  })

  it('increments draft version on save and restores from server snapshot', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({ draft: draftBody({ name: `${testPrefix}-v1` }) })
      .expect(201)

    const taskId = created.body.data.id as string

    const saved = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        taskId,
        expectedVersion: 1,
        draft: draftBody({
          name: `${testPrefix}-v2`,
          notes: '更新备注',
          expectedGuestCountHint: 20,
        }),
      })
      .expect(200)

    expect(saved.body.data.draft.version).toBe(2)
    expect(saved.body.data.draft.snapshot.name).toBe(`${testPrefix}-v2`)
    expect(saved.body.data.draft.snapshot.expectedGuestCountHint).toBe(20)

    const restored = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${taskId}`)
      .expect(200)

    expect(restored.body.data).toMatchObject({
      id: taskId,
      draft: {
        version: 2,
        snapshot: {
          name: `${testPrefix}-v2`,
          notes: '更新备注',
          expectedGuestCountHint: 20,
        },
      },
    })
  })

  it('rejects stale expectedVersion and does not advance the draft', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({ draft: draftBody({ name: `${testPrefix}-conflict` }) })
      .expect(201)

    const taskId = created.body.data.id as string

    const conflict = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        taskId,
        expectedVersion: 0,
        draft: draftBody({ name: `${testPrefix}-stale` }),
      })
      .expect(409)

    expect(conflict.body.data.draft.version).toBe(1)
    expect(conflict.body.data.draft.snapshot.name).toBe(`${testPrefix}-conflict`)
  })

  it('confirms draft into a single editing Departure without pre-allocating departureNo on draft', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        draft: draftBody({
          name: `${testPrefix}-confirm`,
          expectedGuestCountHint: 8,
          notes: '正式备注',
        }),
      })
      .expect(201)

    const taskId = created.body.data.id as string
    expect(created.body.data.draft.snapshot).not.toHaveProperty('departureNo')

    const idempotencyKey = `${testPrefix}-confirm-once`
    const confirmed = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/confirm`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ expectedVersion: 1 })
      .expect(201)

    expect(confirmed.body.data).toMatchObject({
      name: `${testPrefix}-confirm`,
      routeName: `${testPrefix}-路线`,
      status: 'editing',
      notes: '正式备注',
      dayCount: 5,
    })
    expect(confirmed.body.data.departureNo).toEqual(expect.any(String))
    expect(confirmed.body.data.notes).not.toContain('8')

    const departure = await prisma.departure.findUnique({
      where: { id: confirmed.body.data.id },
    })
    expect(departure?.status).toBe('editing')
    expect(departure?.notes).toBe('正式备注')

    const task = await prisma.aiCreateTask.findUnique({
      where: { id: taskId },
      include: { agentTask: true },
    })
    expect(task?.departureId).toBe(confirmed.body.data.id)
    expect(task?.departureCreationCommittedAt).toEqual(expect.any(Date))
    expect(task?.agentTask.status).toBe('active')
    await expect(
      prisma.taskActivity.findFirst({ where: { taskId, kind: 'completed' } }),
    ).resolves.toBeNull()

    const retry = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/confirm`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ expectedVersion: 1 })
      .expect(201)

    expect(retry.body.data.id).toBe(confirmed.body.data.id)

    const count = await prisma.departure.count({
      where: { organizationId, name: `${testPrefix}-confirm` },
    })
    expect(count).toBe(1)
  })

  it('does not recreate a Departure when the formal target is purged', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({ draft: draftBody({ name: `${testPrefix}-purge-bound` }) })
      .expect(201)
    const taskId = created.body.data.id as string

    const confirmed = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/confirm`)
      .set('Idempotency-Key', `${testPrefix}-purge-bound-first`)
      .send({ expectedVersion: 1 })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .delete(`/api/departures/${confirmed.body.data.id}`)
      .expect(200)

    await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/confirm`)
      .set('Idempotency-Key', `${testPrefix}-purge-bound-second`)
      .send({ expectedVersion: 1 })
      .expect(409)

    await expect(
      prisma.departure.count({
        where: { organizationId, name: `${testPrefix}-purge-bound` },
      }),
    ).resolves.toBe(0)
  })

  it('keeps draft retryable when confirm validation fails without creating Departure', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        draft: draftBody({
          name: `${testPrefix}-bad-confirm`,
          endDate: '2026-08-01',
          startDate: '2026-09-01',
        }),
      })
      .expect(201)

    const taskId = created.body.data.id as string

    await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/confirm`)
      .set('Idempotency-Key', `${testPrefix}-bad-confirm`)
      .send({ expectedVersion: 1 })
      .expect(400)

    const task = await prisma.aiCreateTask.findUnique({
      where: { id: taskId },
      include: { draft: true },
    })
    expect(task?.departureId).toBeNull()
    expect(task?.draft?.version).toBe(1)

    const count = await prisma.departure.count({
      where: { organizationId, name: `${testPrefix}-bad-confirm` },
    })
    expect(count).toBe(0)
  })

  it('serializes concurrent confirms with different idempotency keys into one Departure', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({ draft: draftBody({ name: `${testPrefix}-concurrent-confirm` }) })
      .expect(201)

    const taskId = created.body.data.id as string

    const responses = await Promise.all(
      [`${testPrefix}-confirm-a`, `${testPrefix}-confirm-b`].map((key) =>
        authRequest(app, coordinatorToken)
          .post(`/api/ai-create-tasks/${taskId}/confirm`)
          .set('Idempotency-Key', key)
          .send({ expectedVersion: 1 }),
      ),
    )

    expect(responses.every((response) => response.status === 201)).toBe(true)
    const departureIds = new Set(responses.map((response) => response.body.data.id))
    expect(departureIds.size).toBe(1)

    const count = await prisma.departure.count({
      where: { organizationId, name: `${testPrefix}-concurrent-confirm` },
    })
    expect(count).toBe(1)
  })

  it('rejects concurrent draft saves with the same expectedVersion', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({ draft: draftBody({ name: `${testPrefix}-cas` }) })
      .expect(201)

    const taskId = created.body.data.id as string

    const responses = await Promise.all(
      [`${testPrefix}-cas-a`, `${testPrefix}-cas-b`].map((name) =>
        authRequest(app, coordinatorToken)
          .post('/api/ai-create-tasks/draft')
          .send({
            taskId,
            expectedVersion: 1,
            draft: draftBody({ name }),
          }),
      ),
    )

    const statuses = responses.map((response) => response.status).sort()
    expect(statuses).toEqual([200, 409])

    const winner = responses.find((response) => response.status === 200)
    const conflict = responses.find((response) => response.status === 409)
    expect(winner?.body.data.draft.version).toBe(2)
    expect(conflict?.body.data.draft.version).toBe(2)
    expect(conflict?.body.data.draft.snapshot.name).toBe(winner?.body.data.draft.snapshot.name)

    const draft = await prisma.departureCreationDraft.findUnique({
      where: { taskId },
    })
    expect(draft?.version).toBe(2)
  })
})
