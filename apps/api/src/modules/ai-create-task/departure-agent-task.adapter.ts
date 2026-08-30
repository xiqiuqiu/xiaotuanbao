import { Injectable } from '@nestjs/common'
import {
  DEPARTURE_BASIC_INFO_REVIEW_SCHEMA,
  DEPARTURE_CREATION_TASK_DESCRIPTOR,
  buildTaskCompletedHref,
  buildTaskWorkspaceHref,
} from '@xiaotuanbao/ai-contracts'
import type { ConfirmAiCreateTaskDto, ConfirmAiReviewPackageDto } from './dto/ai-create-task.dto'
import { AiCreateTaskService } from './ai-create-task.service'
import type {
  AgentTaskBusinessCommand,
  AgentTaskDomainAdapter,
  AgentTaskReviewCommand,
  TaskBoundAiToolRequestUser,
} from './agent-task-domain.adapter'

type SnapshotCaller = Parameters<AiCreateTaskService['getTaskContextForAgent']>[0]
type ReviewCaller = Parameters<AiCreateTaskService['proposeReviewPackageForAgent']>[0]
type SubmitReviewOptions = Parameters<AiCreateTaskService['submitReviewPackageForAgent']>[2]
type ReferenceCaller = Parameters<AiCreateTaskService['searchRouteTemplatesForAgent']>[0]
type MaterialCaller = Parameters<AiCreateTaskService['getMaterialParseResultForAgent']>[0]

/**
 * 发团写业务的平台注册适配边界。通用 Agent 入口只调用这里，不解释发团字段。
 */
@Injectable()
export class DepartureAgentTaskAdapter implements AgentTaskDomainAdapter {
  readonly descriptor = DEPARTURE_CREATION_TASK_DESCRIPTOR
  readonly reviewSchema = DEPARTURE_BASIC_INFO_REVIEW_SCHEMA

  constructor(private readonly tasks: AiCreateTaskService) {}

  getSnapshot(caller: TaskBoundAiToolRequestUser, input: unknown) {
    return this.tasks.getTaskContextForAgent(caller as SnapshotCaller, input)
  }

  searchReferences(caller: TaskBoundAiToolRequestUser, input: unknown) {
    return this.tasks.searchRouteTemplatesForAgent(caller as ReferenceCaller, input)
  }

  getMaterial(caller: TaskBoundAiToolRequestUser, input: unknown) {
    return this.tasks.getMaterialParseResultForAgent(caller as MaterialCaller, input)
  }

  fieldCatalog() {
    return this.reviewSchema.confirmationUnits[0].fields
  }

  proposeReview(caller: TaskBoundAiToolRequestUser, input: unknown) {
    return this.tasks.proposeReviewPackageForAgent(caller as ReviewCaller, input)
  }

  submitReview(caller: TaskBoundAiToolRequestUser, input: unknown, options: SubmitReviewOptions) {
    return this.tasks.submitReviewPackageForAgent(caller as ReviewCaller, input, options)
  }

  executeBusinessCommand(command: AgentTaskBusinessCommand) {
    if (command.kind !== 'complete') {
      return Promise.reject(new Error(`不支持的发团业务命令: ${command.kind}`))
    }
    return this.tasks.confirm(
      command.organizationId,
      command.userId,
      command.taskId,
      command.input as ConfirmAiCreateTaskDto,
      command.idempotencyKey,
    )
  }

  async confirmReview(command: AgentTaskReviewCommand) {
    const taskId = await this.tasks.resolveOwnedReviewTaskId(
      command.organizationId,
      command.userId,
      command.reviewPackageId,
    )
    return this.tasks.confirmReviewPackage(
      command.organizationId,
      command.userId,
      taskId,
      command.reviewPackageId,
      command.input as ConfirmAiReviewPackageDto,
      command.decisionCommandId,
    )
  }

  workspaceNavigation(taskId: string) {
    return buildTaskWorkspaceHref(this.descriptor, taskId)
  }

  completedNavigation(departureId: string) {
    return buildTaskCompletedHref(this.descriptor, departureId)
  }
}
