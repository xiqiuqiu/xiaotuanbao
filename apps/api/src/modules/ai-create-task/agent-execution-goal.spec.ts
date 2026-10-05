import {
  AI_CREATE_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
} from '@xiaotuanbao/ai-contracts'
import { executionGoalForRoute } from './agent-execution-goal'
import type { AgentExecutionRoute } from './agent-execution-router'

describe('executionGoalForRoute', () => {
  it('uses the caller-supplied goal when present', () => {
    expect(
      executionGoalForRoute({
        route: {
          kind: 'execution_definition',
          source: 'default',
          agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
        },
        executionGoal: 'propose_change',
      }),
    ).toBe('propose_change')
  })

  it('defaults conversation.general to answer', () => {
    expect(
      executionGoalForRoute({
        route: {
          kind: 'execution_definition',
          source: 'default',
          agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
        },
      }),
    ).toBe('answer')
  })

  it('defaults departure.create and departure changes to propose_change', () => {
    const createRoute: AgentExecutionRoute = {
      kind: 'execution_definition',
      source: 'task',
      agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
      taskId: 'task-1',
    }
    const collaborationRoute: AgentExecutionRoute = {
      kind: 'execution_definition',
      source: 'task',
      agentDefinition: DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
      taskId: 'task-2',
    }
    expect(executionGoalForRoute({ route: createRoute })).toBe('propose_change')
    expect(
      executionGoalForRoute({ route: collaborationRoute, userText: '团名改成九月川西回团' }),
    ).toBe('propose_change')
    expect(
      executionGoalForRoute({ route: collaborationRoute, userText: '能把团名改成九月川西回团吗？' }),
    ).toBe('propose_change')
  })

  it('treats an ordinary departure question as answer', () => {
    expect(
      executionGoalForRoute({
        route: {
          kind: 'execution_definition',
          source: 'task',
          agentDefinition: DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
          taskId: 'task-2',
        },
        userText: '现在这个发团的团名是什么？',
      }),
    ).toBe('answer')
  })

  it('defaults a persistent follow-up to clarify', () => {
    expect(
      executionGoalForRoute({
        route: {
          kind: 'persistent_follow_up',
          registeredIntentKey: 'clarify.departure-date',
          promptKey: 'ask_departure_date',
        },
      }),
    ).toBe('clarify')
  })

  it('defaults a task creation proposal to governed_action', () => {
    expect(
      executionGoalForRoute({
        route: {
          kind: 'task_creation_proposal',
          registeredIntentKey: 'task.departure-creation.requested',
          taskType: 'departure_creation' as never,
          requiredPermissionKey: 'departure:write',
        },
      }),
    ).toBe('governed_action')
  })
})
