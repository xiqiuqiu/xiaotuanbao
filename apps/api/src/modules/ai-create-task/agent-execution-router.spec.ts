import {
  AI_CREATE_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
} from '@xiaotuanbao/ai-contracts'
import { AgentTaskType, InputBatchTaskRole } from '@prisma/client'
import { AgentExecutionRouter } from './agent-execution-router'
import type { ResolvedPageContext } from './page-locator.resolver'

const departureTask = {
  taskId: 'task-1',
  role: InputBatchTaskRole.primary,
  taskType: AgentTaskType.departure_creation,
}

function page(kind: 'partner' | 'departure'): ResolvedPageContext {
  return {
    locator: { kind, objectId: `${kind}-1` },
    objectVersion: 1,
    facts: { kind, objectId: `${kind}-1` },
  }
}

describe('AgentExecutionRouter', () => {
  const router = new AgentExecutionRouter()

  it('routes a primary departure task to departure.create', () => {
    expect(
      router.route({ associations: { taskRefs: [departureTask] } }),
    ).toEqual({
      kind: 'execution_definition',
      source: 'task',
      agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
      taskId: 'task-1',
    })
  })

  it('keeps the definition frozen by a replied interaction', () => {
    expect(
      router.route({
        associations: {
          interaction: {
            id: 'interaction-1',
            agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
            taskId: 'task-1',
          },
          taskRefs: [],
        },
      }),
    ).toMatchObject({
      source: 'interaction',
      agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
      taskId: 'task-1',
    })
  })

  it('keeps the definition frozen by a review package disposition', () => {
    expect(
      router.route({
        associations: {
          reviewPackage: {
            id: 'review-1',
            agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
            taskId: 'task-1',
          },
          taskRefs: [],
        },
      }),
    ).toMatchObject({
      source: 'review_package',
      agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
      taskId: 'task-1',
    })
  })

  it.each(['partner', 'departure'] as const)(
    'does not route from a resolved %s page attachment',
    (kind) => {
      expect(
        router.route({ associations: { taskRefs: [] }, pageAttachment: page(kind) }),
      ).toEqual({
        kind: 'execution_definition',
        source: 'default',
        agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
      })
    },
  )

  it('gives the frozen task priority over a page attachment', () => {
    expect(
      router.route({
        associations: { taskRefs: [departureTask] },
        pageAttachment: page('partner'),
      }),
    ).toMatchObject({
      source: 'task',
      agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
      taskId: 'task-1',
    })
  })

  it('adds a registered intent row without changing the routing procedure', () => {
    const extensibleRouter = new AgentExecutionRouter([
      {
        intentKey: 'future.task.proposal',
        kind: 'task_creation_proposal',
        taskType: AgentTaskType.departure_creation,
        requiredPermissionKey: 'departure:write',
      },
    ])

    expect(
      extensibleRouter.route({
        associations: { taskRefs: [] },
        registeredIntent: { key: 'future.task.proposal' },
      }),
    ).toEqual({
      kind: 'task_creation_proposal',
      registeredIntentKey: 'future.task.proposal',
      taskType: AgentTaskType.departure_creation,
      requiredPermissionKey: 'departure:write',
    })
  })
})
