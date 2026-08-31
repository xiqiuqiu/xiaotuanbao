import type { INestApplication } from '@nestjs/common'
import {
  DepartureType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
  ResourceKind,
  UserStatus,
} from '@prisma/client'
import request from 'supertest'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'
import { mintRunningAttemptDelegation } from './support/worker-delegation'

const AGENT_SECRET = 'e2e-agent-service-secret'

describe('AI related-object search, disambiguation and evidence (#443)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-ai-related-${Date.now()}`
  const createdUserIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdPartnerIds: string[] = []
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
  })

  afterAll(async () => {
    await prisma.aiConversation.deleteMany({
      where: { organizationId, creatorUserId: ownerUserId },
    })
    await prisma.aiReviewRecord.deleteMany({
      where: { package: { task: { organizationId, ownerUserId } } },
    })
    await prisma.aiReviewPackage.deleteMany({
      where: { task: { organizationId, ownerUserId } },
    })
    await prisma.aiCreateActivityRun.deleteMany({
      where: { task: { organizationId, ownerUserId } },
    })
    await prisma.departureCreationDraft.deleteMany({
      where: { task: { agentTask: { organizationId, ownerUserId } } },
    })
    await prisma.agentTask.deleteMany({
      where: { organizationId, ownerUserId },
    })
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    await prisma.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await prisma.partner.deleteMany({ where: { id: { in: createdPartnerIds } } })
    for (const orgId of foreignOrgIds) {
      await prisma.user.deleteMany({ where: { organizationId: orgId } })
      await prisma.supplier.deleteMany({ where: { organizationId: orgId } })
      await prisma.partner.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined)
    }
    await prisma.$disconnect()
    await app.close()
  })

  function agentPost(path: string, delegationToken: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(path)
      .set('X-Agent-Service-Key', AGENT_SECRET)
      .set('Authorization', `Bearer ${delegationToken}`)
      .send(body)
  }

  async function openTask(draft?: Record<string, unknown>) {
    const session = await authRequest(app, coordinatorToken)
      .post('/api/agent/tasks/departure-creation/sessions')
      .send({
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-线`,
          name: `${testPrefix}-团`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
          ...draft,
        },
      })
      .expect(201)

    const minted = await mintRunningAttemptDelegation({
      app,
      prisma,
      organizationId,
      userId: ownerUserId,
      taskId: session.body.data.task.id as string,
      conversationId: session.body.data.conversation.id as string,
    })

    return {
      taskId: session.body.data.task.id as string,
      version: session.body.data.task.draft.version as number,
      runId: minted.runId,
      userMessageSequence: minted.userMessageSequence,
      delegationToken: minted.delegationToken,
    }
  }

  it('filters User/Supplier/Partner by current Organization, enabled status and category, and rejects claimed ids', async () => {
    const localUser = await prisma.user.create({
      data: {
        organizationId,
        username: `${testPrefix}-wang`.slice(0, 40).toLowerCase(),
        name: `${testPrefix}-王杰`,
        passwordHash: 'unused',
        status: UserStatus.enabled,
      },
    })
    createdUserIds.push(localUser.id)
    const disabledUser = await prisma.user.create({
      data: {
        organizationId,
        username: `${testPrefix}-off`.slice(0, 40).toLowerCase(),
        name: `${testPrefix}-王杰停用`,
        passwordHash: 'unused',
        status: UserStatus.disabled,
      },
    })
    createdUserIds.push(disabledUser.id)
    const twinUser = await prisma.user.create({
      data: {
        organizationId,
        username: `${testPrefix}-twin`.slice(0, 40).toLowerCase(),
        name: `${testPrefix}-王杰计调`,
        passwordHash: 'unused',
        status: UserStatus.enabled,
      },
    })
    createdUserIds.push(twinUser.id)

    const driver = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-川西车队`,
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    createdSupplierIds.push(driver.id)
    const hotel = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-川西酒店`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })
    createdSupplierIds.push(hotel.id)
    const disabledSupplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-川西停用车队`,
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.archived,
      },
    })
    createdSupplierIds.push(disabledSupplier.id)

    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-成都组团`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    createdPartnerIds.push(partner.id)
    const disabledPartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-成都组团停用`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.archived,
      },
    })
    createdPartnerIds.push(disabledPartner.id)

    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-o`),
      },
    })
    foreignOrgIds.push(otherOrg.id)
    const foreignUser = await prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        username: `${testPrefix}-fx`.slice(0, 40).toLowerCase(),
        name: `${testPrefix}-王杰`,
        passwordHash: 'unused',
        status: UserStatus.enabled,
      },
    })
    createdUserIds.push(foreignUser.id)
    const foreignSupplier = await prisma.supplier.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-川西车队`,
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    createdSupplierIds.push(foreignSupplier.id)
    const foreignPartner = await prisma.partner.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-成都组团`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    createdPartnerIds.push(foreignPartner.id)

    const opened = await openTask()

    const users = await agentPost('/api/ai-tools/v1/search-users', opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      keyword: `${testPrefix}-王杰`,
    }).expect(200)
    expect(users.body.data.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [localUser.id, twinUser.id].sort(),
    )
    expect(users.body.data.items.some((item: { id: string }) => item.id === disabledUser.id)).toBe(
      false,
    )
    expect(users.body.data.items.some((item: { id: string }) => item.id === foreignUser.id)).toBe(
      false,
    )
    expect(users.body.data).not.toHaveProperty('organizationId')

    const claimedOrg = await agentPost('/api/ai-tools/v1/search-users', opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      keyword: `${testPrefix}-王杰`,
      organizationId: otherOrg.id,
    }).expect(401)
    expect(claimedOrg.body.data).toMatchObject({ code: 'DELEGATION_INVALID' })
    expect(JSON.stringify(claimedOrg.body)).not.toContain(foreignUser.id)

    const drivers = await agentPost('/api/ai-tools/v1/search-suppliers', opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      keyword: `${testPrefix}-川西`,
      category: 'transport',
    }).expect(200)
    expect(drivers.body.data.items.map((item: { id: string }) => item.id)).toEqual([driver.id])
    expect(drivers.body.data.items.some((item: { id: string }) => item.id === hotel.id)).toBe(false)
    expect(
      drivers.body.data.items.some((item: { id: string }) => item.id === disabledSupplier.id),
    ).toBe(false)
    expect(
      drivers.body.data.items.some((item: { id: string }) => item.id === foreignSupplier.id),
    ).toBe(false)

    const partners = await agentPost('/api/ai-tools/v1/search-partners', opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      keyword: `${testPrefix}-成都组团`,
    }).expect(200)
    expect(partners.body.data.items.map((item: { id: string }) => item.id)).toEqual([partner.id])
    expect(
      partners.body.data.items.some((item: { id: string }) => item.id === disabledPartner.id),
    ).toBe(false)
    expect(
      partners.body.data.items.some((item: { id: string }) => item.id === foreignPartner.id),
    ).toBe(false)
    expect(JSON.stringify(partners.body.data)).not.toContain('contactPhone')
  })

  it('reports total and hasMore when controlled search truncates six matching users', async () => {
    const matchingUsers = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        prisma.user.create({
          data: {
            organizationId,
            username: `ai-more-${Date.now()}-${index}`,
            name: `${testPrefix}-同名搜索-${index}`,
            passwordHash: 'unused',
            status: UserStatus.enabled,
          },
        }),
      ),
    )
    createdUserIds.push(...matchingUsers.map((user) => user.id))
    const opened = await openTask()

    const response = await agentPost(
      '/api/ai-tools/v1/search-users',
      opened.delegationToken,
      {
        taskId: opened.taskId,
        runId: opened.runId,
        keyword: `${testPrefix}-同名搜索`,
      },
    ).expect(200)

    expect(response.body.data.items).toHaveLength(5)
    expect(response.body.data).toMatchObject({ total: 6, hasMore: true })
  })

  it('keeps unreviewed driver candidates out of the snapshot and rejects forged or wrong-category ids', async () => {
    const driver = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-确认车队`,
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    createdSupplierIds.push(driver.id)
    const hotel = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-确认酒店`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })
    createdSupplierIds.push(hotel.id)

    const opened = await openTask()
    const submitted = await agentPost(
      '/api/ai-tools/v1/submit-review-package',
      opened.delegationToken,
      {
        taskId: opened.taskId,
        runId: opened.runId,
        objectVersion: opened.version,
        candidates: [
          {
            fieldKey: 'driverSupplierId',
            proposedValue: driver.id,
            clarity: 'needs_confirmation',
            evidence: [
              {
                kind: 'user_message',
                sequence: opened.userMessageSequence,
                excerpt: 'e2e worker-shaped attempt',
              },
            ],
          },
        ],
      },
    ).expect(200)

    const afterSubmit = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${opened.taskId}`)
      .expect(200)
    expect(afterSubmit.body.data.draft.snapshot.driverSupplierId ?? null).toBeNull()
    expect(afterSubmit.body.data.pendingReview.candidates[0]).toMatchObject({
      fieldKey: 'driverSupplierId',
      proposedValue: driver.id,
      clarity: 'needs_confirmation',
    })

    const confirmed = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${submitted.body.data.reviewPackageId}/confirm`)
      .send({ expectedVersion: opened.version, expectedPackageVersion: 1 })
      .expect(200)
    expect(confirmed.body.data.draft.snapshot.driverSupplierId).toBe(driver.id)

    const forged = await openTask()
    await agentPost('/api/ai-tools/v1/submit-review-package', forged.delegationToken, {
      taskId: forged.taskId,
      runId: forged.runId,
      objectVersion: forged.version,
      candidates: [
        {
          fieldKey: 'driverSupplierId',
          proposedValue: 'forged-supplier-id',
          clarity: 'clear',
          evidence: [
            {
              kind: 'user_message',
              sequence: forged.userMessageSequence,
              excerpt: 'e2e worker-shaped attempt',
            },
          ],
        },
      ],
    }).expect(200)
    const failedForged = await authRequest(app, coordinatorToken)
      .post(
        `/api/agent/review-packages/${
          (
            await authRequest(app, coordinatorToken).get(`/api/agent/tasks/${forged.taskId}`)
          ).body.data.pendingReview.id
        }/confirm`,
      )
      .send({ expectedVersion: forged.version, expectedPackageVersion: 1 })
      .expect(400)
    expect(failedForged.body.message).toContain('用车')
    const afterForged = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${forged.taskId}`)
      .expect(200)
    expect(afterForged.body.data.draft.snapshot.driverSupplierId ?? null).toBeNull()

    const wrongKind = await openTask()
    const wrongSubmitted = await agentPost(
      '/api/ai-tools/v1/submit-review-package',
      wrongKind.delegationToken,
      {
        taskId: wrongKind.taskId,
        runId: wrongKind.runId,
        objectVersion: wrongKind.version,
        candidates: [
          {
            fieldKey: 'driverSupplierId',
            proposedValue: hotel.id,
            clarity: 'clear',
            evidence: [
              {
                kind: 'user_message',
                sequence: wrongKind.userMessageSequence,
                excerpt: 'e2e worker-shaped attempt',
              },
            ],
          },
        ],
      },
    ).expect(200)
    const failedKind = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${wrongSubmitted.body.data.reviewPackageId}/confirm`)
      .send({ expectedVersion: wrongKind.version, expectedPackageVersion: 1 })
      .expect(400)
    expect(failedKind.body.message).toContain('用车')
  })
})
