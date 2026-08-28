import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AgentTaskStatus,
  TaskActivityKind,
} from '@prisma/client'
import { registeredTaskDescriptors } from '@xiaotuanbao/ai-contracts'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { isolateOpenTaskRuntime } from './agent-task.runtime'
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

      await isolateOpenTaskRuntime(tx, {
        taskId,
        errorCode:
          terminalStatus === AgentTaskStatus.closed ? 'TASK_CLOSED' : 'TASK_CANCELLED',
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
    const descriptor = registeredTaskDescriptors.findByTaskType(task.type)
    if (!descriptor) {
      throw new ForbiddenException('无权继续该任务')
    }
    const permissionKeys = await this.authService.getPermissionKeysForUser(userId)
    if (!permissionKeys.includes(descriptor.requiredPermissionKey)) {
      throw new ForbiddenException('无权继续该建团任务')
    }
  }
}
