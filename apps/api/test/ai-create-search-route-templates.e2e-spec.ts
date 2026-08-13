import type { INestApplication } from '@nestjs/common'
import { CounterpartyType, DepartureType, PrismaClient, ResourceKind } from '@prisma/client'
import request from 'supertest'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

const AGENT_SECRET = 'e2e-agent-service-secret'

describe('AI searchRouteTemplates and template adopt (e2e) #299', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let organizationId: string
  let ownerUserId: string
  let supplierId: string
  const testPrefix = `e2e-ai-search-tpl-${Date.now()}`
  const createdTemplateIds: string[] = []
  const foreignOrgIds: string[] = []

  beforeAll(async () => {
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET
    process.env.AGENT_RUNTIME_URL = 'http://127.0.0.1:4111/copilotkit'

    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
    ownerUserId = user.id

    const supplier = await prisma.supplier.findFirst({ where: { organizationId } })
    if (!supplier) {
      throw new Error('Seed supplier not found')
    }
    supplierId = supplier.id
  })

  afterAll(async () => {
    await prisma.aiReviewRecord.deleteMany({
      where: { package: { task: { organizationId, creatorUserId: ownerUserId } } },
    })
    await prisma.aiReviewPackage.deleteMany({
      where: { task: { organizationId, creatorUserId: ownerUserId } },
    })
    await prisma.aiCreateActivityRun.deleteMany({
      where: { task: { organizationId, creatorUserId: ownerUserId } },
    })
    await prisma.departureCreationDraft.deleteMany({
      where: { task: { organizationId, creatorUserId: ownerUserId } },
    })
    await prisma.segmentResource.deleteMany({
      where: { segment: { departure: { organizationId, name: { startsWith: testPrefix } } } },
    })
    await prisma.itinerarySegment.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.aiCreateTask.deleteMany({
      where: { organizationId, creatorUserId: ownerUserId },
    })
    await prisma.routeTemplateResource.deleteMany({
      where: { templateSegment: { templateId: { in: createdTemplateIds } } },
    })
    await prisma.routeTemplateSegment.deleteMany({
      where: { templateId: { in: createdTemplateIds } },
    })
    await prisma.routeTemplate.deleteMany({
      where: { id: { in: createdTemplateIds } },
    })
    for (const orgId of foreignOrgIds) {
      await prisma.routeTemplate.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined)
    }
    await prisma.$disconnect()
    await app.close()
  })

  function agentSearch(delegationToken: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/ai-tools/v1/search-route-templates')
      .set('X-Agent-Service-Key', AGENT_SECRET)
      .set('Authorization', `Bearer ${delegationToken}`)
      .send(body)
  }

  function agentSubmit(delegationToken: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/ai-tools/v1/submit-review-package')
      .set('X-Agent-Service-Key', AGENT_SECRET)
      .set('Authorization', `Bearer ${delegationToken}`)
      .send(body)
  }

  async function openTask(draft?: Record<string, unknown>) {
    const session = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({
        draft: {
          mode: 'manual',
          routeName: '',
          name: `${testPrefix}-团`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
          ...draft,
        },
      })
      .expect(201)

    return {
      taskId: session.body.data.task.id as string,
      version: session.body.data.task.draft.version as number,
      runId: session.body.data.runId as string,
      delegationToken: session.body.data.delegationToken as string,
    }
  }

  async function createLocalTemplate(overrides: {
    name: string
    defaultDayCount?: number
    usageCount?: number
    notes?: string
    segments?: Array<{ name: string; destination?: string; notes?: string }>
  }) {
    const template = await prisma.routeTemplate.create({
      data: {
        organizationId,
        name: overrides.name,
        defaultDayCount: overrides.defaultDayCount ?? 8,
        usageCount: overrides.usageCount ?? 0,
        notes: overrides.notes ?? '备注里写喀纳斯也不应命中',
        segments: {
          create: (overrides.segments ?? [{ name: '稻城亚丁', destination: '亚丁' }]).map(
            (segment, index) => ({
              sortOrder: index,
              name: segment.name,
              destination: segment.destination ?? null,
              notes: segment.notes ?? '段备注喀纳斯',
            }),
          ),
        },
      },
    })
    createdTemplateIds.push(template.id)
    return template
  }

  it('searches current organization with structured reasons and never leaks other orgs', async () => {
    const local = await createLocalTemplate({
      name: `${testPrefix}-川西稻城线`,
      usageCount: 4,
    })
    const notesOnly = await createLocalTemplate({
      name: `${testPrefix}-青海线`,
      defaultDayCount: 6,
      notes: '川西稻城备忘',
      segments: [{ name: '西宁', destination: '青海湖', notes: '川西' }],
    })

    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-o`),
      },
    })
    foreignOrgIds.push(otherOrg.id)
    const foreign = await prisma.routeTemplate.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-川西稻城线-外组织`,
        defaultDayCount: 8,
        usageCount: 99,
      },
    })
    createdTemplateIds.push(foreign.id)

    const opened = await openTask()
    const empty = await agentSearch(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
    }).expect(200)
    expect(empty.body.data.items).toEqual([])

    const found = await agentSearch(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      keyword: '川西 亚丁',
      organizationId: otherOrg.id,
    }).expect(200)

    expect(found.body.data.items.map((item: { id: string }) => item.id)).toEqual([local.id])
    expect(found.body.data.items[0]).toMatchObject({
      id: local.id,
      name: local.name,
      defaultDayCount: 8,
      usageCount: 4,
      matchReasons: [
        { code: 'name_contains_token', token: '川西' },
        { code: 'segment_name_contains_token', token: '亚丁', segmentName: '稻城亚丁' },
      ],
    })
    expect(found.body.data.items.some((item: { id: string }) => item.id === notesOnly.id)).toBe(
      false,
    )
    expect(found.body.data.items.some((item: { id: string }) => item.id === foreign.id)).toBe(false)
    expect(found.body.data).not.toHaveProperty('organizationId')
  })

  it('adopts a template into the pending review package and re-reads it on confirm', async () => {
    const template = await createLocalTemplate({
      name: `${testPrefix}-采用线`,
      defaultDayCount: 6,
      segments: [{ name: '喀纳斯', destination: '喀纳斯' }],
    })
    await prisma.routeTemplateSegment.updateMany({
      where: { templateId: template.id },
      data: { dayCount: 3 },
    })
    await prisma.routeTemplateResource.create({
      data: {
        templateSegmentId: (
          await prisma.routeTemplateSegment.findFirstOrThrow({ where: { templateId: template.id } })
        ).id,
        resourceKind: ResourceKind.hotel,
        counterpartyType: CounterpartyType.supplier,
        supplierId,
        title: '喀纳斯酒店',
        amountCents: 0,
      },
    })

    const opened = await openTask({ endDate: '2026-09-03' })
    const submitted = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [
        {
          fieldKey: 'templateId',
          proposedValue: template.id,
          clarity: 'clear',
          evidence: [{ kind: 'system_derivation', rule: 'searchRouteTemplates:name_contains_token:采用' }],
        },
      ],
    }).expect(200)

    const afterSubmit = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${opened.taskId}`)
      .expect(200)
    expect(afterSubmit.body.data.draft.snapshot.templateId ?? null).toBeNull()
    expect(afterSubmit.body.data.draft.snapshot.mode).toBe('manual')
    expect(afterSubmit.body.data.pendingReview.candidates[0].fieldKey).toBe('templateId')

    await prisma.routeTemplate.update({
      where: { id: template.id },
      data: { name: `${testPrefix}-采用线-已改名` },
    })

    const confirmed = await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${submitted.body.data.reviewPackageId}/confirm`,
      )
      .send({ expectedVersion: opened.version })
      .expect(200)

    expect(confirmed.body.data.draft.snapshot).toMatchObject({
      mode: 'template',
      templateId: template.id,
      routeName: `${testPrefix}-采用线-已改名`,
      defaultDayCount: 6,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    })

    const created = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${opened.taskId}/confirm`)
      .send({ expectedVersion: confirmed.body.data.draft.version })
      .expect(201)

    const departureId = created.body.data.id as string
    const segments = await prisma.itinerarySegment.findMany({
      where: { departureId },
      orderBy: { sortOrder: 'asc' },
    })
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ name: '喀纳斯', pendingCheck: true })
    const resources = await prisma.segmentResource.findMany({
      where: { segmentId: segments[0]!.id },
    })
    expect(resources).toHaveLength(1)
    expect(resources[0]).toMatchObject({
      title: '喀纳斯酒店',
      amountCents: 0,
      pendingCheck: true,
    })
    const payables = await prisma.paymentSchedule.count({ where: { departureId } })
    expect(payables).toBe(0)
  })

  it('keeps the original draft when the adopted template becomes unavailable', async () => {
    const template = await createLocalTemplate({
      name: `${testPrefix}-将删除`,
      defaultDayCount: 4,
    })
    const opened = await openTask({ routeName: `${testPrefix}-原路线` })
    const submitted = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [
        {
          fieldKey: 'templateId',
          proposedValue: template.id,
          clarity: 'clear',
          evidence: [{ kind: 'user_message', excerpt: '用那条常用路线' }],
        },
      ],
    }).expect(200)

    await prisma.routeTemplate.delete({ where: { id: template.id } })

    const failed = await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${submitted.body.data.reviewPackageId}/confirm`,
      )
      .send({ expectedVersion: opened.version })
      .expect(400)
    expect(failed.body.message).toContain('常用路线已不可用')

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${opened.taskId}`)
      .expect(200)
    expect(after.body.data.draft.version).toBe(opened.version)
    expect(after.body.data.draft.snapshot).toMatchObject({
      mode: 'manual',
      routeName: `${testPrefix}-原路线`,
    })
    expect(after.body.data.draft.snapshot.templateId ?? null).toBeNull()
    expect(after.body.data.pendingReview.id).toBe(submitted.body.data.reviewPackageId)
  })
})
