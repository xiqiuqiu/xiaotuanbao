import {
  agentExecutionGoalSchema,
  type AgentExecutionGoal,
} from '@xiaotuanbao/ai-contracts'
import type { AgentExecutionRoute } from './agent-execution-router'

export function executionGoalForRoute(input: {
  route: AgentExecutionRoute
  executionGoal?: AgentExecutionGoal
}): AgentExecutionGoal {
  if (input.executionGoal) return agentExecutionGoalSchema.parse(input.executionGoal)
  if (input.route.kind === 'persistent_follow_up') return 'clarify'
  if (input.route.kind === 'task_creation_proposal') return 'governed_action'
  return 'resolve_items'
}
