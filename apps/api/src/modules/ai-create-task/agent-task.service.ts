import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AgentTaskStatus,
  AgentTaskType,
  AiActionExecutionStatus,
  AiAgentAttemptStatus,
  AiConversationInteractionStatus,
  AiInputBatchStatus,
  InputBatchTaskRole,
  AiReviewPackageStatus,
  AiWorkflowJobStatus,
  TaskActivityKind,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { lockAiCreateTask, lockAgentConversation } from './ai-create-task.lock'

@Injectable()
export class AgentTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async linkConversation(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    linkReason: 'created' | 'continued' | 'referenced',
  ) {
    await this.assertTaskCapability(organizationId, userId, taskId)
    return this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, organizationId, taskId)
      await lockAgentConversation(tx, organizationId, conversationId)
      const [task, conversation] = await Promise.all([
        tx.agentTask.findFirst({
          where: { id: taskId, organizationId },
        }),
        tx.aiConversation.findFirst({
          where: { id: conversationId, organizationId },
        }),
      ])
      if (!task) {
        throw new NotFoundException('Agent 任务不存在')
      }
      if (!conversation) {
        throw new NotFoundException('会话不存在')
      }
      if (task.ownerUserId !== userId || conversation.creatorUserId !== userId) {
        throw new ForbiddenException('仅任务和会话所有者可建立关联')
      }
      if (
        task.status === AgentTaskStatus.closed ||
        task.status === AgentTaskStatus.cancelled
      ) {
        throw new ForbiddenException('已关闭或取消的任务不可继续关联会话')
      }
      return tx.conversationTaskLink.upsert({
        where: { conversationId_taskId: { conversationId, taskId } },
        create: {
          organizationId,
          conversationId,
          taskId,
          linkedByUserId: userId,
          linkReason,
          metadata: { explicit: true },
        },
        update: {},
      })
    })
  }

  async close(
    organizationId: string,
    userId: string,
    taskId: string,
    expectedStatusVersion: number,
  ) {
    return this.terminate(organizationId, userId, taskId, expectedStatusVersion, 'closed')
  }

  async cancel(
    organizationId: string,
    userId: string,
    taskId: string,
    expectedStatusVersion: number,
  ) {
    return this.terminate(organizationId, userId, taskId, expectedStatusVersion, 'cancelled')
  }

  private async terminate(
    organizationId: string,
    userId: string,
    taskId: string,
    expectedStatusVersion: number,
    terminalStatus: 'cancelled' | 'closed',
  ) {
    await this.assertTaskCapability(organizationId, userId, taskId)
    return this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, organizationId, taskId)
      const task = await tx.agentTask.findFirst({
        where: { id: taskId, organizationId },
      })
      if (!task) {
        throw new NotFoundException('Agent 任务不存在')
      }
      if (task.ownerUserId !== userId) {
        throw new ForbiddenException('仅任务所有者可关闭任务')
      }
      if (task.status === terminalStatus) {
        return task
      }
      if (
        ([
          AgentTaskStatus.completed,
          AgentTaskStatus.failed,
          AgentTaskStatus.cancelled,
          AgentTaskStatus.closed,
        ] as AgentTaskStatus[]).includes(task.status)
      ) {
        throw new ConflictException('任务已进入终态，不可再次变更')
      }
      if (task.statusVersion !== expectedStatusVersion) {
        throw new ConflictException('任务状态已变化，请刷新后重试')
      }

      const batchScope = {
        taskLinks: {
          some: {
            taskId,
            role: { in: [InputBatchTaskRole.primary, InputBatchTaskRole.created] },
          },
        },
      }
      const terminalErrorCode =
        terminalStatus === AgentTaskStatus.closed ? 'TASK_CLOSED' : 'TASK_CANCELLED'
      await tx.aiWorkflowJob.updateMany({
        where: {
          inputBatch: batchScope,
          status: { in: [AiWorkflowJobStatus.pending, AiWorkflowJobStatus.claimed] },
        },
        data: {
          status: AiWorkflowJobStatus.failed,
          lastErrorCode: terminalErrorCode,
          leaseExpiresAt: null,
          generation: { increment: 1 },
        },
      })
      await tx.aiAgentAttempt.updateMany({
        where: {
          inputBatch: batchScope,
          status: AiAgentAttemptStatus.running,
        },
        data: {
          status: AiAgentAttemptStatus.failed,
          errorCode: terminalErrorCode,
          endedAt: new Date(),
        },
      })
      await tx.aiConversationInteraction.updateMany({
        where: {
          inputBatch: batchScope,
          status: AiConversationInteractionStatus.pending,
        },
        data: {
          status: AiConversationInteractionStatus.cancelled,
          version: { increment: 1 },
        },
      })
      await tx.aiReviewPackage.updateMany({
        where: { taskId, status: AiReviewPackageStatus.pending },
        data: {
          status: AiReviewPackageStatus.superseded,
          version: { increment: 1 },
        },
      })
      await tx.aiInputBatch.updateMany({
        where: {
          ...batchScope,
          status: {
            in: [
              AiInputBatchStatus.waiting_for_materials,
              AiInputBatchStatus.ready_for_agent,
              AiInputBatchStatus.agent_running,
              AiInputBatchStatus.awaiting_user_input,
              AiInputBatchStatus.awaiting_review,
            ],
          },
        },
        data: { status: AiInputBatchStatus.cancelled },
      })
      await tx.aiAction.updateMany({
        where: {
          taskId,
          executionStatus: AiActionExecutionStatus.not_started,
        },
        data: { executionStatus: AiActionExecutionStatus.skipped },
      })

      return tx.agentTask.update({
        where: { id: taskId },
        data: {
          status: terminalStatus,
          statusVersion: { increment: 1 },
          activities: {
            create: {
              organizationId,
              actorUserId: userId,
              kind:
                terminalStatus === AgentTaskStatus.closed
                  ? TaskActivityKind.closed
                  : TaskActivityKind.cancelled,
              summary:
                terminalStatus === AgentTaskStatus.closed
                  ? '任务已由 User 显式关闭'
                  : '任务已由 User 取消',
              payload: { previousStatus: task.status },
            },
          },
        },
      })
    })
  }

  private async assertTaskCapability(
    organizationId: string,
    userId: string,
    taskId: string,
  ): Promise<void> {
    const task = await this.prisma.agentTask.findFirst({
      where: { id: taskId, organizationId },
      select: { type: true },
    })
    if (!task) {
      throw new NotFoundException('Agent 任务不存在')
    }
    if (task.type === AgentTaskType.departure_creation) {
      const permissionKeys = await this.authService.getPermissionKeysForUser(userId)
      if (!permissionKeys.includes('departure:write')) {
        throw new ForbiddenException('无权继续该建团任务')
      }
    }
  }
}
