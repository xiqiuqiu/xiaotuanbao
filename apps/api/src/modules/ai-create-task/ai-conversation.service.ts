import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  AiConversationEventView,
  AiConversationView,
  SendAiConversationMessageResult,
} from '@xiaotuanbao/shared'
import {
  AiConversationEventKind,
  AiConversationStatus,
  AiCreateTaskStatus,
  AiInputBatchStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  type AiConversation,
  type AiConversationEvent,
  type AiCreateTask,
  type AiInputBatch,
  type DepartureCreationDraft,
  type Prisma,
} from '@prisma/client'
import { Observable } from 'rxjs'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import { AiConversationEventHub } from './ai-conversation-event.hub'
import {
  MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION,
  MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_USER,
  SEND_TEXT_OPERATION,
  SSE_CATCH_UP_POLL_MS,
} from './ai-conversation.constants'
import { toBatchView, toConversationView, toEventView } from './ai-conversation.mapper'
import { isAiCreateAssistEnabledForUser } from './ai-create-assist-access'
import { lockAiCreateSender, lockAiCreateTask } from './ai-create-task.lock'

const TASK_INCLUDE = {
  draft: true,
} satisfies Prisma.AiCreateTaskInclude

type TaskWithDraft = AiCreateTask & { draft: DepartureCreationDraft | null }

@Injectable()
export class AiConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly eventHub: AiConversationEventHub,
  ) {}

  async openOrResume(
    organizationId: string,
    userId: string,
    taskId: string,
  ): Promise<AiConversationView> {
    await this.assertAssistAccess(userId)
    const task = await this.findOwnedInProgressTask(organizationId, userId, taskId)
    const conversation = await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, organizationId, task.id)
      const existing = await tx.aiConversation.findFirst({
        where: {
          taskId: task.id,
          organizationId,
          status: AiConversationStatus.open,
        },
        orderBy: { updatedAt: 'desc' },
      })
      if (existing) {
        return existing
      }
      return tx.aiConversation.create({
        data: {
          organizationId,
          taskId: task.id,
          creatorUserId: userId,
        },
      })
    })
    return this.loadConversationView(conversation)
  }

  async sendText(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    text: string,
    idempotencyKey: string | undefined,
  ): Promise<SendAiConversationMessageResult> {
    await this.assertAssistAccess(userId)
    const key = idempotencyKey?.trim()
    if (!key) {
      throw new BadRequestException('发送消息必须提供 Idempotency-Key 幂等键')
    }
    if (key.length > 200) {
      throw new BadRequestException('幂等键长度不能超过 200 个字符')
    }
    const trimmed = text.trim()
    if (!trimmed) {
      throw new BadRequestException('消息不能为空')
    }

    const hash = requestHash({ taskId, conversationId, text: trimmed })
    const published: AiConversationEventView[] = []

    const result = await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, organizationId, taskId)
      await lockAiCreateSender(tx, organizationId, userId)
      const task = await this.findOwnedInProgressTask(organizationId, userId, taskId, tx)
      const conversation = await tx.aiConversation.findFirst({
        where: { id: conversationId, taskId: task.id, organizationId },
      })
      if (!conversation) {
        throw new NotFoundException('AI 建团会话不存在')
      }
      if (conversation.creatorUserId !== userId) {
        throw new ForbiddenException('仅任务创建者可访问该 AI 建团会话')
      }
      if (conversation.status !== AiConversationStatus.open) {
        throw new BadRequestException('仅未完成的 AI 建团会话可发送消息')
      }

      const record = await tx.aiCreateIdempotencyRecord.upsert({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId,
            operation: SEND_TEXT_OPERATION,
            idempotencyKey: key,
          },
        },
        create: {
          organizationId,
          taskId: task.id,
          operation: SEND_TEXT_OPERATION,
          idempotencyKey: key,
          requestHash: hash,
        },
        update: {},
      })

      if (record.taskId !== task.id) {
        throw new ConflictException('幂等键已被其他任务使用')
      }
      if (record.requestHash !== hash) {
        throw new ConflictException('幂等键已用于不同的发送内容')
      }
      if (record.completedAt && record.resultJson) {
        return record.resultJson as unknown as SendAiConversationMessageResult
      }

      await this.assertProcessingBatchCapacity(tx, {
        organizationId,
        userId,
        conversationId: conversation.id,
      })

      const lastEvent = await tx.aiConversationEvent.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { sequence: 'desc' },
      })
      const userSequence = (lastEvent?.sequence ?? 0) + 1
      const statusSequence = userSequence + 1

      const userEvent = await tx.aiConversationEvent.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          sequence: userSequence,
          kind: AiConversationEventKind.user_message,
          payload: { text: trimmed },
        },
      })

      const batch = await tx.aiInputBatch.create({
        data: {
          organizationId,
          taskId: task.id,
          conversationId: conversation.id,
          creatorUserId: userId,
          userMessageEventId: userEvent.id,
          conversationVersion: userSequence,
          status: AiInputBatchStatus.ready_for_agent,
        },
      })

      const statusEvent = await tx.aiConversationEvent.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          sequence: statusSequence,
          kind: AiConversationEventKind.batch_status,
          payload: { batchId: batch.id, status: AiInputBatchStatus.ready_for_agent },
        },
      })

      await tx.aiWorkflowJob.create({
        data: {
          organizationId,
          taskId: task.id,
          conversationId: conversation.id,
          inputBatchId: batch.id,
          type: AiWorkflowJobType.agent_batch,
          status: AiWorkflowJobStatus.pending,
        },
      })

      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })

      const events = [toEventView(userEvent), toEventView(statusEvent)]
      const payload: SendAiConversationMessageResult = {
        conversationId: conversation.id,
        batch: toBatchView(batch),
        events,
        lastSequence: statusSequence,
      }

      await tx.aiCreateIdempotencyRecord.update({
        where: { id: record.id },
        data: {
          resultJson: payload as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      })

      published.push(...events)
      return payload
    })

    for (const event of published) {
      this.eventHub.publish(conversationId, event)
    }
    return result
  }

  async listEvents(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    afterSequence = 0,
  ): Promise<{
    conversationId: string
    events: AiConversationEventView[]
    lastSequence: number
    activeBatch: ReturnType<typeof toBatchView> | null
  }> {
    await this.assertAssistAccess(userId)
    await this.findOwnedInProgressTask(organizationId, userId, taskId)
    const conversation = await this.requireOwnedConversation(
      organizationId,
      userId,
      taskId,
      conversationId,
    )
    const events = await this.prisma.aiConversationEvent.findMany({
      where: {
        conversationId: conversation.id,
        sequence: { gt: afterSequence },
      },
      orderBy: { sequence: 'asc' },
    })
    const last = await this.prisma.aiConversationEvent.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { sequence: 'desc' },
    })
    const activeBatch = await this.findActiveBatch(conversation.id)
    return {
      conversationId: conversation.id,
      events: events.map(toEventView),
      lastSequence: last?.sequence ?? 0,
      activeBatch: activeBatch ? toBatchView(activeBatch) : null,
    }
  }

  async streamEvents(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    afterSequence = 0,
  ): Promise<Observable<{ id: string; data: AiConversationEventView }>> {
    await this.assertAssistAccess(userId)
    await this.findOwnedInProgressTask(organizationId, userId, taskId)
    await this.requireOwnedConversation(organizationId, userId, taskId, conversationId)

    return new Observable((subscriber) => {
      let cancelled = false
      let lastSeq = afterSequence
      let timer: ReturnType<typeof setTimeout> | undefined
      const emit = (event: AiConversationEventView) => {
        if (event.sequence <= lastSeq) {
          return
        }
        lastSeq = event.sequence
        subscriber.next({ id: String(event.sequence), data: event })
      }
      const live = this.eventHub.observe(conversationId).subscribe(emit)

      // Worker 与 API 分进程时内存 hub 收不到完成事件，按 sequence 轮询补读。
      const poll = async () => {
        if (cancelled) {
          return
        }
        try {
          const events = await this.prisma.aiConversationEvent.findMany({
            where: { conversationId, sequence: { gt: lastSeq } },
            orderBy: { sequence: 'asc' },
          })
          if (cancelled) {
            return
          }
          for (const event of events) {
            emit(toEventView(event))
          }
        } catch (error: unknown) {
          if (!cancelled) {
            subscriber.error(error)
          }
          return
        }
        timer = setTimeout(() => {
          void poll()
        }, SSE_CATCH_UP_POLL_MS)
      }
      void poll()

      return () => {
        cancelled = true
        if (timer) {
          clearTimeout(timer)
        }
        live.unsubscribe()
      }
    })
  }

  async appendEvent(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      conversationId: string
      kind: AiConversationEventKind
      payload: Prisma.InputJsonValue
    },
  ): Promise<AiConversationEvent> {
    const last = await tx.aiConversationEvent.findFirst({
      where: { conversationId: params.conversationId },
      orderBy: { sequence: 'desc' },
    })
    return tx.aiConversationEvent.create({
      data: {
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        sequence: (last?.sequence ?? 0) + 1,
        kind: params.kind,
        payload: params.payload,
      },
    })
  }

  publish(conversationId: string, event: AiConversationEvent): void {
    this.eventHub.publish(conversationId, toEventView(event))
  }

  private async loadConversationView(conversation: AiConversation): Promise<AiConversationView> {
    const events = await this.prisma.aiConversationEvent.findMany({
      where: { conversationId: conversation.id },
      orderBy: { sequence: 'asc' },
    })
    const activeBatch = await this.findActiveBatch(conversation.id)
    return toConversationView(conversation, events, activeBatch)
  }

  private async assertProcessingBatchCapacity(
    tx: Prisma.TransactionClient,
    params: { organizationId: string; userId: string; conversationId: string },
  ): Promise<void> {
    const processingStatus = {
      in: [
        AiInputBatchStatus.waiting_for_materials,
        AiInputBatchStatus.ready_for_agent,
        AiInputBatchStatus.agent_running,
      ],
    }
    const conversationCount = await tx.aiInputBatch.count({
      where: { conversationId: params.conversationId, status: processingStatus },
    })
    if (conversationCount >= MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION) {
      throw new HttpException(
        '当前会话待处理的 AI 批次已达上限，请等待处理完成后再发送',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    const userCount = await tx.aiInputBatch.count({
      where: {
        organizationId: params.organizationId,
        creatorUserId: params.userId,
        status: processingStatus,
      },
    })
    if (userCount >= MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_USER) {
      throw new HttpException(
        '待处理的 AI 批次已达上限，请等待处理完成后再发送',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  private async findActiveBatch(conversationId: string): Promise<AiInputBatch | null> {
    return this.prisma.aiInputBatch.findFirst({
      where: {
        conversationId,
        status: {
          in: [
            AiInputBatchStatus.ready_for_agent,
            AiInputBatchStatus.agent_running,
            AiInputBatchStatus.waiting_for_materials,
            AiInputBatchStatus.awaiting_user_input,
            AiInputBatchStatus.awaiting_review,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  private async requireOwnedConversation(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
  ): Promise<AiConversation> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, taskId, organizationId },
    })
    if (!conversation) {
      throw new NotFoundException('AI 建团会话不存在')
    }
    if (conversation.creatorUserId !== userId) {
      throw new ForbiddenException('仅任务创建者可访问该 AI 建团会话')
    }
    return conversation
  }

  private async findOwnedInProgressTask(
    organizationId: string,
    userId: string,
    taskId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<TaskWithDraft> {
    const task = await tx.aiCreateTask.findFirst({
      where: { id: taskId, organizationId },
      include: TASK_INCLUDE,
    })
    if (!task || !task.draft) {
      throw new NotFoundException('AI 建团任务不存在')
    }
    if (task.creatorUserId !== userId) {
      throw new ForbiddenException('仅任务创建者可访问该 AI 建团任务')
    }
    if (task.status !== AiCreateTaskStatus.in_progress) {
      throw new BadRequestException('仅进行中的 AI 建团任务可使用 AI 辅助')
    }
    return task
  }

  private async assertAssistAccess(userId: string): Promise<void> {
    if (!isAiCreateAssistEnabledForUser(this.configService, userId)) {
      throw AiCollaborationHttpException.fromCode('PERMISSION_DENIED')
    }
    const permissionKeys = await this.authService.getPermissionKeysForUser(userId)
    if (!permissionKeys.includes('departure:write')) {
      throw AiCollaborationHttpException.fromCode('PERMISSION_DENIED')
    }
  }
}

function requestHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}
