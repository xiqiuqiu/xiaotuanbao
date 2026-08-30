import type {
  GetMaterialParseResultOutput,
  GetTaskContextOutput,
  ProposeReviewPackageOutput,
  SearchRouteTemplatesOutput,
  SubmitReviewPackageOutput,
} from '@xiaotuanbao/ai-contracts'
import type { AiToolRequestUser } from './ai-operation-delegation.guard'

export const AGENT_TASK_DOMAIN_ADAPTER = Symbol('AGENT_TASK_DOMAIN_ADAPTER')

export type TaskBoundAiToolRequestUser = AiToolRequestUser & { taskId: string; runId: string }

export interface AgentTaskDomainAdapter {
  getSnapshot(user: TaskBoundAiToolRequestUser, input: unknown): Promise<GetTaskContextOutput>
  searchReferences(user: TaskBoundAiToolRequestUser, input: unknown): Promise<SearchRouteTemplatesOutput>
  getMaterial(user: TaskBoundAiToolRequestUser, input: unknown): Promise<GetMaterialParseResultOutput>
  proposeReview(user: TaskBoundAiToolRequestUser, input: unknown): Promise<ProposeReviewPackageOutput>
  submitReview(
    user: TaskBoundAiToolRequestUser,
    input: unknown,
    options: { sourceActionId: string },
  ): Promise<SubmitReviewPackageOutput>
}
