import { AI_CREATE_AGENT_DEFINITION_REF } from './ai-create-definitions'
import {
  DEPARTURE_CREATION_GOAL_INTENT_KEY,
  DEPARTURE_CREATION_ROUTING_DECISION,
  DEPARTURE_CREATION_TASK_DESCRIPTOR,
  DEPARTURE_CREATION_TASK_TYPE,
  TaskDescriptorRegistry,
  buildTaskCompletedHref,
  buildTaskWorkspaceHref,
  matchTaskWorkspaceAttachment,
  registeredTaskDescriptors,
  type TaskDescriptor,
} from './task-descriptor'

const extraDescriptor: TaskDescriptor = {
  taskType: 'partner.accounts-query',
  version: 1,
  defaultTitle: '查询往来账款',
  attachmentLabel: '当前账款工作',
  requiredPermissionKey: 'partner:write',
  agentDefinition: { key: 'partner.accounts', version: 1 },
  registeredIntent: {
    key: 'task.partner-accounts.requested',
    routingDecision: 'propose_partner_accounts',
    kind: 'task_creation_proposal',
  },
  workspace: {
    pathname: '/partner/accounts/task',
    taskIdSearchParam: 'taskId',
  },
  completedRoute: {
    pathname: '/partner/$partnerId',
    objectIdParam: 'partnerId',
    search: { tab: 'accounts' },
  },
  activity: {
    regionLabel: 'Agent 任务',
    actionLabel: '查看任务',
  },
}

describe('Task Descriptor Registry #439', () => {
  it('registers the existing basic-info departure task with current User-visible fields', () => {
    const descriptor = registeredTaskDescriptors.getByTaskType(DEPARTURE_CREATION_TASK_TYPE)

    expect(descriptor).toBe(DEPARTURE_CREATION_TASK_DESCRIPTOR)
    expect(descriptor).toMatchObject({
      taskType: 'departure_creation',
      version: 1,
      defaultTitle: '创建发团',
      attachmentLabel: '当前建团工作',
      requiredPermissionKey: 'departure:write',
      agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
      registeredIntent: {
        key: DEPARTURE_CREATION_GOAL_INTENT_KEY,
        routingDecision: DEPARTURE_CREATION_ROUTING_DECISION,
        kind: 'task_creation_proposal',
      },
      workspace: {
        pathname: '/departure/new',
        taskIdSearchParam: 'taskId',
      },
      completedRoute: {
        pathname: '/departure/$departureId',
        objectIdParam: 'departureId',
        search: { tab: 'overview' },
      },
      activity: {
        regionLabel: 'Agent 任务',
        actionLabel: '查看任务',
      },
    })
  })

  it('looks up the same descriptor by intent, routing decision, agent definition and workspace path', () => {
    const registry = registeredTaskDescriptors
    const byType = registry.getByTaskType('departure_creation')

    expect(registry.findByIntentKey(DEPARTURE_CREATION_GOAL_INTENT_KEY)).toBe(byType)
    expect(registry.findByRoutingDecision(DEPARTURE_CREATION_ROUTING_DECISION)).toBe(byType)
    expect(registry.findByAgentDefinition(AI_CREATE_AGENT_DEFINITION_REF)).toBe(byType)
    expect(registry.findByWorkspacePath('/departure/new')).toBe(byType)
    expect(registry.findByWorkspacePath('/partner/partner-1')).toBeUndefined()
    expect(() => registry.getByTaskType('unknown.task')).toThrow('未登记')
  })

  it('rejects duplicate task types without changing lookup procedure', () => {
    expect(
      () => new TaskDescriptorRegistry([DEPARTURE_CREATION_TASK_DESCRIPTOR, DEPARTURE_CREATION_TASK_DESCRIPTOR]),
    ).toThrow('重复')
  })

  it('lets a second task type register routing, title, attachment, locator and navigation', () => {
    const registry = new TaskDescriptorRegistry([DEPARTURE_CREATION_TASK_DESCRIPTOR, extraDescriptor])

    expect(registry.getByTaskType('partner.accounts-query').defaultTitle).toBe('查询往来账款')
    expect(registry.findByIntentKey('task.partner-accounts.requested')?.attachmentLabel).toBe(
      '当前账款工作',
    )
    expect(registry.intentRoutes()).toEqual([
      {
        intentKey: DEPARTURE_CREATION_GOAL_INTENT_KEY,
        kind: 'task_creation_proposal',
        taskType: 'departure_creation',
        requiredPermissionKey: 'departure:write',
      },
      {
        intentKey: 'task.partner-accounts.requested',
        kind: 'task_creation_proposal',
        taskType: 'partner.accounts-query',
        requiredPermissionKey: 'partner:write',
      },
    ])
    expect(matchTaskWorkspaceAttachment('/partner/accounts/task', '?taskId=task-9', registry)).toEqual({
      kind: 'agent_task',
      taskType: 'partner.accounts-query',
      taskId: 'task-9',
    })
    expect(buildTaskWorkspaceHref(extraDescriptor, 'task-9')).toEqual({
      pathname: '/partner/accounts/task',
      search: { taskId: 'task-9' },
    })
    expect(buildTaskCompletedHref(extraDescriptor, 'partner-1')).toEqual({
      pathname: '/partner/$partnerId',
      params: { partnerId: 'partner-1' },
      search: { tab: 'accounts' },
    })
  })

  it('matches the current departure wizard attachment and completion navigation', () => {
    expect(matchTaskWorkspaceAttachment('/departure/new', '')).toBeNull()
    expect(matchTaskWorkspaceAttachment('/departure/new', '?taskId=task-1')).toEqual({
      kind: 'agent_task',
      taskType: 'departure_creation',
      taskId: 'task-1',
    })
    expect(matchTaskWorkspaceAttachment('/departure/departure-1', '?taskId=task-1')).toBeNull()
    expect(buildTaskWorkspaceHref(DEPARTURE_CREATION_TASK_DESCRIPTOR, 'task-1')).toEqual({
      pathname: '/departure/new',
      search: { taskId: 'task-1' },
    })
    expect(buildTaskCompletedHref(DEPARTURE_CREATION_TASK_DESCRIPTOR, 'dep-1')).toEqual({
      pathname: '/departure/$departureId',
      params: { departureId: 'dep-1' },
      search: { tab: 'overview' },
    })
  })
})
