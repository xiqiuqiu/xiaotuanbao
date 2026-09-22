import {
  AI_CREATE_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
  agentExecutionGoalSchema,
  type AgentExecutionGoal,
} from '@xiaotuanbao/ai-contracts'
import type { AgentExecutionRoute } from './agent-execution-router'

export function executionGoalForRoute(input: {
  route: AgentExecutionRoute
  executionGoal?: AgentExecutionGoal
}): AgentExecutionGoal {
  if (input.executionGoal) {
    return agentExecutionGoalSchema.parse(input.executionGoal)
  }
  if (input.route.kind === 'persistent_follow_up') {
    return 'clarify'
  }
  if (input.route.kind === 'task_creation_proposal') {
    return 'governed_action'
  }
  const key = input.route.agentDefinition.key
  if (
    key === AI_CREATE_AGENT_DEFINITION_REF.key ||
    key === DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF.key
  ) {
    return 'propose_change'
  }
  if (key === CONVERSATION_GENERAL_AGENT_DEFINITION_REF.key) {
    return 'answer'
  }
  return 'answer'
}
