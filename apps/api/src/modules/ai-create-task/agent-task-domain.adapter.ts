import type {
  GetMaterialParseResultOutput,
  GetTaskContextOutput,
  ProposeReviewPackageOutput,
  ReviewFieldDescriptor,
  ReviewSchema,
  SearchRouteTemplatesOutput,
  SubmitReviewPackageOutput,
  TaskCompletedHref,
  TaskDescriptor,
  TaskWorkspaceHref,
} from '@xiaotuanbao/ai-contracts'
import type { AiToolRequestUser } from './ai-operation-delegation.guard'

export const AGENT_TASK_DOMAIN_ADAPTER = Symbol('AGENT_TASK_DOMAIN_ADAPTER')

export type TaskBoundAiToolRequestUser = AiToolRequestUser & { taskId: string; runId: string }

export type AgentTaskBusinessCommand = {
  kind: string
  organizationId: string
  userId: string
  taskId: string
  input: unknown
  idempotencyKey?: string
}

export interface AgentTaskDomainAdapter {
  readonly descriptor: TaskDescriptor
  readonly reviewSchema: ReviewSchema
  fieldCatalog(): readonly ReviewFieldDescriptor[]
  getSnapshot(user: TaskBoundAiToolRequestUser, input: unknown): Promise<GetTaskContextOutput>
  searchReferences(user: TaskBoundAiToolRequestUser, input: unknown): Promise<SearchRouteTemplatesOutput>
  getMaterial(user: TaskBoundAiToolRequestUser, input: unknown): Promise<GetMaterialParseResultOutput>
  proposeReview(user: TaskBoundAiToolRequestUser, input: unknown): Promise<ProposeReviewPackageOutput>
  submitReview(
    user: TaskBoundAiToolRequestUser,
    input: unknown,
    options: { sourceActionId: string },
  ): Promise<SubmitReviewPackageOutput>
  executeBusinessCommand(command: AgentTaskBusinessCommand): Promise<unknown>
  workspaceNavigation(taskId: string): TaskWorkspaceHref
  completedNavigation(targetId: string): TaskCompletedHref
}
