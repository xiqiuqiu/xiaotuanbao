import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
  ResourceKind,
} from '@prisma/client'
import type { HeadlessExecutionResult } from '@xiaotuanbao/ai-contracts'
import { SourceOrderService } from '../src/modules/departure/source-order.service'
import { departureObjectVersion } from '../src/modules/ai-create-task/departure-object-version'
import { PrismaService } from '../src/database/prisma/prisma.service'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'

const AGENT_SECRET = 'e2e-agent-service-secret'

type ReviewCandidate = {
  fieldKey: string
  proposedValue: unknown
  clarity: 'clear'
  evidence: Array<{ kind: 'user_message'; sequence: number; excerpt: string }>
}

describe('Departure collaboration recovery / concurrency / permission (e2e) #455', () => {
  jest.setTimeout(60_000)

  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let financeToken: string
  let peerToken: string
  let organizationId: string
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  const testPrefix = `e2e455-${Date.now()}`
  const conversationIds: string[] = []
  const departureIds: string[] = []
  const partnerIds: string[] = []
  const supplierIds: string[] = []
  const extraOrgIds: string[] = []

  beforeAll(async () => {
    let apiBaseUrl = ''
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET
    process.env.AI_MODEL = 'deterministic'

    agent = await startDeterministicHeadlessAgent({
      getApiBaseUrl: () => apiBaseUrl,
      serviceSecret: AGENT_SECRET,
      outcome: { kind: 'completed', message: '已记下。' },
    })
    process.env.AGENT_INTERNAL_URL = agent.origin

    app = await createTestApp()
    const address = app.getHttpServer().address() as AddressInfo
    apiBaseUrl = `http://127.0.0.1:${address.port}`

    prisma = new PrismaClient()
    processor = app.get(AiWorkflowProcessor)
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')
    peerToken = await loginAs(app, 'mazong')

    const owner = await prisma.user.findFirstOrThrow({
      where: { username: 'wangjie', deletedAt: null },
    })
    organizationId = owner.organizationId
    ownerUserId = owner.id
  })

  afterEach(() => {
    agent.setOutcome({ kind: 'completed', message: '已记下。' })
    agent.release()
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    await prisma.paymentSchedule.deleteMany({
      where: { organizationId, departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.sourceOrderGuest.deleteMany({
      where: { sourceOrder: { departure: { name: { startsWith: testPrefix } } } },
    })
    await prisma.sourceOrderFareAdjustment.deleteMany({
      where: { sourceOrder: { departure: { name: { startsWith: testPrefix } } } },
    })
    await prisma.sourceOrder.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.segmentResource.deleteMany({
      where: { segment: { departure: { name: { startsWith: testPrefix } } } },
    })
    await prisma.departureResource.deleteMany({
      where: { departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.itinerarySegment.deleteMany({
      where: { departure: { name: { startsWith: testPrefix } } },
    })
    if (conversationIds.length > 0) {
      await prisma.aiReviewRecord.deleteMany({
        where: { package: { conversationId: { in: conversationIds } } },
      })
      await prisma.aiReviewPackage.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
      await prisma.aiConversation.deleteMany({ where: { id: { in: conversationIds } } })
    }
    if (departureIds.length > 0) {
      await prisma.agentTask.deleteMany({
        where: { organizationId, departureId: { in: departureIds } },
      })
    }
    if (departureIds.length > 0) {
      await prisma.departure.deleteMany({ where: { id: { in: departureIds } } })
    }
    if (partnerIds.length > 0) {
      await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } })
    }
    if (supplierIds.length > 0) {
      await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } })
    }
    if (extraOrgIds.length > 0) {
      await prisma.partner.deleteMany({ where: { organizationId: { in: extraOrgIds } } })
      await prisma.organization.deleteMany({ where: { id: { in: extraOrgIds } } })
    }
    await prisma.$disconnect()
    await agent.close()
    await app.close()
  })

  function trackConversation(id: string): string {
    conversationIds.push(id)
    return id
  }

  async function createDeparture(name = `${testPrefix}-团`) {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name,
        routeName: `${testPrefix}-线`,
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ownerUserId,
      })
      .expect(201)
    const departure = created.body.data as { id: string }
    departureIds.push(departure.id)
    const segment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '第一天',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        destination: '日喀则',
      })
      .expect(201)
    return { departureId: departure.id, segmentId: (segment.body.data as { id: string }).id }
  }

  async function createPartner(suffix = '客户') {
    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-${suffix}`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerIds.push(partner.id)
    return partner
  }

  async function createSupplier(suffix: string, categories: ResourceKind[] = [ResourceKind.hotel, ResourceKind.transport]) {
    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-${suffix}`,
        categories,
        status: DirectoryProfileStatus.active,
      },
    })
    supplierIds.push(supplier.id)
    return supplier
  }

  async function objectVersion(departureId: string) {
    return departureObjectVersion(app.get(PrismaService), organizationId, departureId)
  }

  function evidence(text: string, sequence: number): ReviewCandidate['evidence'] {
    return [{ kind: 'user_message', sequence, excerpt: text }]
  }

  function candidate(fieldKey: string, proposedValue: unknown, text: string, sequence: number): ReviewCandidate {
    return { fieldKey, proposedValue, clarity: 'clear', evidence: evidence(text, sequence) }
  }

  function sourceOrderCandidates(partnerId: string, text: string, sequence: number, guestName = '张三'): ReviewCandidate[] {
    return [
      candidate('partnerId', partnerId, text, sequence),
      candidate('adultGuestCount', 2, text, sequence),
      candidate('childGuestCount', 0, text, sequence),
      candidate('adultUnitPriceCents', 100_000, text, sequence),
      candidate('fareAdjustments', [], text, sequence),
      candidate('discountType', 'none', text, sequence),
      candidate('collectionMode', 'partner_settled', text, sequence),
      candidate('guests', [{ name: guestName, included: true }], text, sequence),
    ]
  }

  function segmentResourceCandidates(
    segmentId: string,
    supplierId: string,
    title: string,
    amountCents: number,
    text: string,
    sequence: number,
  ): ReviewCandidate[] {
    return [
      candidate('itinerarySegmentId', segmentId, text, sequence),
      candidate('resourceKind', 'hotel', text, sequence),
      candidate('supplierId', supplierId, text, sequence),
      candidate('title', title, text, sequence),
      candidate('amountCents', amountCents, text, sequence),
    ]
  }

  function departureResourceCandidates(
    supplierId: string,
    title: string,
    amountCents: number,
    text: string,
    sequence: number,
  ): ReviewCandidate[] {
    return [
      candidate('resourceKind', 'transport', text, sequence),
      candidate('supplierId', supplierId, text, sequence),
      candidate('title', title, text, sequence),
      candidate('amountCents', amountCents, text, sequence),
    ]
  }

  function reviewOutcome(
    objectVersion: number,
    packages: Array<{
      confirmationUnit: 'source_order_create' | 'segment_resource' | 'departure_resource'
      candidates: ReviewCandidate[]
    }>,
  ): HeadlessExecutionResult {
    const mapped = packages.map((pkg) => ({
      objectVersion,
      confirmationUnit: pkg.confirmationUnit,
      candidates: pkg.candidates,
    }))
    return {
      kind: 'awaiting_review',
      reviewPackage: mapped[0]!,
      reviewPackages: mapped,
    } as HeadlessExecutionResult
  }

  async function openCollaboration(departureId: string, text: string, key: string) {
    const sent = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', key)
      .send({
        text,
        pageLocator: { kind: 'departure', objectId: departureId },
      })
      .expect(201)
    const conversationId = trackConversation(sent.body.data.conversationId as string)
    return { conversationId, batchId: sent.body.data.batch.id as string }
  }

  async function processJobs(conversationId?: string) {
    if (conversationId) {
      await prisma.aiWorkflowJob.updateMany({
        where: {
          conversationId,
          status: { in: ['pending', 'claimed'] },
        },
        data: { nextAttemptAt: new Date(), leaseExpiresAt: new Date(Date.now() - 1_000) },
      })
    }
    return processor.processDueJobs(20)
  }

  async function dumpCollaborationPipeline(conversationId: string) {
    const [jobs, batches, attempts, events, packages] = await Promise.all([
      prisma.aiWorkflowJob.findMany({
        where: { conversationId },
        select: {
          id: true,
          type: true,
          status: true,
          taskId: true,
          lastErrorCode: true,
          attemptCount: true,
          nextAttemptAt: true,
        },
      }),
      prisma.aiInputBatch.findMany({
        where: { conversationId },
        select: { id: true, status: true },
      }),
      prisma.aiAgentAttempt.findMany({
        where: { conversationId },
        select: { id: true, status: true, errorCode: true, resultJson: true },
      }),
      prisma.aiConversationEvent.findMany({
        where: { conversationId },
        orderBy: { sequence: 'asc' },
        select: { sequence: true, kind: true, payload: true },
      }),
      prisma.aiReviewPackage.findMany({
        where: { conversationId },
        select: { id: true, status: true, confirmationUnit: true },
      }),
    ])
    return {
      conversationId,
      agentCallCount: agent.callCount(),
      lastUserText: agent.lastUserText(),
      lastTaskContext: agent.lastTaskContext(),
      jobs,
      batches,
      attempts,
      events,
      packages,
    }
  }

  async function waitForPendingPackages(conversationId: string, count: number) {
    try {
      await waitFor(async () => {
        const packages = await prisma.aiReviewPackage.findMany({
          where: { conversationId, status: 'pending' },
        })
        expect(packages.length).toBeGreaterThanOrEqual(count)
      })
    } catch (error) {
      const dump = await dumpCollaborationPipeline(conversationId)
      throw new Error(
        `waitForPendingPackages(${count}) failed. pipeline=${JSON.stringify(dump, null, 2)}\noriginal=${String(error)}`,
      )
    }
  }

  function listCollaboration(departureId: string, token = coordinatorToken, conversationId?: string) {
    const url = conversationId
      ? `/api/agent/departures/${departureId}/collaboration?conversationId=${conversationId}`
      : `/api/agent/departures/${departureId}/collaboration`
    return authRequest(app, token).get(url)
  }

  function accept(
    token: string,
    decisionCommandId: string,
    items: Array<{ packageId: string; expectedPackageVersion: number }>,
  ) {
    return authRequest(app, token)
      .post('/api/agent/review-decisions')
      .send({ decisionCommandId, items })
  }

  function getConfirmation(token: string, decisionCommandId: string) {
    return authRequest(app, token).get(`/api/agent/review-decisions/${decisionCommandId}`)
  }

  it('covers material → review → revision → confirm → formal records without leftover collaboration data reset', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-闭环`)
    const partner = await createPartner('闭环客户')
    const supplier = await createSupplier('闭环供应商')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 录入客源张三与希尔顿酒店及全程用车`
    agent.setOutcome(
      reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1) },
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, supplier.id, '希尔顿', 128_000, text, 1),
        },
        {
          confirmationUnit: 'departure_resource',
          candidates: departureResourceCandidates(supplier.id, '全程用车', 200_000, text, 1),
        },
      ]),
    )

    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-loop`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 3)

    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const items = listed.body.data.items as Array<{
      id: string
      version: number
      confirmationUnit: string
      status: string
    }>
    expect(items).toHaveLength(3)
    expect(items.every((item) => item.status === 'pending')).toBe(true)

    const hotel = items.find((item) => item.confirmationUnit === 'segment_resource')!
    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/agent/review-packages/${hotel.id}`)
      .send({ expectedPackageVersion: hotel.version, corrections: { title: '日喀则希尔顿' } })
      .expect(200)
    expect(
      (patched.body.data.pendingReviews as Array<{ id: string; version: number }>).find((pkg) => pkg.id === hotel.id)
        ?.version,
    ).toBe(hotel.version + 1)

    const stalePatch = await authRequest(app, coordinatorToken)
      .patch(`/api/agent/review-packages/${hotel.id}`)
      .send({ expectedPackageVersion: hotel.version, corrections: { title: '被覆盖的标题' } })
    expect(stalePatch.status).toBe(409)
    expect(stalePatch.body.message).toContain('审核包版本已变化')

    const revisions = await authRequest(app, coordinatorToken)
      .get(`/api/agent/review-packages/${hotel.id}/revisions`)
      .expect(200)
    expect(revisions.body.data).toHaveLength(1)
    expect(revisions.body.data[0].afterSnapshot).toEqual(expect.objectContaining({ title: '日喀则希尔顿' }))

    const refreshed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const pending = refreshed.body.data.items as Array<{
      id: string
      version: number
      confirmationUnit: string
    }>
    const decisionCommandId = `${testPrefix}-confirm-loop`
    const accepted = await accept(
      coordinatorToken,
      decisionCommandId,
      pending.map((item) => ({ packageId: item.id, expectedPackageVersion: item.version })),
    ).expect(200)
    expect(accepted.body.data).toMatchObject({ decisionCommandId, accepted: true })
    expect(accepted.body.data.items).toHaveLength(3)

    const replayBeforeJobs = await accept(
      coordinatorToken,
      decisionCommandId,
      pending.map((item) => ({ packageId: item.id, expectedPackageVersion: item.version })),
    ).expect(200)
    expect(replayBeforeJobs.body.data.items.map((item: { status: string }) => item.status)).toEqual(
      accepted.body.data.items.map((item: { status: string }) => item.status),
    )

    const lostResponse = await getConfirmation(coordinatorToken, decisionCommandId).expect(200)
    expect(lostResponse.body.data.items.every((item: { status: string }) => item.status !== 'succeeded')).toBe(true)

    await processJobs(conversationId)
    await waitFor(async () => {
      const live = await getConfirmation(coordinatorToken, decisionCommandId).expect(200)
      expect(live.body.data.items.every((item: { status: string }) => item.status === 'succeeded')).toBe(true)
    })

    const live = await getConfirmation(coordinatorToken, decisionCommandId).expect(200)
    const sourceRef = live.body.data.items.find(
      (item: { resultRef?: { objectKind: string } }) => item.resultRef?.objectKind === 'source_order',
    )
    const segmentRef = live.body.data.items.find(
      (item: { resultRef?: { objectKind: string } }) => item.resultRef?.objectKind === 'segment_resource',
    )
    const departureRef = live.body.data.items.find(
      (item: { resultRef?: { objectKind: string } }) => item.resultRef?.objectKind === 'departure_resource',
    )
    expect(sourceRef.resultRef.objectId).toBeTruthy()
    expect(segmentRef.submittedValues).toEqual(expect.objectContaining({ title: '日喀则希尔顿', amountCents: 128_000 }))
    expect(departureRef.submittedValues).toEqual(expect.objectContaining({ title: '全程用车', amountCents: 200_000 }))

    const orders = await prisma.sourceOrder.findMany({
      where: { departureId },
      include: { guests: true },
    })
    expect(orders).toHaveLength(1)
    expect(orders[0]?.netReceivableCents).toBe(200_000)
    expect(orders[0]?.guests.map((guest) => guest.name)).toEqual(['张三'])
    expect(await prisma.segmentResource.count({ where: { segmentId } })).toBe(1)
    expect(await prisma.departureResource.count({ where: { departureId } })).toBe(1)
    expect(await prisma.paymentSchedule.count({ where: { departureId } })).toBe(0)

    const replayAfter = await accept(
      coordinatorToken,
      decisionCommandId,
      pending.map((item) => ({ packageId: item.id, expectedPackageVersion: item.version })),
    ).expect(200)
    expect(replayAfter.body.data.decisionCommandId).toBe(decisionCommandId)
    expect(await prisma.sourceOrder.count({ where: { departureId } })).toBe(1)
    expect(await prisma.segmentResource.count({ where: { segmentId } })).toBe(1)
    expect(await prisma.departureResource.count({ where: { departureId } })).toBe(1)

    const restored = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    expect(restored.body.data.items.every((item: { status: string }) => item.status === 'confirmed')).toBe(true)
    expect(restored.body.data.confirmations.length).toBeGreaterThan(0)
    const hotelItem = (restored.body.data.confirmations as Array<{ items: Array<{ submittedValues?: Record<string, unknown>; currentFormalValues?: Record<string, unknown> | null }> }>)
      .flatMap((confirmation) => confirmation.items)
      .find((item) => item.submittedValues?.title === '日喀则希尔顿')
    expect(hotelItem?.currentFormalValues).toEqual(expect.objectContaining({ title: '日喀则希尔顿', amountCents: 128_000 }))
  })

  it('rejects a different payload on the same confirmation key and isolates private sessions', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-幂等`)
    const partner = await createPartner('幂等客户')
    const supplier = await createSupplier('幂等供应商')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 幂等客源与酒店`
    agent.setOutcome(
      reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '李四') },
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, supplier.id, '酒店甲', 80_000, text, 1),
        },
      ]),
    )
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-idem`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 2)
    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const items = listed.body.data.items as Array<{ id: string; version: number }>
    const key = `${testPrefix}-same-key`
    await accept(coordinatorToken, key, [
      { packageId: items[0]!.id, expectedPackageVersion: items[0]!.version },
    ]).expect(200)
    const mismatched = await accept(coordinatorToken, key, [
      { packageId: items[1]!.id, expectedPackageVersion: items[1]!.version },
    ])
    expect(mismatched.status).toBe(409)
    expect(mismatched.body.message).toContain('幂等键已用于不同的确认选择')

    await getConfirmation(peerToken, key).expect(403)
    await getConfirmation(financeToken, key).expect(403)
    const peerList = await listCollaboration(departureId, peerToken, conversationId).expect(200)
    expect(peerList.body.data.conversations).toEqual([])
    expect(peerList.body.data.items).toEqual([])

    const otherOrg = await prisma.organization.create({
      data: { name: `${testPrefix}-other-org`, businessPrefix: uniqueBusinessPrefix(`${testPrefix}-x`) },
    })
    extraOrgIds.push(otherOrg.id)
    const foreignOwner = await prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        username: `${testPrefix}-x-owner`.toLowerCase(),
        name: '外组织计调',
        passwordHash: 'unused',
      },
    })
    const foreignDeparture = await prisma.departure.create({
      data: {
        organizationId: otherOrg.id,
        ownerUserId: foreignOwner.id,
        departureNo: `${testPrefix}-X001`,
        name: `${testPrefix}-外组织团`,
        routeName: '外组织线',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dayCount: 5,
      },
    })
    const cross = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', `${testPrefix}-cross`)
      .send({
        text: `${testPrefix} 跨组织`,
        pageLocator: { kind: 'departure', objectId: foreignDeparture.id },
      })
    expect(cross.status).toBe(400)
    await prisma.departure.delete({ where: { id: foreignDeparture.id } })
    await prisma.user.delete({ where: { id: foreignOwner.id } })
  })

  it('keeps one pending package when a crashed proposal is reclaimed and a late generation cannot rewrite it', async () => {
    const { departureId } = await createDeparture(`${testPrefix}-迟到`)
    const partner = await createPartner('迟到客户')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 迟到提案客源`
    agent.setOutcome(
      reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '王五') },
      ]),
    )
    const { conversationId, batchId } = await openCollaboration(departureId, text, `${testPrefix}-late`)
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { conversationId, type: 'agent_batch' },
    })
    await prisma.aiInputBatch.update({
      where: { id: job.inputBatchId },
      data: { status: 'agent_running' },
    })
    await prisma.aiWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: 'claimed',
        claimedAt: new Date(Date.now() - 10_000),
        claimedBy: 'dead-worker',
        leaseExpiresAt: new Date(Date.now() - 1_000),
        attemptCount: 1,
      },
    })
    await processJobs(conversationId)
    await prisma.aiWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: 'claimed',
        claimedAt: new Date(Date.now() - 10_000),
        claimedBy: 'dead-worker-2',
        leaseExpiresAt: new Date(Date.now() - 1_000),
      },
    })
    await prisma.aiInputBatch.update({
      where: { id: job.inputBatchId },
      data: { status: 'agent_running' },
    })
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 1)
    expect(await prisma.aiReviewPackage.count({ where: { conversationId } })).toBe(1)
    expect(batchId).toBe(job.inputBatchId)
  })

  it('writes one resource and leaves the failed sibling pending after refresh, without duplicating the success', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-部分`)
    const okSupplier = await createSupplier('成功供应商', [ResourceKind.hotel])
    const badSupplier = await createSupplier('失败供应商', [ResourceKind.hotel])
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 两家酒店`
    agent.setOutcome(
      reviewOutcome(version, [
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, okSupplier.id, '成功酒店', 50_000, text, 1),
        },
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, badSupplier.id, '失败酒店', 60_000, text, 1),
        },
      ]),
    )
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-partial`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 2)

    await prisma.supplier.update({
      where: { id: badSupplier.id },
      data: { status: DirectoryProfileStatus.disabled },
    })

    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const items = listed.body.data.items as Array<{ id: string; version: number; candidates: Array<{ fieldKey: string; proposedValue: unknown }> }>
    const key = `${testPrefix}-partial-confirm`
    await accept(
      coordinatorToken,
      key,
      items.map((item) => ({ packageId: item.id, expectedPackageVersion: item.version })),
    ).expect(200)
    await processJobs(conversationId)
    await waitFor(async () => {
      const live = await getConfirmation(coordinatorToken, key).expect(200)
      const statuses = live.body.data.items.map((item: { status: string }) => item.status).sort()
      expect(statuses).toEqual(['conflict', 'succeeded'].sort())
    })

    expect(await prisma.segmentResource.count({ where: { segmentId } })).toBe(1)
    expect(
      await prisma.segmentResource.findFirst({
        where: { segmentId, title: '成功酒店' },
      }),
    ).toBeTruthy()

    const replay = await accept(
      coordinatorToken,
      key,
      items.map((item) => ({ packageId: item.id, expectedPackageVersion: item.version })),
    ).expect(200)
    expect(replay.body.data.decisionCommandId).toBe(key)
    await processJobs(conversationId)
    expect(await prisma.segmentResource.count({ where: { segmentId } })).toBe(1)

    const restored = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const restoredItems = restored.body.data.items as Array<{ status: string; confirmationUnit: string }>
    expect(restoredItems.filter((item) => item.status === 'confirmed')).toHaveLength(1)
    expect(restoredItems.filter((item) => item.status === 'pending')).toHaveLength(1)
  })

  it('rolls back a source order with selected guests when the confirm transaction fails mid-write', async () => {
    const { departureId } = await createDeparture(`${testPrefix}-原子`)
    const partner = await createPartner('原子客户')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 原子客源名单`
    agent.setOutcome(
      reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '赵六') },
      ]),
    )
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-atomic`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 1)
    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const pkg = listed.body.data.items[0] as { id: string; version: number }

    const sourceOrders = app.get(SourceOrderService)
    const original = sourceOrders.createWithSelectedGuests.bind(sourceOrders)
    jest.spyOn(sourceOrders, 'createWithSelectedGuests').mockImplementationOnce(async (...args) => {
      await original(...args)
      throw new Error('injected guest write failure')
    })

    const key = `${testPrefix}-atomic-confirm`
    await accept(coordinatorToken, key, [
      { packageId: pkg.id, expectedPackageVersion: pkg.version },
    ]).expect(200)
    await processJobs(conversationId)

    expect(await prisma.sourceOrder.count({ where: { departureId } })).toBe(0)
    expect(await prisma.sourceOrderGuest.count({
      where: { sourceOrder: { departureId } },
    })).toBe(0)
    expect((await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: pkg.id } })).status).toBe('pending')

    await processJobs(conversationId)
    await waitFor(async () => {
      expect(await prisma.sourceOrder.count({ where: { departureId } })).toBe(1)
    })
    const order = await prisma.sourceOrder.findFirstOrThrow({
      where: { departureId },
      include: { guests: true },
    })
    expect(order.guests.map((guest) => guest.name)).toEqual(['赵六'])
    expect(order.netReceivableCents).toBe(200_000)
  })

  it('lets finance confirm receivables but not create source orders, and refuses F2 backfill', async () => {
    const { departureId } = await createDeparture(`${testPrefix}-账款`)
    const partner = await createPartner('账款客户')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 账款客源`
    agent.setOutcome(
      reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '孙七') },
      ]),
    )
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-ar`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 1)
    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const sourcePkg = listed.body.data.items[0] as { id: string; version: number }

    await accept(financeToken, `${testPrefix}-finance-create`, [
      { packageId: sourcePkg.id, expectedPackageVersion: sourcePkg.version },
    ]).expect(403)
    await authRequest(app, financeToken)
      .patch(`/api/agent/review-packages/${sourcePkg.id}`)
      .send({ expectedPackageVersion: sourcePkg.version, corrections: { adultGuestCount: 3 } })
      .expect(403)

    const writeKey = `${testPrefix}-ar-create`
    await accept(coordinatorToken, writeKey, [
      { packageId: sourcePkg.id, expectedPackageVersion: sourcePkg.version },
    ]).expect(200)
    await processJobs(conversationId)
    await waitFor(async () => {
      expect(await prisma.sourceOrder.count({ where: { departureId } })).toBe(1)
    })
    const order = await prisma.sourceOrder.findFirstOrThrow({ where: { departureId } })

    await authRequest(app, financeToken)
      .post(`/api/source-orders/${order.id}/generate-receivables`)
      .expect(201)
    expect(await prisma.paymentSchedule.count({ where: { sourceId: order.id } })).toBeGreaterThan(0)
    const before = await prisma.paymentSchedule.count({ where: { sourceId: order.id } })

    const prepared = await authRequest(app, coordinatorToken)
      .post(`/api/agent/departures/${departureId}/source-order-receivable-reviews`)
      .send({ sourceOrderId: order.id, conversationId })
      .expect(200)
    const receivablePkg = prepared.body.data as { id: string; version: number; status: string }
    expect(receivablePkg.status).toBe('pending')

    const financePrepared = await authRequest(app, financeToken)
      .post(`/api/agent/departures/${departureId}/source-order-receivable-reviews`)
      .send({ sourceOrderId: order.id, conversationId })
    expect([403, 404]).toContain(financePrepared.status)

    const recvKey = `${testPrefix}-ar-confirm`
    await accept(coordinatorToken, recvKey, [
      { packageId: receivablePkg.id, expectedPackageVersion: receivablePkg.version },
    ]).expect(200)
    await processJobs(conversationId)
    await waitFor(async () => {
      const live = await getConfirmation(coordinatorToken, recvKey).expect(200)
      expect(live.body.data.items[0].status).toBe('succeeded')
    })
    const live = await getConfirmation(coordinatorToken, recvKey).expect(200)
    expect(live.body.data.items[0].resultRef.generation).toBe('already_present')
    expect(await prisma.paymentSchedule.count({ where: { sourceId: order.id } })).toBe(before)
    expect(live.body.data.items[0].resultRef.scheduleIds.length).toBe(before)
  })

  it('stops remaining writes when the departure is closed and does not auto-resume after reopen', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-关闭`)
    const supplier = await createSupplier('关闭供应商')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 关闭前两家资源`
    agent.setOutcome(
      reviewOutcome(version, [
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, supplier.id, '关闭酒店', 70_000, text, 1),
        },
        {
          confirmationUnit: 'departure_resource',
          candidates: departureResourceCandidates(supplier.id, '关闭用车', 90_000, text, 1),
        },
      ]),
    )
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-closed`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 2)
    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const items = listed.body.data.items as Array<{ id: string; version: number }>

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/close`)
      .send({ reason: `${testPrefix} 关闭演练` })
      .expect(201)

    const key = `${testPrefix}-closed-confirm`
    await accept(
      coordinatorToken,
      key,
      items.map((item) => ({ packageId: item.id, expectedPackageVersion: item.version })),
    ).expect(200)
    await processJobs(conversationId)
    await waitFor(async () => {
      const live = await getConfirmation(coordinatorToken, key).expect(200)
      expect(live.body.data.items.every((item: { status: string }) => item.status !== 'succeeded')).toBe(true)
    })
    expect(await prisma.segmentResource.count({ where: { segment: { departureId } } })).toBe(0)
    expect(await prisma.departureResource.count({ where: { departureId } })).toBe(0)
    expect(
      (await prisma.aiReviewPackage.findMany({ where: { conversationId } })).every((pkg) => pkg.status === 'pending'),
    ).toBe(true)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/unarchive`)
      .send({ reason: `${testPrefix} 解除归档` })
      .expect(201)
    await processJobs(conversationId)
    expect(await prisma.segmentResource.count({ where: { segment: { departureId } } })).toBe(0)
    expect(await prisma.departureResource.count({ where: { departureId } })).toBe(0)
  })

  it('revokes create permission before confirm and keeps the package pending', async () => {
    const { departureId } = await createDeparture(`${testPrefix}-撤权`)
    const partner = await createPartner('撤权客户')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 撤权客源`
    agent.setOutcome(
      reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '周八') },
      ]),
    )
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-revoke`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 1)
    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const pkg = listed.body.data.items[0] as { id: string; version: number }
    const role = await prisma.role.findFirstOrThrow({ where: { name: '计调' } })
    const userRole = { userId: ownerUserId, roleId: role.id }
    await prisma.userRole.delete({ where: { userId_roleId: userRole } })
    try {
      const refused = await accept(coordinatorToken, `${testPrefix}-revoke-confirm`, [
        { packageId: pkg.id, expectedPackageVersion: pkg.version },
      ])
      expect(refused.status).toBe(403)
      expect(await prisma.sourceOrder.count({ where: { departureId } })).toBe(0)
      expect((await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: pkg.id } })).status).toBe('pending')
    } finally {
      await prisma.userRole.create({ data: userRole }).catch(() => undefined)
    }
  })
})

async function waitFor(assert: () => Promise<void>, timeoutMs = 8_000): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      await assert()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })
    }
  }
  throw lastError
}
