import {
  AI_CREATE_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
  validateHeadlessOutcomeAgainstGoal,
} from '@xiaotuanbao/ai-contracts'
import { executionGoalForRoute } from './agent-execution-goal'

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

  it.each([
    AI_CREATE_AGENT_DEFINITION_REF,
    DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
    CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  ])('lets the Agent resolve each request item for $key', (agentDefinition) => {
    const executionGoal = executionGoalForRoute({
      route: { kind: 'execution_definition', source: 'default', agentDefinition },
    })
    expect(executionGoal).toBe('resolve_items')
    expect(validateHeadlessOutcomeAgainstGoal({
      executionGoal,
      outcome: { kind: 'answered', message: '好的，我来处理。', completionBasis: { kind: 'final_answer' } },
    })).toMatchObject({ kind: 'failed', error: { code: 'AGENT_OUTCOME_INCOMPLETE' } })
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
