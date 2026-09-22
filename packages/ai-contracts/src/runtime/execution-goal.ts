import { z } from 'zod'

export const AGENT_EXECUTION_GOALS = [
  'answer',
  'propose_change',
  'clarify',
  'governed_action',
] as const

export type AgentExecutionGoal = (typeof AGENT_EXECUTION_GOALS)[number]

export const agentExecutionGoalSchema = z.enum(AGENT_EXECUTION_GOALS)

export const COMPLETION_BASIS_KINDS = [
  'final_answer',
  'accepted_review_package',
  'persistent_clarification',
  'governed_action_result',
] as const

export type CompletionBasisKind = (typeof COMPLETION_BASIS_KINDS)[number]

export const completionBasisSchema = z
  .object({
    kind: z.enum(COMPLETION_BASIS_KINDS),
  })
  .strip()

export type CompletionBasis = z.infer<typeof completionBasisSchema>
