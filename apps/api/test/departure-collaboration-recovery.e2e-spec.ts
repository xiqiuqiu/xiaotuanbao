import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { mintRunningAttemptDelegation } from './support/worker-delegation'
import type { INestApplication } from '@nestjs/common'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
  ResourceKind,
} from '@prisma/client'
import type { HeadlessExecutionResult } from '@xiaotuanbao/ai-contracts'
import { DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL } from '@xiaotuanbao/ai-contracts'
import { SourceOrderService } from '../src/modules/departure/source-order.service'
import { departureObjectVersion } from '../src/modules/ai-create-task/departure-object-version'
import { PrismaService } from '../src/database/prisma/prisma.service'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'
import { startDeterministicHeadlessAgent, resolvedItemOutcome } from './support/deterministic-headless-agent'

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
      outcome: resolvedItemOutcome({ kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: '已记下。' }, completionBasis: { kind: 'persistent_clarification' } }),
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
    agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: '已记下。' }, completionBasis: { kind: 'persistent_clarification' } }))
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
      confirmationUnit: 'source_order_create' | 'segment_resource' | 'departure_resource' | 'itinerary_segment_update' | 'source_order_guests_update' | 'source_order_receivable' | 'resource_payable'
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
      completionBasis: { kind: 'accepted_review_package' },
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

  it('edits an existing segment and appends/updates guests only after review, preserving unrelated guests and quotes', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-已有对象修改`)
    const partner = await createPartner('名单修改客户')
    const source = await app.get(SourceOrderService).createWithSelectedGuests(organizationId, departureId, {
      partnerId: partner.id, adultGuestCount: 3, childGuestCount: 0, adultUnitPriceCents: 100000,
      collectionMode: 'partner_settled', discountType: 'none',
    }, [{ name: '张三', phone: '13800000001', gender: 'male' }, { name: '李四', notes: '保留备注' }])
    const guests = await prisma.sourceOrderGuest.findMany({ where: { sourceOrderId: source.id }, orderBy: { name: 'asc' } })
    const zhang = guests.find((guest) => guest.name === '张三')!
    const text = '将第一天改名为拉萨游览并清空目的地；张三电话清空，追加游客王五，其他名单和报价不变'
    agent.setOutcome(resolvedItemOutcome(reviewOutcome(await objectVersion(departureId), [
      { confirmationUnit: 'itinerary_segment_update', candidates: [candidate('itinerarySegmentId', segmentId, text, 1), candidate('name', '拉萨游览', text, 1), candidate('destination', null, text, 1)] },
      { confirmationUnit: 'source_order_guests_update', candidates: [candidate('sourceOrderId', source.id, text, 1), candidate('guestChanges', { add: [{ name: '王五' }], update: [{ guestId: zhang.id, phone: null }] }, text, 1)] },
    ])))
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-formal-edit`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 2)
    const context = agent.lastTaskContext() as { data: { snapshot: { itinerarySegments: unknown[]; sourceOrders: Array<{ id: string; guests: unknown[] }> } } }
    expect(context.data.snapshot.itinerarySegments).toEqual(expect.arrayContaining([expect.objectContaining({ id: segmentId, name: '第一天' })]))
    expect(context.data.snapshot.sourceOrders.find((order) => order.id === source.id)?.guests).toEqual(expect.arrayContaining([expect.objectContaining({ id: zhang.id, phone: '13800000001' })]))
    expect(await prisma.itinerarySegment.findUniqueOrThrow({ where: { id: segmentId } })).toMatchObject({ name: '第一天', destination: '日喀则' })
    expect(await prisma.sourceOrderGuest.findMany({ where: { sourceOrderId: source.id } })).toHaveLength(2)
    const packages = await prisma.aiReviewPackage.findMany({ where: { conversationId }, orderBy: { confirmationUnit: 'asc' } })
    const segmentPkg = packages.find((pkg) => pkg.confirmationUnit === 'itinerary_segment_update')!
    expect(segmentPkg.baselineSnapshot).toMatchObject({ itinerarySegmentId: segmentId, name: '第一天' })
    const corrected = await authRequest(app, coordinatorToken).patch(`/api/agent/review-packages/${segmentPkg.id}`)
      .send({ expectedPackageVersion: segmentPkg.version, corrections: { name: '拉萨市内游览', notes: '人工补充的行程备注' } }).expect(200)
    segmentPkg.version = corrected.body.data.pendingReviews.find((pkg: { id: string }) => pkg.id === segmentPkg.id).version
    await authRequest(app, coordinatorToken).patch(`/api/agent/review-packages/${segmentPkg.id}`)
      .send({ expectedPackageVersion: segmentPkg.version, corrections: { itinerarySegmentId: 'another-segment' } }).expect(400)
    const decision = `${testPrefix}-formal-edit-confirm`
    const selected = packages.map((pkg) => ({ packageId: pkg.id, expectedPackageVersion: pkg.version }))
    await accept(coordinatorToken, decision, selected).expect(200)
    await processJobs(conversationId)
    const receipt = await getConfirmation(coordinatorToken, decision).expect(200)
    expect(receipt.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ packageId: segmentPkg.id, status: 'succeeded', resultRef: { objectKind: 'itinerary_segment', objectId: segmentId } }),
      expect.objectContaining({ status: 'succeeded', resultRef: { objectKind: 'source_order_guests', objectId: source.id } }),
    ]))
    expect(await prisma.itinerarySegment.findUniqueOrThrow({ where: { id: segmentId } })).toMatchObject({ name: '拉萨市内游览', destination: null, notes: '人工补充的行程备注' })
    expect(await prisma.sourceOrderGuest.findMany({ where: { sourceOrderId: source.id } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: zhang.id, name: '张三', phone: null, gender: 'male' }),
      expect.objectContaining({ name: '李四', notes: '保留备注' }), expect.objectContaining({ name: '王五' }),
    ]))
    expect(await prisma.sourceOrder.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({ adultGuestCount: 3, netReceivableCents: 300000, adultUnitPriceCents: 100000 })
    await accept(coordinatorToken, decision, selected).expect(200)
    await processJobs(conversationId)
    expect(await prisma.sourceOrderGuest.count({ where: { sourceOrderId: source.id } })).toBe(3)
  })

  it.each(['itinerary_segment_update', 'source_order_guests_update'] as const)('blocks stale %s edits after manual changes and keeps the review pending', async (confirmationUnit) => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-修改并发-${confirmationUnit}`)
    const partner = await createPartner(`并发名单-${confirmationUnit}`)
    const source = await app.get(SourceOrderService).createWithSelectedGuests(organizationId, departureId, {
      partnerId: partner.id, adultGuestCount: 1, childGuestCount: 0, adultUnitPriceCents: 100000,
      collectionMode: 'partner_settled', discountType: 'none',
    }, [{ name: '原游客', phone: '13800000001' }])
    const guest = await prisma.sourceOrderGuest.findFirstOrThrow({ where: { sourceOrderId: source.id } })
    const text = '修改第一天名称为新行程，或者将原游客电话改为13800000002'
    const segmentEdit = confirmationUnit === 'itinerary_segment_update'
    const candidates = segmentEdit
      ? [candidate('itinerarySegmentId', segmentId, text, 1), candidate('name', '新行程', text, 1)]
      : [candidate('sourceOrderId', source.id, text, 1), candidate('guestChanges', { update: [{ guestId: guest.id, phone: '13800000002' }] }, text, 1)]
    agent.setOutcome(resolvedItemOutcome(reviewOutcome(await objectVersion(departureId), [{ confirmationUnit, candidates }])))
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-stale-${confirmationUnit}`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 1)
    const pkg = await prisma.aiReviewPackage.findFirstOrThrow({ where: { conversationId } })
    if (segmentEdit) {
      await authRequest(app, coordinatorToken).patch(`/api/segments/${segmentId}`).send({ name: '人工改名' }).expect(200)
    } else {
      await app.get(SourceOrderService).updateGuest(organizationId, source.id, guest.id, { phone: '13800000003' })
    }
    const key = `${testPrefix}-stale-confirm-${confirmationUnit}`
    await accept(coordinatorToken, key, [{ packageId: pkg.id, expectedPackageVersion: pkg.version }]).expect(200)
    await processJobs(conversationId)
    const receipt = await getConfirmation(coordinatorToken, key).expect(200)
    expect(receipt.body.data.items[0]).toMatchObject({ status: 'conflict', reason: expect.stringContaining('目标记录已变化') })
    expect(await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: pkg.id } })).toMatchObject({ status: 'pending', version: pkg.version })
    expect(await prisma.itinerarySegment.findUniqueOrThrow({ where: { id: segmentId } })).toMatchObject({ name: segmentEdit ? '人工改名' : '第一天' })
    expect(await prisma.sourceOrderGuest.findUniqueOrThrow({ where: { id: guest.id } })).toMatchObject({ phone: segmentEdit ? '13800000001' : '13800000003' })
  })

  it.each(['reject', 'cancel'] as const)('%s leaves existing segment edits unwritten', async (action) => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-修改处置-${action}`)
    const text = '将第一天名称改为未确认的新行程'
    agent.setOutcome(resolvedItemOutcome(reviewOutcome(await objectVersion(departureId), [{
      confirmationUnit: 'itinerary_segment_update', candidates: [candidate('itinerarySegmentId', segmentId, text, 1), candidate('name', '未确认的新行程', text, 1)],
    }])))
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-edit-${action}`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 1)
    const pkg = await prisma.aiReviewPackage.findFirstOrThrow({ where: { conversationId } })
    await authRequest(app, coordinatorToken).post(`/api/agent/review-packages/${pkg.id}/${action}`).send({ expectedPackageVersion: pkg.version }).expect(200)
    expect(await prisma.itinerarySegment.findUniqueOrThrow({ where: { id: segmentId } })).toMatchObject({ name: '第一天' })
    expect(await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: pkg.id } })).toMatchObject({ status: action === 'reject' ? 'rejected' : 'cancelled' })
  })

  it('checks edit tool evidence, target ownership, format and version without changing formal data', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-修改工具`)
    const foreign = await createDeparture(`${testPrefix}-其他团`)
    const { conversationId } = await openCollaboration(departureId, '请先读取行程', `${testPrefix}-edit-tool`)
    await processJobs(conversationId)
    const task = await prisma.agentTask.findFirstOrThrow({ where: { departureId, ownerUserId } })
    const delegation = await mintRunningAttemptDelegation({ app, prisma, organizationId, userId: ownerUserId, taskId: task.id, conversationId,
      agentDefinition: { key: 'departure.collaboration', version: 1 }, grantedCapabilities: Object.values(DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL),
    })
    const text = 'e2e worker-shaped attempt'
    const input = { taskId: task.id, runId: delegation.runId, objectVersion: await objectVersion(departureId), confirmationUnit: 'itinerary_segment_update',
      candidates: [candidate('itinerarySegmentId', segmentId, text, delegation.userMessageSequence), candidate('name', '新行程', text, delegation.userMessageSequence)] }
    const call = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/ai-tools/v1/propose-departure-edit-review-package')
      .set('X-Agent-Service-Key', AGENT_SECRET).set('Authorization', `Bearer ${delegation.delegationToken}`).send(body)
    expect((await call(input).expect(200)).body.data).toMatchObject({ status: 'accepted', payloadSchema: 'departure.itinerary_segment_update@v1' })
    await call({ ...input, objectVersion: input.objectVersion + 1 }).expect(409)
    await call({ ...input, candidates: [candidate('itinerarySegmentId', foreign.segmentId, text, delegation.userMessageSequence), input.candidates[1]] }).expect(409)
    const invalidEvidence = await call({ ...input, candidates: [input.candidates[0], candidate('name', '新行程', '不存在的证据原文', delegation.userMessageSequence)] }).expect(200)
    expect(invalidEvidence.body.data.status).toBe('rejected')
    await call({ ...input, confirmationUnit: 'source_order_guests_update', candidates: [candidate('sourceOrderId', 'source-unknown', text, delegation.userMessageSequence), candidate('guestChanges', { delete: ['guest-unknown'] }, text, delegation.userMessageSequence)] }).expect(422)
    expect(await prisma.itinerarySegment.findUniqueOrThrow({ where: { id: segmentId } })).toMatchObject({ name: '第一天' })
    expect(await prisma.aiReviewPackage.count({ where: { conversationId } })).toBe(0)
  })

  it('reads latest formal resources and finance through the tool, excluding review candidates, voided bills and other departures', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-formal-context`)
    const other = await createDeparture(`${testPrefix}-other-context`)
    const partner = await createPartner('formal-context')
    const supplier = await createSupplier('formal-context')
    const conversation = await prisma.aiConversation.create({ data: { organizationId, creatorUserId: ownerUserId, title: 'formal-context' } })
    trackConversation(conversation.id)
    const task = await prisma.agentTask.create({ data: {
      organizationId, ownerUserId, departureId, type: 'departure_collaboration', status: 'active', goal: '读取正式资源和账款汇总',
    } })
    const minted = await mintRunningAttemptDelegation({ app, prisma, organizationId, userId: ownerUserId, taskId: task.id, conversationId: conversation.id })
    const source = await prisma.sourceOrder.create({ data: {
      departureId, partnerId: partner.id, displayName: '正式客源', guestCount: 2, adultGuestCount: 2, childGuestCount: 0,
      adultUnitPriceCents: 100_000, childUnitPriceCents: 0, grossReceivableCents: 200_000, netReceivableCents: 200_000,
      collectionMode: 'partner_settled', partnerCollectedCents: 200_000, guestCollectCents: 0,
    } })
    const hotel = await prisma.segmentResource.create({ data: {
      segmentId, resourceKind: 'hotel', counterpartyType: 'supplier', supplierId: supplier.id, title: '正式酒店', amountCents: 60_000,
    } })
    const car = await prisma.departureResource.create({ data: {
      departureId, resourceKind: 'transport', counterpartyType: 'supplier', supplierId: supplier.id, title: '正式用车', amountCents: 185_000,
    } })
    await prisma.departureResource.create({ data: {
      departureId: other.departureId, resourceKind: 'transport', counterpartyType: 'supplier', supplierId: supplier.id, title: '其他团资源', amountCents: 999_999,
    } })
    for (const status of ['pending', 'rejected'] as const) {
      await prisma.aiReviewPackage.create({ data: {
        organizationId, taskId: task.id, conversationId: conversation.id, status,
        confirmationUnit: 'departure_resource', payloadSchema: 'departure.departure_resource@v1', targetKind: 'departure', targetId: departureId,
        baseObjectVersion: 1, baselineSnapshot: {}, candidates: [{ fieldKey: 'amountCents', proposedValue: 999_999 }],
      } })
    }
    const dueDate = new Date('2026-09-05')
    await prisma.paymentSchedule.createMany({ data: [
      { organizationId, departureId, direction: 'receivable', scheduleNo: `${testPrefix}-AR-context`, title: '正式应收', amountCents: 200_000,
        dueDate, counterpartyType: 'partner', sourceType: 'source_order_customer_settlement', sourceId: source.id },
      { organizationId, departureId, direction: 'payable', scheduleNo: `${testPrefix}-AP-hotel`, title: '酒店应付', amountCents: 60_000,
        dueDate, counterpartyType: 'supplier', sourceType: 'segment_resource', sourceId: hotel.id },
      { organizationId, departureId, direction: 'payable', scheduleNo: `${testPrefix}-AP-car`, title: '用车关闭未付', amountCents: 185_000,
        dueDate, counterpartyType: 'supplier', sourceType: 'departure_resource', sourceId: car.id, cancelledAt: new Date() },
      { organizationId, departureId, direction: 'payable', scheduleNo: `${testPrefix}-AP-void`, title: '作废应付', amountCents: 999_999,
        dueDate, counterpartyType: 'supplier', voidedAt: new Date() },
      { organizationId, departureId: other.departureId, direction: 'receivable', scheduleNo: `${testPrefix}-AR-other`, title: '其他团应收', amountCents: 999_999,
        dueDate, counterpartyType: 'partner' },
    ] })
    const read = () => request(app.getHttpServer()).post('/api/ai-tools/v1/get-task-context')
      .set('X-Agent-Service-Key', AGENT_SECRET).set('Authorization', `Bearer ${minted.delegationToken}`)
      .send({ taskId: task.id, runId: minted.runId, departureId: other.departureId })
    const first = (await read().expect(200)).body.data
    expect(first.snapshot).toMatchObject({
      departureId, guestCount: 2, resources: { count: 2, totalAmountCents: 245_000, items: [
        { id: hotel.id, scope: 'segment', amountCents: 60_000 }, { id: car.id, scope: 'departure', amountCents: 185_000 },
      ] },
      financeSummary: { netReceivableCents: 200_000, receivedCents: 0, openUnreceivedCents: 200_000,
        confirmedPayableCents: 245_000, paidCents: 0, openUnpaidCents: 60_000, closedUnpaidCents: 185_000 },
    })
    expect(first.snapshot).not.toHaveProperty('candidates')
    // 正式约定变更但既有关闭账款不跟随，重读必须同时呈现新资源成本和原账款差额。
    await prisma.departureResource.update({ where: { id: car.id }, data: { amountCents: 195_000 } })
    const second = (await read().expect(200)).body.data.snapshot
    expect(second.resources.totalAmountCents).toBe(255_000)
    expect(second.financeSummary).toMatchObject({ confirmedPayableCents: 245_000, resourcePayableDifferenceCents: -10_000 })
    expect(await prisma.sourceOrder.count({ where: { departureId } })).toBe(1)
    expect(await prisma.aiReviewPackage.count({ where: { taskId: task.id, status: 'pending' } })).toBe(1)
  })

  it('covers material → review → revision → confirm → formal records without leftover collaboration data reset', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-闭环`)
    const partner = await createPartner('闭环客户')
    const supplier = await createSupplier('闭环供应商')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 录入客源张三与希尔顿酒店及全程用车`
    agent.setOutcome(
      resolvedItemOutcome(reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1) },
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, supplier.id, '希尔顿', 128_000, text, 1),
        },
        {
          confirmationUnit: 'departure_resource',
          candidates: departureResourceCandidates(supplier.id, '全程用车', 200_000, text, 1),
        },
      ])),
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

  it.each(['reject', 'cancel'] as const)('disposes a collaboration review with %s without a creation draft and preserves its sibling', async (action) => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-${action}`)
    const supplier = await createSupplier(`${action}-供应商`)
    const text = `${testPrefix} ${action} 两项酒店费用`
    agent.setOutcome(resolvedItemOutcome(reviewOutcome(await objectVersion(departureId), [
      { confirmationUnit: 'segment_resource', candidates: segmentResourceCandidates(segmentId, supplier.id, '待放弃酒店', 10_000, text, 1) },
      { confirmationUnit: 'segment_resource', candidates: segmentResourceCandidates(segmentId, supplier.id, '保留酒店', 20_000, text, 1) },
    ])))
    const { conversationId, batchId } = await openCollaboration(departureId, text, `${testPrefix}-${action}`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 2)
    const packages = await prisma.aiReviewPackage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })
    const target = packages[0]!
    const sibling = packages[1]!
    expect(await prisma.aiCreateTask.count({ where: { id: target.taskId! } })).toBe(0)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${target.id}/${action}`)
      .send({ expectedPackageVersion: target.version }).expect(200)
    expect(response.body.data).toMatchObject({ id: target.taskId, departureId })
    expect(response.body.data.pendingReviews).toEqual([expect.objectContaining({ id: sibling.id })])
    expect(await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: target.id } }))
      .toMatchObject({ status: action === 'reject' ? 'rejected' : 'cancelled', version: target.version + 1 })
    expect(await prisma.aiReviewRecord.count({ where: { packageId: target.id, action } })).toBe(1)
    expect(await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: batchId } })).toMatchObject({ status: 'awaiting_review' })

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${target.id}/${action}`)
      .send({ expectedPackageVersion: target.version }).expect(409)
    await accept(coordinatorToken, `${testPrefix}-${action}-confirm-sibling`, [
      { packageId: sibling.id, expectedPackageVersion: sibling.version },
    ]).expect(200)
    await processJobs(conversationId)
    expect(await prisma.segmentResource.count({ where: { segmentId } })).toBe(1)
    expect(await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: sibling.id } })).toMatchObject({ status: 'confirmed' })
  })

  it('rejects a different payload on the same confirmation key and isolates private sessions', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-幂等`)
    const partner = await createPartner('幂等客户')
    const supplier = await createSupplier('幂等供应商')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 幂等客源与酒店`
    agent.setOutcome(
      resolvedItemOutcome(reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '李四') },
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, supplier.id, '酒店甲', 80_000, text, 1),
        },
      ])),
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
      resolvedItemOutcome(reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '王五') },
      ])),
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

  it('keeps two same-content resources as independent items through confirm', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-同内容`)
    const supplier = await createSupplier('同内容供应商', [ResourceKind.hotel])
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 两家同价酒店`
    const same = segmentResourceCandidates(segmentId, supplier.id, '同价酒店', 50_000, text, 1)
    agent.setOutcome(
      resolvedItemOutcome(reviewOutcome(version, [
        { confirmationUnit: 'segment_resource', candidates: same },
        { confirmationUnit: 'segment_resource', candidates: same },
      ])),
    )
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-same`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 2)

    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const items = listed.body.data.items as Array<{
      id: string
      version: number
      itemIdentity?: string
      proposalHash?: string
    }>
    expect(items).toHaveLength(2)
    expect(new Set(items.map((item) => item.id)).size).toBe(2)
    expect(new Set(items.map((item) => item.itemIdentity)).size).toBe(2)
    expect(items[0]?.proposalHash).toBeTruthy()
    expect(items[0]?.proposalHash).toBe(items[1]?.proposalHash)

    const key = `${testPrefix}-same-confirm`
    await accept(
      coordinatorToken,
      key,
      items.map((item) => ({ packageId: item.id, expectedPackageVersion: item.version })),
    ).expect(200)
    await processJobs(conversationId)
    await waitFor(async () => {
      const live = await getConfirmation(coordinatorToken, key).expect(200)
      expect(live.body.data.items.every((item: { status: string }) => item.status === 'succeeded')).toBe(true)
    })
    expect(await prisma.segmentResource.count({ where: { segmentId } })).toBe(2)
    const written = await prisma.segmentResource.findMany({ where: { segmentId } })
    expect(written.every((row) => row.title === '同价酒店' && row.amountCents === 50_000)).toBe(true)
    expect(new Set(written.map((row) => row.id)).size).toBe(2)
  })

  it('replays concurrent identical confirmation commands without 500 or duplicate effects', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-并发同键确认`)
    const text = '只将第一天名称改成并发确认核定名称'
    agent.setOutcome(resolvedItemOutcome(reviewOutcome(await objectVersion(departureId), [{
      confirmationUnit: 'itinerary_segment_update',
      candidates: [candidate('itinerarySegmentId', segmentId, text, 1), candidate('name', '并发确认核定名称', text, 1)],
    }])))
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-same-command`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 1)
    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const pkg = listed.body.data.items[0] as { id: string; version: number }
    const key = `${testPrefix}-same-decision`
    const responses = await Promise.all(Array.from({ length: 8 }, () => accept(coordinatorToken, key,
      [{ packageId: pkg.id, expectedPackageVersion: pkg.version }])))
    expect(responses.map(response => response.status)).toEqual(Array(8).fill(200))
    expect(responses.map(response => response.body.data.decisionCommandId)).toEqual(Array(8).fill(key))
    await processJobs(conversationId)
    const receipt = await getConfirmation(coordinatorToken, key).expect(200)
    expect(receipt.body.data.items).toEqual([expect.objectContaining({ packageId: pkg.id, status: 'succeeded' })])
    const formal = await authRequest(app, coordinatorToken).get(`/api/departures/${departureId}/segments`).expect(200)
    expect(formal.body.data.items.filter((item: { name: string }) => item.name === '并发确认核定名称')).toHaveLength(1)
  })

  it('rejects a concurrent stale revision from a second device without merging titles', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-双设备`)
    const supplier = await createSupplier('双设备供应商', [ResourceKind.hotel])
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 双设备修订酒店`
    agent.setOutcome(
      resolvedItemOutcome(reviewOutcome(version, [
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, supplier.id, '原酒店名', 80_000, text, 1),
        },
      ])),
    )
    const { conversationId } = await openCollaboration(departureId, text, `${testPrefix}-devices`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 1)
    const listed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const pkg = listed.body.data.items[0] as { id: string; version: number }

    const [first, second] = await Promise.all([
      authRequest(app, coordinatorToken)
        .patch(`/api/agent/review-packages/${pkg.id}`)
        .send({ expectedPackageVersion: pkg.version, corrections: { title: '设备甲标题' } }),
      authRequest(app, coordinatorToken)
        .patch(`/api/agent/review-packages/${pkg.id}`)
        .send({ expectedPackageVersion: pkg.version, corrections: { title: '设备乙标题' } }),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
    const conflict = first.status === 409 ? first : second
    const winner = first.status === 200 ? first : second
    expect(conflict.body.message).toContain('审核包版本已变化')
    const winnerTitle = (winner.body.data.pendingReviews as Array<{
      id: string
      version: number
      candidates: Array<{ fieldKey: string; userCorrectedValue?: unknown; proposedValue?: unknown }>
    }>)
      .find((item) => item.id === pkg.id)
      ?.candidates.find((candidate) => candidate.fieldKey === 'title')?.userCorrectedValue
    expect(['设备甲标题', '设备乙标题']).toContain(winnerTitle)
    const loserTitle = winnerTitle === '设备甲标题' ? '设备乙标题' : '设备甲标题'

    const refreshed = await listCollaboration(departureId, coordinatorToken, conversationId).expect(200)
    const live = (refreshed.body.data.items as Array<{
      id: string
      version: number
      candidates: Array<{ fieldKey: string; userCorrectedValue?: unknown; proposedValue?: unknown }>
    }>).find((item) => item.id === pkg.id)!
    expect(live.version).toBe(pkg.version + 1)
    const liveTitle = live.candidates.find((candidate) => candidate.fieldKey === 'title')
    expect(liveTitle?.userCorrectedValue).toBe(winnerTitle)
    expect(liveTitle?.userCorrectedValue).not.toBe(loserTitle)
    expect(liveTitle?.proposedValue).toBe('原酒店名')

    const revisions = await authRequest(app, coordinatorToken)
      .get(`/api/agent/review-packages/${pkg.id}/revisions`)
      .expect(200)
    expect(revisions.body.data).toHaveLength(1)
    expect(revisions.body.data[0].afterSnapshot).toEqual(expect.objectContaining({ title: winnerTitle }))
    expect(JSON.stringify(revisions.body.data[0])).not.toContain(loserTitle)
  })

  it('writes one resource and leaves the failed sibling pending after refresh, without duplicating the success', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-部分`)
    const okSupplier = await createSupplier('成功供应商', [ResourceKind.hotel])
    const badSupplier = await createSupplier('失败供应商', [ResourceKind.hotel])
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 两家酒店`
    agent.setOutcome(
      resolvedItemOutcome(reviewOutcome(version, [
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, okSupplier.id, '成功酒店', 50_000, text, 1),
        },
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, badSupplier.id, '失败酒店', 60_000, text, 1),
        },
      ])),
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
      resolvedItemOutcome(reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '赵六') },
      ])),
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

  it('prevalidates finance selections without writes, then projects and confirms through Worker with only /departure permission', async () => {
    const { departureId, segmentId } = await createDeparture(`${testPrefix}-model-finance`)
    const partner = await createPartner('model-finance')
    const supplier = await createSupplier('model-finance')
    const createText = '新增两位成人客源与酒店资源，确认后再决定账款'
    agent.setOutcome(resolvedItemOutcome(reviewOutcome(await objectVersion(departureId), [
      { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, createText, 1) },
      { confirmationUnit: 'segment_resource', candidates: segmentResourceCandidates(segmentId, supplier.id, '初始财务酒店', 70000, createText, 1) },
    ])))
    const { conversationId } = await openCollaboration(departureId, createText, `${testPrefix}-model-finance-create`)
    await processJobs(conversationId)
    await waitForPendingPackages(conversationId, 2)
    const sourcePackages = await prisma.aiReviewPackage.findMany({ where: { conversationId, status: 'pending' } })
    await accept(coordinatorToken, `${testPrefix}-model-finance-create-confirm`, sourcePackages.map((pkg) => ({ packageId: pkg.id, expectedPackageVersion: pkg.version }))).expect(200)
    await processJobs(conversationId)
    const source = await prisma.sourceOrder.findFirstOrThrow({ where: { departureId } })
    const resource = await prisma.segmentResource.findFirstOrThrow({ where: { segmentId } })
    const taskId = sourcePackages[0]!.taskId!
    const savedRoles = await prisma.userRole.findMany({ where: { userId: ownerUserId } })
    const financeUser = await prisma.user.findFirstOrThrow({ where: { username: 'acai', deletedAt: null }, include: { roles: true } })
    await prisma.userRole.deleteMany({ where: { userId: ownerUserId } })
    await prisma.userRole.createMany({ data: financeUser.roles.map((role) => ({ userId: ownerUserId, roleId: role.roleId })) })
    try {
      const negativeText = '不要提交应收应付，只查询目前状态'
      let minted = await mintRunningAttemptDelegation({ app, prisma, organizationId, userId: ownerUserId, taskId, conversationId,
        agentDefinition: { key: 'departure.collaboration', version: 1 },
        grantedCapabilities: Object.values(DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL), userText: negativeText,
      })
      const tool = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/ai-tools/v1/propose-initial-finance-review-package')
        .set('X-Agent-Service-Key', AGENT_SECRET).set('Authorization', `Bearer ${minted.delegationToken}`).send(body)
      const input = { taskId, runId: minted.runId, objectVersion: await objectVersion(departureId), confirmationUnit: 'source_order_receivable',
        candidates: [candidate('sourceOrderId', source.id, '继续提交应收', minted.userMessageSequence)] }
      const deniedEvidence = await tool(input).expect(200)
      expect(deniedEvidence.body.data.status).toBe('rejected')
      expect(await prisma.aiReviewPackage.count({ where: { conversationId } })).toBe(2)
      const positiveText = '继续提交刚才客源的应收和酒店应付'
      await prisma.aiAgentAttempt.update({ where: { id: minted.attemptId }, data: { status: 'completed' } })
      await prisma.aiInputBatch.update({ where: { id: minted.inputBatchId }, data: { status: 'completed' } })
      minted = await mintRunningAttemptDelegation({ app, prisma, organizationId, userId: ownerUserId, taskId, conversationId,
        agentDefinition: { key: 'departure.collaboration', version: 1 },
        grantedCapabilities: Object.values(DEPARTURE_COLLABORATION_CAPABILITY_REFS_BY_TOOL), userText: positiveText,
      })
      input.runId = minted.runId
      input.candidates = [candidate('sourceOrderId', source.id, positiveText, minted.userMessageSequence)]
      const prevalidated = await tool(input).expect(200)
      expect(prevalidated.body.data.status).toBe('accepted')
      expect(await prisma.aiReviewPackage.count({ where: { conversationId } })).toBe(2)
      expect(await prisma.paymentSchedule.count({ where: { departureId } })).toBe(0)
      const ordinarySource = await app.get(SourceOrderService).createWithSelectedGuests(organizationId, departureId, {
        partnerId: partner.id, adultGuestCount: 1, childGuestCount: 0, adultUnitPriceCents: 100,
        collectionMode: 'partner_settled', discountType: 'none',
      }, [])
      await tool({ ...input, objectVersion: await objectVersion(departureId), candidates: [candidate('sourceOrderId', ordinarySource.id, positiveText, minted.userMessageSequence)] }).expect(400)
      await prisma.aiAgentAttempt.update({ where: { id: minted.attemptId }, data: { status: 'completed' } })
      await prisma.aiInputBatch.update({ where: { id: minted.inputBatchId }, data: { status: 'completed' } })

      const sent = await authRequest(app, coordinatorToken).post(`/api/agent/conversations/${conversationId}/messages`)
        .set('Idempotency-Key', `${testPrefix}-model-finance-prepare`).send({ text: positiveText, pageLocator: { kind: 'departure', objectId: departureId } }).expect(201)
      const sequence = sent.body.data.events.find((event: { kind: string }) => event.kind === 'user_message').sequence
      agent.setOutcome(resolvedItemOutcome(reviewOutcome(await objectVersion(departureId), [
        { confirmationUnit: 'source_order_receivable', candidates: [candidate('sourceOrderId', source.id, positiveText, sequence)] },
        { confirmationUnit: 'resource_payable', candidates: [candidate('sourceType', 'segment_resource', positiveText, sequence), candidate('sourceId', resource.id, positiveText, sequence)] },
      ])))
      await processJobs(conversationId)
      await waitForPendingPackages(conversationId, 2)
      const financial = await prisma.aiReviewPackage.findMany({ where: { conversationId, status: 'pending' } })
      expect(financial.map((pkg) => pkg.confirmationUnit).sort()).toEqual(['resource_payable', 'source_order_receivable'])
      expect(financial.every((pkg) => pkg.sourceActionId && pkg.inputBatchId === sent.body.data.batch.id)).toBe(true)
      expect(await prisma.paymentSchedule.count({ where: { departureId } })).toBe(0)
      await authRequest(app, coordinatorToken).post(`/api/departures/${departureId}/segments`).send({ name: '不得扩权' }).expect(403)
      const payable = financial.find((pkg) => pkg.confirmationUnit === 'resource_payable')!
      await prisma.segmentResource.update({ where: { id: resource.id }, data: { amountCents: 80000 } })
      const staleDecision = `${testPrefix}-model-finance-stale`
      await accept(coordinatorToken, staleDecision, [{ packageId: payable.id, expectedPackageVersion: payable.version }]).expect(200)
      await processJobs(conversationId)
      const conflict = await getConfirmation(coordinatorToken, staleDecision).expect(200)
      expect(conflict.body.data.items[0].status).toBe('conflict')
      expect(await prisma.paymentSchedule.count({ where: { sourceId: resource.id } })).toBe(0)

      const reviseText = '基于当前正式金额重新准备这项应付审核'
      const revisedInput = await authRequest(app, coordinatorToken).post(`/api/agent/conversations/${conversationId}/messages`)
        .set('Idempotency-Key', `${testPrefix}-model-finance-revise`).send({ text: reviseText, reviewPackageId: payable.id, pageLocator: { kind: 'departure', objectId: departureId } }).expect(201)
      const revisionSequence = revisedInput.body.data.events.find((event: { kind: string }) => event.kind === 'user_message').sequence
      const revisedProposal = { objectVersion: await objectVersion(departureId), confirmationUnit: 'resource_payable', reviewPackageId: payable.id, expectedPackageVersion: payable.version,
        candidates: [candidate('sourceType', 'segment_resource', reviseText, revisionSequence), candidate('sourceId', resource.id, reviseText, revisionSequence)] }
      agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_review', completionBasis: { kind: 'accepted_review_package' }, reviewPackage: revisedProposal } as HeadlessExecutionResult))
      await processJobs(conversationId)
      const latestPayable = await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: payable.id } })
      expect(latestPayable.version).toBeGreaterThan(payable.version)
      expect((latestPayable.candidates as Array<{ fieldKey: string; proposedValue: unknown }>).find((item) => item.fieldKey === 'amountCents')?.proposedValue).toBe(80000)
      const receivable = financial.find((pkg) => pkg.confirmationUnit === 'source_order_receivable')!
      const selected = [receivable, latestPayable].map((pkg) => ({ packageId: pkg.id, expectedPackageVersion: pkg.version }))
      const decision = `${testPrefix}-model-finance-final`
      await accept(coordinatorToken, decision, selected).expect(200)
      await processJobs(conversationId)
      const receipt = await getConfirmation(coordinatorToken, decision).expect(200)
      expect(receipt.body.data.items.every((item: { status: string }) => item.status === 'succeeded')).toBe(true)
      const beforeReplay = await prisma.paymentSchedule.count({ where: { departureId } })
      expect(beforeReplay).toBe(2)
      await accept(coordinatorToken, decision, selected).expect(200)
      await processJobs(conversationId)
      expect(await prisma.paymentSchedule.count({ where: { departureId } })).toBe(beforeReplay)
    } finally {
      await prisma.userRole.deleteMany({ where: { userId: ownerUserId } })
      await prisma.userRole.createMany({ data: savedRoles })
    }
  })

  it('lets finance confirm receivables but not create source orders, and refuses F2 backfill', async () => {
    const { departureId } = await createDeparture(`${testPrefix}-账款`)
    const partner = await createPartner('账款客户')
    const version = await objectVersion(departureId)
    const text = `${testPrefix} 账款客源`
    agent.setOutcome(
      resolvedItemOutcome(reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '孙七') },
      ])),
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
      resolvedItemOutcome(reviewOutcome(version, [
        {
          confirmationUnit: 'segment_resource',
          candidates: segmentResourceCandidates(segmentId, supplier.id, '关闭酒店', 70_000, text, 1),
        },
        {
          confirmationUnit: 'departure_resource',
          candidates: departureResourceCandidates(supplier.id, '关闭用车', 90_000, text, 1),
        },
      ])),
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
      resolvedItemOutcome(reviewOutcome(version, [
        { confirmationUnit: 'source_order_create', candidates: sourceOrderCandidates(partner.id, text, 1, '周八') },
      ])),
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
