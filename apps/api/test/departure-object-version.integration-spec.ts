import { randomUUID } from 'node:crypto'
import { PrismaService } from '../src/database/prisma/prisma.service'
import { DepartureFinanceFacade } from '../src/modules/finance/departure-finance-facade.service'
import { DepartureResourceService } from '../src/modules/departure/departure-resource.service'
import { ReviewCollaborationService } from '../src/modules/ai-create-task/review-collaboration.service'
import { departureObjectVersion } from '../src/modules/ai-create-task/departure-object-version'

// Only this fixture organization is created/deleted; no Worker or shared seed state.
describe('collaboration object fingerprint (PostgreSQL)', () => {
  const prisma = new PrismaService()
  let organizationId: string
  let departureId: string
  let ownerId: string
  let partnerId: string
  beforeAll(async () => {
    organizationId = (await prisma.organization.create({ data: { name: `version-${randomUUID()}`, businessPrefix: randomUUID().replace(/[^a-f]/g, '').slice(0, 4).toUpperCase() } })).id
    ownerId = (await prisma.user.create({ data: { organizationId, username: randomUUID(), name: '版本测试', passwordHash: 'unused' } })).id
    partnerId = (await prisma.partner.create({ data: { organizationId, name: '客源客户', partnerKind: 'group_agent', partnerType: 'group_agency' } })).id
    departureId = (await prisma.departure.create({ data: {
      organizationId, ownerUserId: ownerId, departureNo: randomUUID(), name: '版本测试团', routeName: '测试',
      startDate: new Date('2026-09-01'), endDate: new Date('2026-09-10'), dayCount: 10,
    } })).id
  })
  afterAll(async () => {
    if (organizationId) {
      await prisma.aiReviewRecord.deleteMany({ where: { organizationId } })
      await prisma.aiReviewPackage.deleteMany({ where: { organizationId } })
      await prisma.agentTask.deleteMany({ where: { organizationId } })
      await prisma.departure.deleteMany({ where: { organizationId } })
      await prisma.supplier.deleteMany({ where: { organizationId } })
      await prisma.partner.deleteMany({ where: { organizationId } })
      await prisma.user.deleteMany({ where: { organizationId } })
      await prisma.organization.delete({ where: { id: organizationId } })
    }
    await prisma.$disconnect()
  })
  const version = () => departureObjectVersion(prisma, organizationId, departureId)

  it('detects child insert/update/delete while the old parent timestamp stays unchanged', async () => {
    const parentBefore = await prisma.departure.findUniqueOrThrow({ where: { id: departureId } })
    let previous = await version()
    async function changed(write: () => Promise<unknown>) {
      await write()
      const current = await version()
      expect(current).not.toBe(previous)
      previous = current
    }
    const segment = await prisma.itinerarySegment.create({ data: { departureId, name: '第一天', sortOrder: 0 } })
    expect(await version()).not.toBe(previous)
    previous = await version()
    await changed(() => prisma.itinerarySegment.update({ where: { id: segment.id }, data: { name: '第二天' } }))
    const resource = await prisma.segmentResource.create({ data: { segmentId: segment.id, title: '门票', amountCents: 100, resourceKind: 'ticket', counterpartyType: 'partner', partnerId } })
    expect(await version()).not.toBe(previous)
    previous = await version()
    await changed(() => prisma.segmentResource.update({ where: { id: resource.id }, data: { amountCents: 200 } }))
    await changed(() => prisma.segmentResource.delete({ where: { id: resource.id } }))
    const departureResource = await prisma.departureResource.create({ data: { departureId, title: '全程用车', amountCents: 100, resourceKind: 'transport', counterpartyType: 'partner', partnerId } })
    expect(await version()).not.toBe(previous)
    previous = await version()
    await changed(() => prisma.departureResource.update({ where: { id: departureResource.id }, data: { amountCents: 200 } }))
    await changed(() => prisma.departureResource.delete({ where: { id: departureResource.id } }))
    await changed(() => prisma.itinerarySegment.delete({ where: { id: segment.id } }))
    const source = await prisma.sourceOrder.create({ data: { departureId, partnerId, displayName: '客源', guestCount: 1, adultGuestCount: 1, childGuestCount: 0, adultUnitPriceCents: 100, childUnitPriceCents: 0, grossReceivableCents: 100, netReceivableCents: 100, collectionMode: 'partner_settled', partnerCollectedCents: 100, guestCollectCents: 0 } })
    expect(await version()).not.toBe(previous)
    previous = await version()
    await changed(() => prisma.sourceOrder.update({ where: { id: source.id }, data: { displayName: '客源修改' } }))
    const guest = await prisma.sourceOrderGuest.create({ data: { sourceOrderId: source.id, name: '旅客' } })
    expect(await version()).not.toBe(previous)
    previous = await version()
    await changed(() => prisma.sourceOrderGuest.update({ where: { id: guest.id }, data: { name: '旅客修改' } }))
    await changed(() => prisma.sourceOrderGuest.delete({ where: { id: guest.id } }))
    const adjustment = await prisma.sourceOrderFareAdjustment.create({ data: { sourceOrderId: source.id, kind: 'single_room_topup', direction: 'increase', amountCents: 100 } })
    expect(await version()).not.toBe(previous)
    previous = await version()
    await changed(() => prisma.sourceOrderFareAdjustment.update({ where: { id: adjustment.id }, data: { amountCents: 200 } }))
    await changed(() => prisma.sourceOrderFareAdjustment.delete({ where: { id: adjustment.id } }))
    await changed(() => prisma.partner.update({ where: { id: partnerId }, data: { name: '客户改名' } }))
    await changed(() => prisma.sourceOrder.delete({ where: { id: source.id } }))
    expect((await prisma.departure.findUniqueOrThrow({ where: { id: departureId } })).updatedAt).toEqual(parentBefore.updatedAt)
  })

  it('ignores timestamp-only writes, changes on business fields, and isolates organizations', async () => {
    const before = await version()
    await prisma.departure.update({ where: { id: departureId }, data: { updatedAt: new Date('2030-01-01') } })
    expect(await version()).toBe(before)
    await prisma.departure.update({ where: { id: departureId }, data: { endDate: new Date('2026-09-11') } })
    expect(await version()).not.toBe(before)
    await expect(departureObjectVersion(prisma, 'other-org', departureId)).rejects.toThrow('REVIEW_PACKAGE_TASK_MISSING')
  })

  it('keeps the token and facts in the same repeatable-read snapshot across a concurrent commit', async () => {
    const before = await version()
    await prisma.$transaction(async (tx) => {
      const facts = await tx.departure.findUniqueOrThrow({ where: { id: departureId } })
      await prisma.departure.update({ where: { id: departureId }, data: { name: '并发改名' } })
      expect(await departureObjectVersion(tx, organizationId, departureId)).toBe(before)
      expect((await tx.departure.findUniqueOrThrow({ where: { id: departureId } })).name).toBe(facts.name)
    }, { isolationLevel: 'RepeatableRead' })
    expect(await version()).not.toBe(before)
  })
  it('confirms sibling additions against live writes even though their shared context fingerprint changes', async () => {
    const supplier = await prisma.supplier.create({ data: { organizationId, name: '测试酒店', categories: ['hotel'] } })
    const task = await prisma.agentTask.create({ data: { organizationId, departureId, ownerUserId: ownerId, type: 'departure_collaboration', status: 'active', goal: '准备资源' } })
    const baseline = await version()
    const finance = Object.assign(Object.create(DepartureFinanceFacade.prototype), { prisma }) as DepartureFinanceFacade
    const resources = new DepartureResourceService(prisma, finance)
    // Only workflow notifications/receipt projection are omitted; CAS, records, locks and resource writes are real.
    const service = Object.assign(Object.create(ReviewCollaborationService.prototype), {
      prisma, finance, departureResources: resources,
      conversations: { finalizeReviewDisposition: async () => [] },
      completeItemInTx: async () => undefined,
    }) as ReviewCollaborationService
    async function prepare(title: string) {
      return prisma.aiReviewPackage.create({ data: {
        organizationId, taskId: task.id, payloadSchema: 'departure.departure_resource@v1', confirmationUnit: 'departure_resource',
        targetKind: 'departure', targetId: departureId, baseObjectVersion: baseline, baselineSnapshot: {},
        candidates: Object.entries({ resourceKind: 'hotel', supplierId: supplier.id, title, amountCents: 100 }).map(([fieldKey, proposedValue]) => ({
          fieldKey, proposedValue, clarity: 'clear', status: 'pending', evidence: [{ kind: 'user_message', sequence: 1, excerpt: title }],
        })),
      } })
    }
    const first = await prepare('第一家酒店')
    const second = await prepare('第二家酒店')
    const confirm = (pkg: typeof first) => service['confirmIndependentItem'](organizationId, ownerId, pkg, 1, { id: 'test-job', idempotencyRecordId: null })
    await confirm(first)
    expect(await version()).not.toBe(baseline)
    await confirm(second)
    expect(await prisma.aiReviewPackage.count({ where: { id: { in: [first.id, second.id] }, status: 'confirmed' } })).toBe(2)
    expect(await prisma.departureResource.count({ where: { departureId, supplierId: supplier.id } })).toBe(2)
    const closed = await prepare('第三家酒店')
    await prisma.departure.update({ where: { id: departureId }, data: { status: 'closed' } })
    await expect(confirm(closed)).rejects.toThrow('发团已关闭')
    expect((await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: closed.id } })).status).toBe('pending')
    await prisma.departure.update({ where: { id: departureId }, data: { status: 'editing' } })
  })

})
