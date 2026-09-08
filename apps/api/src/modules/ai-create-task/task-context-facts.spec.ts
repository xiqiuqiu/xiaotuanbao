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
    const agentTask = {
      ...task.agentTask, id: caller.taskId, organizationId: caller.organizationId,
      type: 'departure_collaboration', departureId: task.departureId, departure: task.departure,
    }
    const draftRead = jest.fn().mockResolvedValue(collaboration ? null : task)
    const service = new AiCreateTaskService({
      agentTask: { findFirst: jest.fn().mockResolvedValue(collaboration ? agentTask : null) },
      aiCreateTask: { findFirst: draftRead },
      aiAgentAttempt: { findFirst: jest.fn().mockResolvedValue({ id: caller.runId }) },
      sourceOrder: { findMany: sourceRead },
    } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
    return { service, sourceRead, draftRead, agentTask }
  }

  it('reads formal facts for an independent collaboration task without any creation draft', async () => {
    const { service, draftRead } = setup(true, true)
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
    expect(result.objectVersion).toBe(now.getTime())
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

  it('keeps pre-creation estimates distinct and does not query formal orders', async () => {
    const { service, sourceRead } = setup(false)
    const result = await service.getTaskContextForAgent(caller, caller)
    expect(result.snapshot.expectedGuestCountHint).toBe(99)
    expect(result.snapshot).not.toHaveProperty('guestCount')
    expect(sourceRead).not.toHaveBeenCalled()
  })
})
