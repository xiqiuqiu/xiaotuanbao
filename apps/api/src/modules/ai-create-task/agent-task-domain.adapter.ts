import type {
  GetMaterialParseResultOutput,
  GetTaskContextOutput,
  ProposeReviewPackageOutput,
  ReviewFieldDescriptor,
  ReviewSchema,
  SearchPartnersOutput,
  SearchRouteTemplatesOutput,
  SearchSuppliersOutput,
  SearchUsersOutput,
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

export type AgentTaskReviewCommand = {
  organizationId: string
  userId: string
  reviewPackageId: string
  input: unknown
  decisionCommandId?: string
}

export interface AgentTaskDomainAdapter {
  readonly descriptor: TaskDescriptor
  readonly reviewSchema: ReviewSchema
  fieldCatalog(): readonly ReviewFieldDescriptor[]
  getSnapshot(user: TaskBoundAiToolRequestUser, input: unknown): Promise<GetTaskContextOutput>
  searchReferences(user: TaskBoundAiToolRequestUser, input: unknown): Promise<SearchRouteTemplatesOutput>
  searchUsers(user: TaskBoundAiToolRequestUser, input: unknown): Promise<SearchUsersOutput>
  searchSuppliers(user: TaskBoundAiToolRequestUser, input: unknown): Promise<SearchSuppliersOutput>
  searchPartners(user: TaskBoundAiToolRequestUser, input: unknown): Promise<SearchPartnersOutput>
  getMaterial(user: TaskBoundAiToolRequestUser, input: unknown): Promise<GetMaterialParseResultOutput>
  proposeReview(user: TaskBoundAiToolRequestUser, input: unknown): Promise<ProposeReviewPackageOutput>
  submitReview(
    user: TaskBoundAiToolRequestUser,
    input: unknown,
    options: { sourceActionId: string },
  ): Promise<SubmitReviewPackageOutput>
  executeBusinessCommand(command: AgentTaskBusinessCommand): Promise<unknown>
  confirmReview(command: AgentTaskReviewCommand): Promise<unknown>
  workspaceNavigation(taskId: string): TaskWorkspaceHref
  completedNavigation(targetId: string): TaskCompletedHref
}
