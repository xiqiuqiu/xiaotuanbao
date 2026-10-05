import { z } from 'zod'

export const AGENT_EXECUTION_GOALS = [
  'resolve_items',
  'answer',
  'propose_change',
  'clarify',
  'governed_action',
] as const

export type AgentExecutionGoal = (typeof AGENT_EXECUTION_GOALS)[number]

export const agentExecutionGoalSchema = z.enum(AGENT_EXECUTION_GOALS)

export const COMPLETION_BASIS_KINDS = [
  'resolved_items',
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

export const agentWorkItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  request: z.string().trim().min(1).max(8000),
  goal: z.enum(['answer', 'propose_change', 'clarify', 'governed_action']),
}).strip()
export type AgentWorkItem = z.infer<typeof agentWorkItemSchema>
