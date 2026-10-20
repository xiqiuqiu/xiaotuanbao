import { emptyDepartureReadModelAggregate } from '../departure/departure-read-model.utils'
import { departureObjectVersion } from './departure-object-version'
import { AiCreateTaskService } from './ai-create-task.service'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import { AiToolHttpAdapter } from './ai-tool-http.adapter'
import { DepartureAgentTaskAdapter } from './departure-agent-task.adapter'

describe('getTaskContext formal business facts', () => {
  const now = new Date('2026-09-08T00:00:00Z')
  const caller = { organizationId: 'org-1', userId: 'user-1', taskId: 'task-1', runId: 'run-1' }
  const order = {
    id: 'source-1', displayName: '土楼客源', partnerId: 'partner-1',
    partner: { name: '福建土楼专线地接' },
    guestCount: 10, adultGuestCount: 8, childGuestCount: 2,
  }
  function setup(formal = true, collaboration = false) {
    const task = {
      id: caller.taskId, currentPhase: 'basic_info', departureId: formal ? 'departure-1' : null,
      draft: { version: 1, snapshot: { mode: 'manual', routeName: '旧草稿', expectedGuestCountHint: 99 }, updatedAt: now },
      departure: formal ? {
        id: 'departure-1', organizationId: caller.organizationId, status: 'editing',
        routeSource: 'manual', routeName: '正式线路', name: '正式发团',
        startDate: now, endDate: now, dayCount: 1, ownerUserId: caller.userId,
        departureType: 'combined', updatedAt: now,
      } : null,
      agentTask: { ownerUserId: caller.userId, status: 'active', statusVersion: 1, createdAt: now, updatedAt: now, reviewPackages: [] },
    }
    const sourceRead = jest.fn().mockResolvedValue([order])
    const segmentRead = jest.fn().mockResolvedValue([
      { id: 'hotel-1', segmentId: 'segment-1', resourceKind: 'hotel', title: '正式酒店', amountCents: 60_000, supplier: { name: '酒店供应商' }, partner: null },
    ])
    const departureResourceRead = jest.fn().mockResolvedValue([
      { id: 'car-1', resourceKind: 'transport', title: '正式用车', amountCents: 185_000, supplier: { name: '用车供应商' }, partner: null },
    ])
    const detail = {
      ...emptyDepartureReadModelAggregate(),
      netReceivableCents: 200_000,
      overviewStats: { ...emptyDepartureReadModelAggregate().overviewStats,
        receivedCents: 50_000, openUnreceivedCents: 140_000, closedUnreceivedCents: 10_000,
        confirmedPayableCents: 245_000, paidCents: 40_000, openUnpaidCents: 200_000, closedUnpaidCents: 5_000 },
    }
    const detailRead = jest.fn().mockResolvedValue(detail)
    const agentTask = {
      ...task.agentTask, id: caller.taskId, organizationId: caller.organizationId,
      type: 'departure_collaboration', departureId: task.departureId, departure: task.departure,
    }
    const draftRead = jest.fn().mockResolvedValue(collaboration ? null : task)
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ snapshot: '{}' }]),
      agentTask: { findFirst: jest.fn().mockResolvedValue(collaboration ? agentTask : null) },
      aiCreateTask: { findFirst: draftRead },
      aiAgentAttempt: { findFirst: jest.fn().mockResolvedValue({ id: caller.runId }) },
      itinerarySegment: { findMany: jest.fn().mockResolvedValue([]) },
      sourceOrder: { findMany: sourceRead },
      segmentResource: { findMany: segmentRead },
      departureResource: { findMany: departureResourceRead },
    }
    const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    const service = new AiCreateTaskService({ ...tx, $transaction: transaction } as never, { getById: detailRead } as never, {} as never, {} as never, {} as never, {} as never, {} as never)
    return { service, sourceRead, draftRead, agentTask, tx, transaction, segmentRead, departureResourceRead, detailRead, detail }
  }

  it('reads formal facts for an independent collaboration task without any creation draft', async () => {
    const { service, draftRead, tx, transaction } = setup(true, true)
    const gateway = new AiActionGateway(
      { findOrCreate: jest.fn().mockResolvedValue(null) } as never,
      { findTask: jest.fn().mockResolvedValue({
        id: caller.taskId, organizationId: caller.organizationId, ownerUserId: caller.userId,
        draftId: null, draftVersion: null, departureId: 'departure-1',
      }) } as never,
    )
    const http = new AiToolHttpAdapter(gateway, new DepartureAgentTaskAdapter(service), {} as never)
    const result = await http.getTaskContext({
      ...caller, grantedCapabilities: [{ key: 'departure.task-context.read', version: 2 }],
    } as never, caller)
    expect(result.snapshot).toMatchObject({
      departureId: 'departure-1', guestCount: 10,
      sourceOrders: [{ partnerName: '福建土楼专线地接' }],
    })
    expect(result.objectVersion).toBe(await departureObjectVersion(tx as never, caller.organizationId, 'departure-1'))
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' })
    expect(draftRead).not.toHaveBeenCalled()
  })

  it('rejects a different owner before reading source orders', async () => {
    const { service, sourceRead, agentTask } = setup(true, true)
    agentTask.ownerUserId = 'other-user'
    await expect(service.getTaskContextForAgent(caller, caller)).rejects.toThrow('仅任务创建者')
    expect(sourceRead).not.toHaveBeenCalled()
  })

  it('returns 10 actual guests and the existing partner instead of treating stale draft hints as facts', async () => {
    const { service, sourceRead } = setup()
    const result = await service.getTaskContextForAgent(caller, caller)
    expect(result.snapshot).toMatchObject({
      routeName: '正式线路',
      departureId: 'departure-1', guestCount: 10, adultGuestCount: 8, childGuestCount: 2,
      sourceOrders: [{ id: 'source-1', partnerName: '福建土楼专线地接', guestCount: 10 }],
    })
    expect(sourceRead).toHaveBeenCalledWith(expect.objectContaining({
      where: { departureId: 'departure-1', departure: { organizationId: 'org-1' } },
    }))
    sourceRead.mockResolvedValueOnce([])
    expect((await service.getTaskContextForAgent(caller, caller)).snapshot).toMatchObject({
      guestCount: 0, sourceOrders: [],
    })
  })

  it.each([false, true])('returns formal resources and finance for collaboration=%s, rereading after changes', async (collaboration) => {
    const { service, segmentRead, departureResourceRead, detailRead, detail } = setup(true, collaboration)
    const result = await service.getTaskContextForAgent(caller, caller)
    expect(result.snapshot).toMatchObject({
      resources: { count: 2, totalAmountCents: 245_000, items: [
        { id: 'hotel-1', scope: 'segment', segmentId: 'segment-1', title: '正式酒店', amountCents: 60_000, supplierName: '酒店供应商' },
        { id: 'car-1', scope: 'departure', segmentId: null, title: '正式用车', amountCents: 185_000 },
      ] },
      financeSummary: {
        netReceivableCents: 200_000, receivedCents: 50_000, openUnreceivedCents: 140_000, closedUnreceivedCents: 10_000,
        confirmedPayableCents: 245_000, paidCents: 40_000, openUnpaidCents: 200_000, closedUnpaidCents: 5_000,
      },
    })
    expect(segmentRead).toHaveBeenCalledWith(expect.objectContaining({ where: { segment: { departureId: 'departure-1', departure: { organizationId: 'org-1' } } } }))
    expect(departureResourceRead).toHaveBeenCalledWith(expect.objectContaining({ where: { departureId: 'departure-1', departure: { organizationId: 'org-1' } } }))
    expect(detailRead).toHaveBeenCalledWith('org-1', 'departure-1')
    segmentRead.mockResolvedValueOnce([])
    departureResourceRead.mockResolvedValueOnce([])
    detailRead.mockResolvedValueOnce({ ...detail, overviewStats: { ...detail.overviewStats, paidCents: 245_000, openUnpaidCents: 0, closedUnpaidCents: 0 } })
    expect((await service.getTaskContextForAgent(caller, caller)).snapshot).toMatchObject({
      resources: { count: 0, totalAmountCents: 0, items: [] }, financeSummary: { paidCents: 245_000, openUnpaidCents: 0 },
    })
  })

  it('keeps pre-creation estimates distinct and does not query formal orders', async () => {
    const { service, sourceRead, segmentRead, departureResourceRead, detailRead } = setup(false)
    const result = await service.getTaskContextForAgent(caller, caller)
    expect(result.snapshot.expectedGuestCountHint).toBe(99)
    expect(result.snapshot).not.toHaveProperty('guestCount')
    expect(sourceRead).not.toHaveBeenCalled()
    expect(segmentRead).not.toHaveBeenCalled()
    expect(departureResourceRead).not.toHaveBeenCalled()
    expect(detailRead).not.toHaveBeenCalled()
    expect(result.snapshot).not.toHaveProperty('financeSummary')
    expect(result.snapshot).not.toHaveProperty('resources')
  })
})
