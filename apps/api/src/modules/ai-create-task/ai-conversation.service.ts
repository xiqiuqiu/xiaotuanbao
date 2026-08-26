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
  AiConversationDraftView,
  AiConversationInteractionView,
  AiConversationView,
  AiCreateAssistTaskState,
  AiInputBatchView,
  ConversationHistoryItem,
  ConversationHistoryPage,
  SendAiConversationMessageResult,
} from '@xiaotuanbao/shared'
import {
  AiConversationEventKind,
  AiConversationInteractionStatus,
  AiConversationStatus,
  AiConversationTitleSource,
  AgentTaskStatus,
  AiAgentAttemptStatus,
  AiInputBatchStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  ConversationSourceStatus,
  InputBatchTaskRole,
  TaskActivityKind,
  type AgentTask,
  type AiConversation,
  type AiConversationEvent,
  type AiConversationInteraction,
  type AiCreateTask,
  type DepartureCreationDraft,
  type Prisma,
} from '@prisma/client'
import { Observable } from 'rxjs'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import { AiConversationEventHub } from './ai-conversation-event.hub'
import {
  ABANDON_BATCH_OPERATION,
  CANCEL_INTERACTION_OPERATION,
  CONVERSATION_EVENTS_PAGE_SIZE,
  CONVERSATION_HISTORY_MAX_PAGE_SIZE,
  CONVERSATION_HISTORY_PAGE_SIZE,
  CONVERSATION_SEARCH_MAX_CHARS,
  MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION,
  MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_USER,
  REMOVE_BATCH_MATERIALS_OPERATION,
  RETRY_FAILED_BATCH_OPERATION,
  RETRY_FAILED_MATERIALS_OPERATION,
  SEND_TASKLESS_TEXT_OPERATION,
  SEND_TEXT_OPERATION,
  STOP_BATCH_OPERATION,
  STOP_TASKLESS_RUN_OPERATION,
  nextSseCatchUpDelay,
  titleFromFirstUserMessage,
} from './ai-conversation.constants'
import {
  isFailedDependency,
  toBatchView,
  toConversationView,
  toConversationDraftView,
  toEventView,
  toFailedMaterialPayload,
  toInteractionView,
} from './ai-conversation.mapper'
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  toHistoryItem,
} from './conversation-history'
import {
  isReplyAttempt,
  requireCompleteReply,
  resolveReplyText,
  staleInteractionMessage,
  type ConversationReplyInput,
} from './ai-conversation.interaction'
import { isAiCreateAssistEnabledForUser } from './ai-create-assist-access'
import {
  lockAiCreateSender,
  lockAiCreateTask,
  lockConversationRuntime,
} from './ai-create-task.lock'
import {
  agentBatchJobKey,
  materialProgressFromDeps,
} from './departure-material.constants'
import {
  DepartureMaterialService,
  materialFileKey,
  type IncomingMaterialFile,
} from './departure-material.service'
import { PageLocatorResolver } from './page-locator.resolver'

const TASK_INCLUDE = {
  draft: true,
  agentTask: true,
} satisfies Prisma.AiCreateTaskInclude

const BATCH_MATERIAL_INCLUDE = {
  taskLinks: true,
  sources: {
    include: {
      source: {
        include: {
          parseRuns: { orderBy: { resultVersion: 'desc' as const }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.AiInputBatchInclude

type TaskWithDraft = AiCreateTask & {
  draft: DepartureCreationDraft | null
  agentTask: AgentTask
}
type BatchWithMaterials = Prisma.AiInputBatchGetPayload<{
  include: typeof BATCH_MATERIAL_INCLUDE
}>

function primaryTaskId(batch: BatchWithMaterials): string | null {
  return batch.taskLinks.find((link) => link.role === InputBatchTaskRole.primary)?.taskId ?? null
}

@Injectable()
export class AiConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly eventHub: AiConversationEventHub,
    private readonly materialService: DepartureMaterialService,
    private readonly pageLocatorResolver: PageLocatorResolver,
  ) {}

  async openOrResume(
    organizationId: string,
    userId: string,
    taskId: string,
    preferredConversationId?: string,
  ): Promise<AiConversationView> {
    await this.assertAssistAccess(userId)
    const task = await this.findOwnedInProgressTask(organizationId, userId, taskId)
    const conversation = await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, organizationId, task.id)
      if (preferredConversationId) {
        await lockConversationRuntime(tx, organizationId, preferredConversationId)
        const preferred = await tx.aiConversation.findFirst({
          where: { id: preferredConversationId, organizationId },
        })
        if (!preferred) {
          throw new NotFoundException('会话不存在')
        }
        if (preferred.creatorUserId !== userId) {
          throw new ForbiddenException('仅会话所有者可在该会话创建任务')
        }
        if (preferred.status !== AiConversationStatus.open) {
          throw new BadRequestException('仅开放会话可创建任务')
        }
        await tx.conversationTaskLink.upsert({
          where: {
            conversationId_taskId: {
              conversationId: preferred.id,
              taskId: task.id,
            },
          },
          create: {
            organizationId,
            conversationId: preferred.id,
            taskId: task.id,
            linkedByUserId: userId,
            linkReason: 'created',
            metadata: { source: 'departure_assist_session' },
          },
          update: {},
        })
        return preferred
      }
      const existing = await tx.aiConversation.findFirst({
        where: {
          organizationId,
          taskLinks: { some: { taskId: task.id } },
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
          creatorUserId: userId,
          taskLinks: {
            create: {
              organizationId,
              taskId: task.id,
              linkedByUserId: userId,
              linkReason: 'created',
              metadata: { source: 'departure_assist_session' },
            },
          },
        },
      })
    })
    return this.loadConversationView(conversation, userId)
  }

  async sendTasklessText(
    organizationId: string,
    userId: string,
    conversationId: string | undefined,
    text: string,
    idempotencyKey: string | undefined,
    reply: ConversationReplyInput = {},
    files: IncomingMaterialFile[] = [],
    pageLocatorInput?: unknown,
  ): Promise<SendAiConversationMessageResult> {
    const key = requireIdempotencyKey(idempotencyKey)
    const attachments = dedupeFiles(this.materialService.validateIncomingFiles(files))
    const trimmed = text.trim() || (attachments.length > 0 ? '请根据附件回答。' : '')
    const resolvedPage = await this.pageLocatorResolver.resolve(
      organizationId,
      userId,
      pageLocatorInput,
    )
    if (isReplyAttempt(reply)) {
      if (!conversationId) {
        throw new BadRequestException('回答追问必须指定会话')
      }
      requireCompleteReply(reply)
    }
    if (!trimmed && attachments.length === 0 && !reply.selectedOptionId) {
      throw new BadRequestException('消息不能为空')
    }
    const hash = requestHash({
      conversationId: conversationId ?? null,
      text: trimmed,
      replyToEventId: reply.replyToEventId ?? null,
      interactionId: reply.interactionId ?? null,
      interactionVersion: reply.interactionVersion ?? null,
      selectedOptionId: reply.selectedOptionId ?? null,
      pageLocator: resolvedPage?.locator ?? null,
      attachments: attachments.map((file) => ({
        filename: file.originalname,
        contentType: (file.mimetype ?? '').toLowerCase(),
        sizeBytes: file.buffer.byteLength,
        sha256: this.materialService.sha256(file.buffer),
      })),
    })
    const existingRecord = await this.prisma.aiCreateIdempotencyRecord.findUnique({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId,
          operation: SEND_TASKLESS_TEXT_OPERATION,
          idempotencyKey: key,
        },
      },
    })
    if (
      existingRecord?.completedAt &&
      existingRecord.resultJson &&
      existingRecord.requestHash === hash &&
      existingRecord.taskId == null
    ) {
      return existingRecord.resultJson as unknown as SendAiConversationMessageResult
    }

    const prepared = await this.materialService.prepareUploads({
      organizationId,
      userId,
      conversationId,
      files: attachments,
    })
    const published: AiConversationEventView[] = []
    const consumedStoredObjectIds = new Set<string>()
    let committed = false
    try {
    const result = await this.prisma.$transaction(async (tx) => {
      let conversation: AiConversation
      if (conversationId) {
        await lockConversationRuntime(tx, organizationId, conversationId)
        await lockAiCreateSender(tx, organizationId, userId)
        conversation = await this.requireOwnedUserConversation(
          tx,
          organizationId,
          userId,
          conversationId,
        )
        if (conversation.status !== AiConversationStatus.open) {
          throw new BadRequestException('仅未完成的会话可发送消息')
        }
      } else {
        await lockAiCreateSender(tx, organizationId, userId)
        conversation = await tx.aiConversation.create({
          data: {
            organizationId,
            creatorUserId: userId,
            title: titleFromFirstUserMessage(trimmed),
            titleSource: AiConversationTitleSource.first_message,
            lastActivityAt: new Date(),
          },
        })
        await lockConversationRuntime(tx, organizationId, conversation.id)
      }

      const record = await tx.aiCreateIdempotencyRecord.upsert({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId,
            operation: SEND_TASKLESS_TEXT_OPERATION,
            idempotencyKey: key,
          },
        },
        create: {
          organizationId,
          operation: SEND_TASKLESS_TEXT_OPERATION,
          idempotencyKey: key,
          requestHash: hash,
        },
        update: {},
      })
      if (record.taskId != null) {
        throw new ConflictException('幂等键已被其他任务使用')
      }
      if (record.requestHash !== hash) {
        throw new ConflictException('幂等键已用于不同的发送内容')
      }
      if (record.completedAt && record.resultJson) {
        return record.resultJson as unknown as SendAiConversationMessageResult
      }

      const answering = isReplyAttempt(reply)
      if (!answering) {
        await this.assertProcessingBatchCapacity(tx, {
          organizationId,
          userId,
          conversationId: conversation.id,
        })
      }
      const replyResult = answering
        ? await this.consumeInteractionReply(tx, {
            organizationId,
            conversationId: conversation.id,
            text: trimmed,
            reply,
          })
        : null
      const messageText = replyResult?.text ?? trimmed
      const queued = !replyResult && (await this.hasBlockingBatch(tx, conversation.id))
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
          payload: {
            text: messageText,
            ...(attachments.length > 0
              ? {
                  attachments: attachments.map((file) => ({
                    filename: file.originalname,
                    contentType: (file.mimetype ?? '').toLowerCase(),
                    sizeBytes: file.buffer.byteLength,
                  })),
                }
              : {}),
            ...(replyResult
              ? {
                  replyToEventId: replyResult.replyToEventId,
                  interactionId: replyResult.interactionId,
                  selectedOptionId: replyResult.selectedOptionId ?? null,
                }
              : {}),
          },
        },
      })
      const archived = []
      for (const file of attachments) {
        const item = await this.materialService.archiveForConversation(tx, {
          organizationId,
          userId,
          conversationId: conversation.id,
          file,
          stored: prepared.storedByFileKey.get(materialFileKey(file)),
        })
        if (item.consumedStoredObjectId) {
          consumedStoredObjectIds.add(item.consumedStoredObjectId)
        }
        archived.push(item)
      }
      const waitingForMaterials = archived.some((item) => item.parseVersion == null)
      const batchStatus = waitingForMaterials
        ? AiInputBatchStatus.waiting_for_materials
        : AiInputBatchStatus.ready_for_agent
      const batch = await tx.aiInputBatch.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          creatorUserId: userId,
          userMessageEventId: userEvent.id,
          replyToEventId: replyResult?.replyToEventId,
          conversationVersion: userSequence,
          status: batchStatus,
          pageLocator: resolvedPage
            ? (JSON.parse(JSON.stringify(resolvedPage.locator)) as Prisma.InputJsonValue)
            : undefined,
          sources: {
            create: archived.map((item) => ({
              organizationId,
              sourceId: item.source.id,
              required: true,
              parseVersion: item.parseVersion,
              contentDigest: item.contentDigest,
              locator: {
                kind: item.source.kind,
                storedObjectId: item.source.storedObjectId,
                sha256: item.source.sha256,
              },
            })),
          },
        },
        include: BATCH_MATERIAL_INCLUDE,
      })
      for (const item of archived) {
        if (item.needsParseJob) {
          if (item.source.status === ConversationSourceStatus.failed) {
            await this.materialService.startNewParseRun(tx, {
              organizationId,
              sourceId: item.source.id,
            })
          }
          await this.materialService.enqueueParseJob(tx, {
            organizationId,
            conversationId: conversation.id,
            inputBatchId: batch.id,
            sourceId: item.source.id,
          })
        }
      }
      if (batchStatus === AiInputBatchStatus.ready_for_agent) {
        await tx.aiWorkflowJob.create({
          data: {
            organizationId,
            conversationId: conversation.id,
            inputBatchId: batch.id,
            type: AiWorkflowJobType.agent_batch,
            jobKey: agentBatchJobKey(batch.id),
            status: AiWorkflowJobStatus.pending,
          },
        })
      }
      const snapshot = await this.loadBatch(tx, batch.id)
      const progress = progressOf(snapshot)
      const statusEvent = await tx.aiConversationEvent.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          sequence: statusSequence,
          kind: AiConversationEventKind.batch_status,
          payload: {
            batchId: batch.id,
            status: batchStatus,
            queued,
            readyCount: progress.ready,
            totalCount: progress.total,
            failedCount: progress.failed,
          },
        },
      })
      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { lastActivityAt: new Date(), updatedAt: new Date() },
      })
      const conversationDraft = answering
        ? await tx.aiConversationDraft.findUnique({
            where: { conversationId_userId: { conversationId: conversation.id, userId } },
          })
        : await tx.aiConversationDraft.upsert({
            where: { conversationId_userId: { conversationId: conversation.id, userId } },
            create: {
              organizationId,
              conversationId: conversation.id,
              userId,
              text: '',
              draftEpoch: 1,
              revision: 1,
            },
            update: {
              text: '',
              draftEpoch: { increment: 1 },
              revision: { increment: 1 },
            },
          })
      const events = [
        ...(replyResult?.events ?? []).map(toEventView),
        toEventView(userEvent),
        toEventView(statusEvent),
      ]
      const payload: SendAiConversationMessageResult = {
        conversationId: conversation.id,
        batch: toBatchView(snapshot, { queued }),
        events,
        lastSequence: statusSequence,
        draft: toConversationDraftView(conversation.id, conversationDraft),
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
    committed = true
    await this.materialService.discardStoredObjects(
      organizationId,
      prepared.uploadedIds.filter((id) => !consumedStoredObjectIds.has(id)),
    )
    for (const event of published) {
      this.eventHub.publish(result.conversationId, event)
    }
    return result
    } catch (error) {
      if (!committed) {
        await this.materialService.discardStoredObjects(organizationId, prepared.uploadedIds)
      }
      throw error
    }
  }

  async stopTasklessRun(
    organizationId: string,
    userId: string,
    conversationId: string,
    idempotencyKey: string | undefined,
  ): Promise<SendAiConversationMessageResult> {
    const key = requireIdempotencyKey(idempotencyKey)
    const hash = requestHash({ conversationId })
    const existingRecord = await this.prisma.aiCreateIdempotencyRecord.findUnique({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId,
          operation: STOP_TASKLESS_RUN_OPERATION,
          idempotencyKey: key,
        },
      },
    })
    if (
      existingRecord?.completedAt &&
      existingRecord.resultJson &&
      existingRecord.requestHash === hash &&
      existingRecord.taskId == null
    ) {
      return existingRecord.resultJson as unknown as SendAiConversationMessageResult
    }

    const published: AiConversationEventView[] = []
    const result = await this.prisma.$transaction(async (tx) => {
      await lockConversationRuntime(tx, organizationId, conversationId)
      const conversation = await this.requireOwnedUserConversation(
        tx,
        organizationId,
        userId,
        conversationId,
      )
      const record = await tx.aiCreateIdempotencyRecord.upsert({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId,
            operation: STOP_TASKLESS_RUN_OPERATION,
            idempotencyKey: key,
          },
        },
        create: {
          organizationId,
          operation: STOP_TASKLESS_RUN_OPERATION,
          idempotencyKey: key,
          requestHash: hash,
        },
        update: {},
      })
      if (record.taskId != null) {
        throw new ConflictException('幂等键已被其他任务使用')
      }
      if (record.requestHash !== hash) {
        throw new ConflictException('幂等键已用于不同的请求内容')
      }
      if (record.completedAt && record.resultJson) {
        return record.resultJson as unknown as SendAiConversationMessageResult
      }

      const batch = await this.findStoppableBatch(tx, conversation.id)
      if (!batch) {
        throw new ConflictException('当前没有可停止的运行')
      }
      const mutated = await this.cancelRunningBatch(tx, batch, 'user_stop')
      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { lastActivityAt: new Date(), updatedAt: new Date() },
      })
      const last = await tx.aiConversationEvent.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { sequence: 'desc' },
      })
      const payload: SendAiConversationMessageResult = {
        conversationId: conversation.id,
        batch: toBatchView(mutated.batch),
        events: mutated.events.map(toEventView),
        lastSequence: last?.sequence ?? 0,
      }
      await tx.aiCreateIdempotencyRecord.update({
        where: { id: record.id },
        data: {
          resultJson: payload as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      })
      published.push(...payload.events)
      return payload
    })
    for (const event of published) {
      this.eventHub.publish(conversationId, event)
    }
    return result
  }

  async getTasklessConversation(
    organizationId: string,
    userId: string,
    conversationId: string,
  ): Promise<AiConversationView> {
    const conversation = await this.requireOwnedUserConversation(
      this.prisma,
      organizationId,
      userId,
      conversationId,
    )
    return this.loadConversationView(conversation, userId)
  }

  async listOwnedConversations(
    organizationId: string,
    userId: string,
    query: {
      q?: string
      includeArchived?: boolean
      cursor?: string
      limit?: number
    },
  ): Promise<ConversationHistoryPage> {
    const now = new Date()
    const limit = Math.min(
      Math.max(query.limit ?? CONVERSATION_HISTORY_PAGE_SIZE, 1),
      CONVERSATION_HISTORY_MAX_PAGE_SIZE,
    )
    const search = query.q?.trim().slice(0, CONVERSATION_SEARCH_MAX_CHARS)
    const cursor = query.cursor ? decodeHistoryCursor(query.cursor) : null
    if (query.cursor && !cursor) {
      throw new BadRequestException('历史会话游标无效')
    }
    const filters: Prisma.AiConversationWhereInput[] = [
      { organizationId },
      { creatorUserId: userId },
      query.includeArchived
        ? { status: { in: [AiConversationStatus.open, AiConversationStatus.archived] } }
        : { status: AiConversationStatus.open },
    ]
    if (search) {
      filters.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          {
            events: {
              some: {
                kind: AiConversationEventKind.user_message,
                payload: {
                  path: ['text'],
                  string_contains: search,
                },
              },
            },
          },
        ],
      })
    }
    if (cursor) {
      filters.push({
        OR: [
          { lastActivityAt: { lt: cursor.lastActivityAt } },
          {
            lastActivityAt: cursor.lastActivityAt,
            id: { lt: cursor.id },
          },
        ],
      })
    }
    const rows = await this.prisma.aiConversation.findMany({
      where: { AND: filters },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        title: true,
        status: true,
        lastActivityAt: true,
      },
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    return {
      items: page.map((row) => toHistoryItem(row, now)),
      nextCursor: hasMore && last ? encodeHistoryCursor(last.lastActivityAt, last.id) : null,
    }
  }

  async archiveOwnedConversation(
    organizationId: string,
    userId: string,
    conversationId: string,
  ): Promise<ConversationHistoryItem> {
    return this.setOwnedConversationLifecycle(
      organizationId,
      userId,
      conversationId,
      AiConversationStatus.archived,
    )
  }

  async unarchiveOwnedConversation(
    organizationId: string,
    userId: string,
    conversationId: string,
  ): Promise<ConversationHistoryItem> {
    return this.setOwnedConversationLifecycle(
      organizationId,
      userId,
      conversationId,
      AiConversationStatus.open,
    )
  }

  private async setOwnedConversationLifecycle(
    organizationId: string,
    userId: string,
    conversationId: string,
    status: typeof AiConversationStatus.archived | typeof AiConversationStatus.open,
  ): Promise<ConversationHistoryItem> {
    const conversation = await this.prisma.$transaction(async (tx) => {
      await lockConversationRuntime(tx, organizationId, conversationId)
      const owned = await this.requireOwnedUserConversation(
        tx,
        organizationId,
        userId,
        conversationId,
      )
      if (
        owned.status !== AiConversationStatus.open &&
        owned.status !== AiConversationStatus.archived
      ) {
        throw new BadRequestException('仅开放或已归档会话可调整归档状态')
      }
      if (owned.status === status) {
        return owned
      }
      return tx.aiConversation.update({
        where: { id: owned.id },
        data: { status },
      })
    })
    return toHistoryItem(conversation, new Date())
  }

  async listTasklessEvents(
    organizationId: string,
    userId: string,
    conversationId: string,
    afterSequence = 0,
  ) {
    const conversation = await this.requireOwnedUserConversation(
      this.prisma,
      organizationId,
      userId,
      conversationId,
    )
    const events = await this.prisma.aiConversationEvent.findMany({
      where: {
        conversationId: conversation.id,
        sequence: { gt: afterSequence },
      },
      orderBy: { sequence: 'asc' },
      take: CONVERSATION_EVENTS_PAGE_SIZE,
    })
    const last = await this.prisma.aiConversationEvent.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { sequence: 'desc' },
    })
    const projection = await this.loadBatchProjection(conversation.id)
    const draft = await this.prisma.aiConversationDraft.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId } },
    })
    return {
      conversationId: conversation.id,
      events: events.map(toEventView),
      lastSequence: last?.sequence ?? 0,
      ...projection,
      draft: toConversationDraftView(conversation.id, draft),
    }
  }

  async saveTasklessDraft(
    organizationId: string,
    userId: string,
    conversationId: string,
    text: string,
    draftEpoch: number,
  ): Promise<AiConversationDraftView> {
    return this.prisma.$transaction(async (tx) => {
      await lockConversationRuntime(tx, organizationId, conversationId)
      await lockAiCreateSender(tx, organizationId, userId)
      await this.requireOwnedUserConversation(tx, organizationId, userId, conversationId)
      return this.upsertConversationDraft(tx, {
        organizationId,
        userId,
        conversationId,
        text,
        draftEpoch,
      })
    })
  }

  async saveDraft(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    text: string,
    draftEpoch: number,
  ): Promise<AiConversationDraftView> {
    await this.assertAssistAccess(userId)
    return this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, organizationId, taskId)
      await lockAiCreateSender(tx, organizationId, userId)
      await this.findOwnedInProgressTask(organizationId, userId, taskId, tx)
      const conversation = await tx.aiConversation.findFirst({
        where: { id: conversationId, organizationId, taskLinks: { some: { taskId } } },
      })
      if (!conversation) {
        throw new NotFoundException('AI 建团会话不存在')
      }
      if (conversation.creatorUserId !== userId) {
        throw new ForbiddenException('仅任务创建者可访问该 AI 建团会话')
      }
      return this.upsertConversationDraft(tx, {
        organizationId,
        userId,
        conversationId,
        text,
        draftEpoch,
      })
    })
  }

  private async upsertConversationDraft(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      userId: string
      conversationId: string
      text: string
      draftEpoch: number
    },
  ): Promise<AiConversationDraftView> {
    const current = await tx.aiConversationDraft.findUnique({
      where: {
        conversationId_userId: {
          conversationId: params.conversationId,
          userId: params.userId,
        },
      },
    })
    if ((current?.draftEpoch ?? 0) !== params.draftEpoch) {
      throw new ConflictException({
        code: 'AI_DRAFT_EPOCH_STALE',
        message: '草稿已随发送推进，请同步最新草稿后重试',
      })
    }
    const saved = current
      ? await tx.aiConversationDraft.update({
          where: { id: current.id },
          data: { text: params.text, revision: { increment: 1 } },
        })
      : await tx.aiConversationDraft.create({
          data: {
            organizationId: params.organizationId,
            conversationId: params.conversationId,
            userId: params.userId,
            text: params.text,
            draftEpoch: params.draftEpoch,
            revision: 1,
          },
        })
    return toConversationDraftView(params.conversationId, saved)
  }

  async getTaskEntryState(
    organizationId: string,
    userId: string,
    taskId: string,
  ): Promise<AiCreateAssistTaskState> {
    await this.assertAssistAccess(userId)
    await this.findOwnedInProgressTask(organizationId, userId, taskId)
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { organizationId, creatorUserId: userId, taskLinks: { some: { taskId } }, status: AiConversationStatus.open },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    if (!conversation) return { status: 'idle' }
    const projection = await this.loadBatchProjection(conversation.id)
    const latestTerminal = projection.activeBatch
      ? null
      : await this.prisma.aiInputBatch.findFirst({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'desc' },
          select: { status: true },
        })
    const status = projection.activeBatch?.status ?? latestTerminal?.status
    if (status === AiInputBatchStatus.waiting_for_materials) return { status: 'parsing' }
    if (status === AiInputBatchStatus.ready_for_agent || status === AiInputBatchStatus.preparing_context || status === AiInputBatchStatus.agent_running) {
      return { status: 'ai_processing' }
    }
    if (status === AiInputBatchStatus.awaiting_user_input) return { status: 'awaiting_user_input' }
    if (status === AiInputBatchStatus.awaiting_review) return { status: 'awaiting_review' }
    if (status === AiInputBatchStatus.failed) return { status: 'failed' }
    return { status: 'idle' }
  }

  async sendText(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    text: string,
    idempotencyKey: string | undefined,
    files: IncomingMaterialFile[] = [],
    reply: ConversationReplyInput = {},
  ): Promise<SendAiConversationMessageResult> {
    await this.assertAssistAccess(userId)
    const key = idempotencyKey?.trim()
    if (!key) {
      throw new BadRequestException('发送消息必须提供 Idempotency-Key 幂等键')
    }
    if (key.length > 200) {
      throw new BadRequestException('幂等键长度不能超过 200 个字符')
    }
    const attachments = dedupeFiles(this.materialService.validateIncomingFiles(files))
    const trimmed = text.trim() || (attachments.length > 0 ? '请根据附件整理发团资料。' : '')
    if (!trimmed && attachments.length === 0 && !reply.selectedOptionId) {
      throw new BadRequestException('消息不能为空')
    }
    if (isReplyAttempt(reply)) {
      requireCompleteReply(reply)
    }

    const hash = requestHash({
      taskId,
      conversationId,
      text: trimmed,
      replyToEventId: reply.replyToEventId ?? null,
      interactionId: reply.interactionId ?? null,
      interactionVersion: reply.interactionVersion ?? null,
      selectedOptionId: reply.selectedOptionId ?? null,
      attachments: attachments.map((file) => ({
        filename: file.originalname,
        contentType: (file.mimetype ?? '').toLowerCase(),
        sizeBytes: file.buffer.byteLength,
        sha256: this.materialService.sha256(file.buffer),
      })),
    })
    const published: AiConversationEventView[] = []
    const consumedStoredObjectIds = new Set<string>()
    const existingRecord = await this.prisma.aiCreateIdempotencyRecord.findUnique({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId,
          operation: SEND_TEXT_OPERATION,
          idempotencyKey: key,
        },
      },
    })
    if (
      existingRecord?.completedAt &&
      existingRecord.resultJson &&
      existingRecord.requestHash === hash &&
      existingRecord.taskId === taskId
    ) {
      return existingRecord.resultJson as unknown as SendAiConversationMessageResult
    }

    const prepared = await this.materialService.prepareUploads({
      organizationId,
      userId,
      conversationId,
      files: attachments,
    })

    let committed = false
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await lockConversationRuntime(tx, organizationId, conversationId)
        await lockAiCreateSender(tx, organizationId, userId)
        const task = await this.findOwnedInProgressTask(organizationId, userId, taskId, tx)
        const conversation = await tx.aiConversation.findFirst({
          where: { id: conversationId, organizationId, taskLinks: { some: { taskId: task.id } } },
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

        const answering = isReplyAttempt(reply)
        if (!answering) {
          await this.assertProcessingBatchCapacity(tx, {
            organizationId,
            userId,
            conversationId: conversation.id,
          })
        }

        const replyResult = answering
          ? await this.consumeInteractionReply(tx, {
              organizationId,
              conversationId: conversation.id,
              text: trimmed,
              reply,
            })
          : null
        const messageText = replyResult?.text ?? trimmed

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
            payload: {
              text: messageText,
              attachments: attachments.map((file) => ({
                filename: file.originalname,
                contentType: (file.mimetype ?? '').toLowerCase(),
                sizeBytes: file.buffer.byteLength,
              })),
              ...(replyResult
                ? {
                    replyToEventId: replyResult.replyToEventId,
                    interactionId: replyResult.interactionId,
                    selectedOptionId: replyResult.selectedOptionId ?? null,
                  }
                : {}),
            },
          },
        })

        const archived = []
        for (const file of attachments) {
          const item = await this.materialService.archiveForConversation(tx, {
            organizationId,
            userId,
            conversationId: conversation.id,
            file,
            stored: prepared.storedByFileKey.get(materialFileKey(file)),
          })
          if (item.consumedStoredObjectId) {
            consumedStoredObjectIds.add(item.consumedStoredObjectId)
          }
          archived.push(item)
        }
        const waitingForMaterials = archived.some((item) => item.parseVersion == null)
        const batchStatus = waitingForMaterials
          ? AiInputBatchStatus.waiting_for_materials
          : AiInputBatchStatus.ready_for_agent

        const queued = !replyResult && (await this.hasBlockingBatch(tx, conversation.id))
        const batch = await tx.aiInputBatch.create({
          data: {
            organizationId,
            conversationId: conversation.id,
            creatorUserId: userId,
            userMessageEventId: userEvent.id,
            replyToEventId: replyResult?.replyToEventId,
            conversationVersion: userSequence,
            status: batchStatus,
            taskLinks: {
              create: {
                organizationId,
                taskId: task.id,
                role: InputBatchTaskRole.primary,
              },
            },
            sources: {
              create: archived.map((item) => ({
                organizationId,
                sourceId: item.source.id,
                required: true,
                parseVersion: item.parseVersion,
                contentDigest: item.contentDigest,
                locator: {
                  kind: item.source.kind,
                  storedObjectId: item.source.storedObjectId,
                  sha256: item.source.sha256,
                },
              })),
            },
          },
          include: BATCH_MATERIAL_INCLUDE,
        })
        if (task.agentTask.status === AgentTaskStatus.waiting) {
          await tx.agentTask.update({
            where: { id: task.id },
            data: {
              status: AgentTaskStatus.active,
              statusVersion: { increment: 1 },
            },
          })
        }
        await tx.taskActivity.create({
          data: {
            organizationId,
            taskId: task.id,
            actorUserId: userId,
            kind: TaskActivityKind.progress,
            summary:
              task.agentTask.status === AgentTaskStatus.waiting
                ? 'User 已继续推进任务'
                : 'User 已提交新一轮任务输入',
            payload: { inputBatchId: batch.id },
          },
        })

        for (const item of archived) {
          if (item.needsParseJob) {
            if (item.source.status === ConversationSourceStatus.failed) {
              await this.materialService.startNewParseRun(tx, {
                organizationId,
                sourceId: item.source.id,
              })
            }
            await this.materialService.enqueueParseJob(tx, {
              organizationId,
              taskId: task.id,
              conversationId: conversation.id,
              inputBatchId: batch.id,
              sourceId: item.source.id,
            })
          }
        }

        const snapshot = await this.loadBatch(tx, batch.id)
        const progress = progressOf(snapshot)
        const statusEvent = await tx.aiConversationEvent.create({
          data: {
            organizationId,
            conversationId: conversation.id,
            sequence: statusSequence,
            kind: AiConversationEventKind.batch_status,
            payload: {
              batchId: batch.id,
              status: batchStatus,
              queued,
              readyCount: progress.ready,
              totalCount: progress.total,
              failedCount: progress.failed,
            },
          },
        })

        if (batchStatus === AiInputBatchStatus.ready_for_agent) {
          await tx.aiWorkflowJob.create({
            data: {
              organizationId,
              taskId: task.id,
              conversationId: conversation.id,
              inputBatchId: batch.id,
              type: AiWorkflowJobType.agent_batch,
              jobKey: agentBatchJobKey(batch.id),
              status: AiWorkflowJobStatus.pending,
            },
          })
        }

        await tx.aiConversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        })

        const conversationDraft = answering
          ? await tx.aiConversationDraft.findUnique({
              where: { conversationId_userId: { conversationId: conversation.id, userId } },
            })
          : await tx.aiConversationDraft.upsert({
              where: { conversationId_userId: { conversationId: conversation.id, userId } },
              create: {
                organizationId,
                conversationId: conversation.id,
                userId,
                text: '',
                draftEpoch: 1,
                revision: 1,
              },
              update: {
                text: '',
                draftEpoch: { increment: 1 },
                revision: { increment: 1 },
              },
            })

        const events = [
          ...(replyResult?.events ?? []).map(toEventView),
          toEventView(userEvent),
          toEventView(statusEvent),
        ]
        const payload: SendAiConversationMessageResult = {
          conversationId: conversation.id,
          batch: toBatchView(snapshot, { queued }),
          events,
          lastSequence: statusSequence,
          draft: toConversationDraftView(conversation.id, conversationDraft),
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
      committed = true
      await this.materialService.discardStoredObjects(
        organizationId,
        prepared.uploadedIds.filter((id) => !consumedStoredObjectIds.has(id)),
      )

      for (const event of published) {
        this.eventHub.publish(conversationId, event)
      }
      return result
    } catch (error) {
      if (!committed) {
        await this.materialService.discardStoredObjects(organizationId, prepared.uploadedIds)
      }
      throw error
    }
  }

  async retryFailedMaterials(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    batchId: string,
    materialIds: string[] | undefined,
    idempotencyKey: string | undefined,
  ): Promise<SendAiConversationMessageResult> {
    return this.runBatchCommand({
      organizationId,
      userId,
      taskId,
      conversationId,
      batchId,
      operation: RETRY_FAILED_MATERIALS_OPERATION,
      idempotencyKey,
      request: { materialIds: materialIds?.slice().sort() ?? null },
      mutate: async (tx, batch) => {
        this.assertWaitingBatch(batch)
        const requested = new Set(materialIds ?? [])
        const failed = batch.sources.filter((item) => {
          if (!isFailedDependency(item)) {
            return false
          }
          return requested.size === 0 || requested.has(item.sourceId)
        })
        if (materialIds && materialIds.length > 0 && failed.length === 0) {
          const known = new Set(batch.sources.map((item) => item.sourceId))
          if (materialIds.some((id) => !known.has(id))) {
            throw new NotFoundException('批次中不存在指定资料依赖')
          }
        }
        for (const item of failed) {
          await this.materialService.startNewParseRun(tx, {
            organizationId,
            sourceId: item.sourceId,
          })
          await this.materialService.enqueueParseJob(tx, {
            organizationId,
            taskId,
            conversationId: batch.conversationId,
            inputBatchId: batch.id,
            sourceId: item.sourceId,
          })
        }
        const reloaded = await this.loadBatch(tx, batch.id)
        const progress = progressOf(reloaded)
        const statusEvent = await this.appendEvent(tx, {
          organizationId,
          conversationId: batch.conversationId,
          kind: AiConversationEventKind.batch_status,
          payload: {
            batchId: batch.id,
            status: AiInputBatchStatus.waiting_for_materials,
            readyCount: progress.ready,
            totalCount: progress.total,
            failedCount: progress.failed,
            failedMaterials: toFailedMaterialPayload(reloaded.sources),
          },
        })
        return { batch: reloaded, events: [statusEvent] }
      },
    })
  }

  async removeMaterials(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    batchId: string,
    materialIds: string[],
    idempotencyKey: string | undefined,
  ): Promise<SendAiConversationMessageResult> {
    return this.runBatchCommand({
      organizationId,
      userId,
      taskId,
      conversationId,
      batchId,
      operation: REMOVE_BATCH_MATERIALS_OPERATION,
      idempotencyKey,
      request: { materialIds: materialIds.slice().sort() },
      mutate: async (tx, batch) => {
        this.assertWaitingBatch(batch)
        const toRemove: string[] = []
        for (const id of materialIds) {
          const dep = batch.sources.find((item) => item.sourceId === id)
          if (dep) {
            if (!isFailedDependency(dep)) {
              throw new ConflictException('只能移除解析失败的资料依赖')
            }
            toRemove.push(id)
            continue
          }
          const archived = await tx.conversationSource.findFirst({
            where: {
              id,
              conversationId: batch.conversationId,
              organizationId: batch.organizationId,
            },
            select: { id: true },
          })
          if (!archived) {
            throw new NotFoundException('会话来源不存在')
          }
        }
        if (toRemove.length > 0) {
          await tx.inputBatchSource.deleteMany({
            where: { inputBatchId: batch.id, sourceId: { in: toRemove } },
          })
        }
        const published = await this.tryPromoteBatch(tx, batch.id)
        const reloaded = await this.loadBatch(tx, batch.id)
        const events = []
        for (const item of published) {
          events.push(await tx.aiConversationEvent.findUniqueOrThrow({ where: { id: item.eventId } }))
        }
        if (events.length === 0) {
          const progress = progressOf(reloaded)
          events.push(
            await this.appendEvent(tx, {
              organizationId,
              conversationId: batch.conversationId,
              kind: AiConversationEventKind.batch_status,
              payload: {
                batchId: batch.id,
                status: reloaded.status,
                readyCount: progress.ready,
                totalCount: progress.total,
                failedCount: progress.failed,
              },
            }),
          )
        }
        return { batch: reloaded, events }
      },
    })
  }

  async abandonBatch(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    batchId: string,
    idempotencyKey: string | undefined,
  ): Promise<SendAiConversationMessageResult> {
    return this.runBatchCommand({
      organizationId,
      userId,
      taskId,
      conversationId,
      batchId,
      operation: ABANDON_BATCH_OPERATION,
      idempotencyKey,
      request: { batchId },
      mutate: async (tx, batch) => {
        if (batch.status === AiInputBatchStatus.cancelled) {
          return { batch, events: [] }
        }
        this.assertWaitingBatch(batch)
        const updated = await tx.aiInputBatch.update({
          where: { id: batch.id },
          data: { status: AiInputBatchStatus.cancelled },
          include: BATCH_MATERIAL_INCLUDE,
        })
        await tx.agentTask.updateMany({
          where: { id: taskId, status: AgentTaskStatus.waiting },
          data: { status: AgentTaskStatus.active, statusVersion: { increment: 1 } },
        })
        await tx.taskActivity.create({
          data: {
            organizationId,
            taskId,
            actorUserId: userId,
            kind: TaskActivityKind.progress,
            summary: 'User 已放弃指定批次',
            payload: { inputBatchId: batch.id },
          },
        })
        const statusEvent = await this.appendEvent(tx, {
          organizationId,
          conversationId: batch.conversationId,
          kind: AiConversationEventKind.batch_status,
          payload: { batchId: batch.id, status: AiInputBatchStatus.cancelled },
        })
        return { batch: updated, events: [statusEvent] }
      },
    })
  }

  async stopBatch(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    batchId: string,
    idempotencyKey: string | undefined,
  ): Promise<SendAiConversationMessageResult> {
    return this.runBatchCommand({
      organizationId,
      userId,
      taskId,
      conversationId,
      batchId,
      operation: STOP_BATCH_OPERATION,
      idempotencyKey,
      request: { batchId },
      mutate: async (tx, batch) => {
        if (batch.status === AiInputBatchStatus.cancelled) {
          return { batch, events: [] }
        }
        if (
          batch.status !== AiInputBatchStatus.ready_for_agent &&
          batch.status !== AiInputBatchStatus.preparing_context &&
          batch.status !== AiInputBatchStatus.agent_running &&
          batch.status !== AiInputBatchStatus.awaiting_user_input
        ) {
          throw new ConflictException('仅可停止尚未结束的 Agent 处理；等待资料时请放弃本批')
        }
        await tx.aiWorkflowJob.updateMany({
          where: {
            inputBatchId: batch.id,
            type: AiWorkflowJobType.agent_batch,
            status: { in: [AiWorkflowJobStatus.pending, AiWorkflowJobStatus.claimed] },
          },
          data: {
            status: AiWorkflowJobStatus.failed,
            lastErrorCode: 'BATCH_CANCELLED',
            leaseExpiresAt: null,
            generation: { increment: 1 },
          },
        })
        const runningAttempt = await tx.aiAgentAttempt.findFirst({
          where: { inputBatchId: batch.id, status: AiAgentAttemptStatus.running },
          orderBy: { startedAt: 'desc' },
        })
        await tx.aiAgentAttempt.updateMany({
          where: { inputBatchId: batch.id, status: AiAgentAttemptStatus.running },
          data: {
            status: AiAgentAttemptStatus.failed,
            errorCode: 'BATCH_CANCELLED',
            endedAt: new Date(),
          },
        })
        await tx.aiConversationInteraction.updateMany({
          where: {
            inputBatchId: batch.id,
            status: AiConversationInteractionStatus.pending,
          },
          data: {
            status: AiConversationInteractionStatus.cancelled,
            version: { increment: 1 },
          },
        })
        const updated = await tx.aiInputBatch.update({
          where: { id: batch.id },
          data: { status: AiInputBatchStatus.cancelled },
          include: BATCH_MATERIAL_INCLUDE,
        })
        const statusEvent = await this.appendEvent(tx, {
          organizationId,
          conversationId: batch.conversationId,
          kind: AiConversationEventKind.batch_status,
          payload: {
            batchId: batch.id,
            status: AiInputBatchStatus.cancelled,
            reason: 'user_stop',
            attemptId: runningAttempt?.id ?? null,
          },
        })
        return { batch: updated, events: [statusEvent] }
      },
    })
  }

  async retryFailedBatch(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    batchId: string,
    idempotencyKey: string | undefined,
  ): Promise<SendAiConversationMessageResult> {
    return this.runBatchCommand({
      organizationId,
      userId,
      taskId,
      conversationId,
      batchId,
      operation: RETRY_FAILED_BATCH_OPERATION,
      idempotencyKey,
      request: { batchId },
      mutate: async (tx, batch) => {
        if (batch.status === AiInputBatchStatus.cancelled) {
          throw new ConflictException('已取消或已放弃的批次不可重试')
        }
        if (batch.status === AiInputBatchStatus.awaiting_review) {
          throw new ConflictException('待审核批次不可重试')
        }
        if (batch.status === AiInputBatchStatus.waiting_for_materials) {
          throw new ConflictException('资料失败请使用重试失败资料')
        }
        if (batch.status !== AiInputBatchStatus.failed) {
          throw new ConflictException('仅失败批次可重试')
        }
        const reset = await tx.aiWorkflowJob.updateMany({
          where: {
            inputBatchId: batch.id,
            type: AiWorkflowJobType.agent_batch,
          },
          data: {
            status: AiWorkflowJobStatus.pending,
            attemptCount: 0,
            claimedAt: null,
            claimedBy: null,
            leaseExpiresAt: null,
            nextAttemptAt: new Date(),
            lastErrorCode: null,
          },
        })
        if (reset.count === 0) {
          await tx.aiWorkflowJob.create({
            data: {
              organizationId,
              taskId,
              conversationId: batch.conversationId,
              inputBatchId: batch.id,
              type: AiWorkflowJobType.agent_batch,
              jobKey: agentBatchJobKey(batch.id),
              status: AiWorkflowJobStatus.pending,
            },
          })
        }
        const updated = await tx.aiInputBatch.update({
          where: { id: batch.id },
          data: { status: AiInputBatchStatus.ready_for_agent },
          include: BATCH_MATERIAL_INCLUDE,
        })
        const statusEvent = await this.appendEvent(tx, {
          organizationId,
          conversationId: batch.conversationId,
          kind: AiConversationEventKind.batch_status,
          payload: {
            batchId: batch.id,
            status: AiInputBatchStatus.ready_for_agent,
          },
        })
        return { batch: updated, events: [statusEvent] }
      },
    })
  }

  async cancelInteraction(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
    interactionId: string,
    version: number,
    idempotencyKey: string | undefined,
  ): Promise<SendAiConversationMessageResult> {
    await this.assertAssistAccess(userId)
    const existing = await this.prisma.aiConversationInteraction.findFirst({
      where: { id: interactionId, conversationId, organizationId },
    })
    if (!existing) {
      throw new NotFoundException('追问不存在')
    }
    return this.runBatchCommand({
      organizationId,
      userId,
      taskId,
      conversationId,
      batchId: existing.inputBatchId,
      operation: CANCEL_INTERACTION_OPERATION,
      idempotencyKey,
      request: { interactionId, version },
      mutate: async (tx) => {
        const interaction = await tx.aiConversationInteraction.findFirst({
          where: { id: interactionId, conversationId, organizationId },
        })
        if (!interaction) {
          throw new NotFoundException('追问不存在')
        }
        const updatedCount = await tx.aiConversationInteraction.updateMany({
          where: {
            id: interaction.id,
            version,
            status: AiConversationInteractionStatus.pending,
          },
          data: {
            status: AiConversationInteractionStatus.cancelled,
            version: { increment: 1 },
          },
        })
        if (updatedCount.count !== 1) {
          throw new ConflictException(staleInteractionMessage(interaction))
        }
        const updated = await tx.aiInputBatch.update({
          where: { id: interaction.inputBatchId },
          data: { status: AiInputBatchStatus.cancelled },
          include: BATCH_MATERIAL_INCLUDE,
        })
        await tx.agentTask.updateMany({
          where: { id: taskId, status: AgentTaskStatus.waiting },
          data: { status: AgentTaskStatus.active, statusVersion: { increment: 1 } },
        })
        await tx.taskActivity.create({
          data: {
            organizationId,
            taskId,
            actorUserId: userId,
            kind: TaskActivityKind.progress,
            summary: 'User 已取消指定等待项',
            payload: { interactionId: interaction.id },
          },
        })
        const statusEvent = await this.appendEvent(tx, {
          organizationId,
          conversationId,
          kind: AiConversationEventKind.batch_status,
          payload: {
            batchId: updated.id,
            status: AiInputBatchStatus.cancelled,
            reason: 'interaction_cancelled',
            interactionId: interaction.id,
          },
        })
        return { batch: updated, events: [statusEvent] }
      },
    })
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
    activeBatch: AiInputBatchView | null
    pendingInteraction: AiConversationInteractionView | null
    queuedBatches: AiInputBatchView[]
    draft: AiConversationDraftView
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
      take: CONVERSATION_EVENTS_PAGE_SIZE,
    })
    const last = await this.prisma.aiConversationEvent.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { sequence: 'desc' },
    })
    const projection = await this.loadBatchProjection(conversation.id)
    const draft = await this.prisma.aiConversationDraft.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId } },
    })
    return {
      conversationId: conversation.id,
      events: events.map(toEventView),
      lastSequence: last?.sequence ?? 0,
      ...projection,
      draft: toConversationDraftView(conversation.id, draft),
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
      const pending = new Map<number, AiConversationEventView>()
      const emit = (event: AiConversationEventView) => {
        if (event.sequence <= lastSeq) {
          return
        }
        pending.set(event.sequence, event)
        let next = pending.get(lastSeq + 1)
        while (next) {
          pending.delete(next.sequence)
          lastSeq = next.sequence
          subscriber.next({ id: String(next.sequence), data: next })
          next = pending.get(lastSeq + 1)
        }
      }
      const live = this.eventHub.observe(conversationId).subscribe(emit)

      // Worker 与 API 分进程时内存 hub 收不到完成事件，按 sequence 轮询补读。
      const poll = async () => {
        if (cancelled) {
          return
        }
        let foundEvents = false
        try {
          const events = await this.prisma.aiConversationEvent.findMany({
            where: { conversationId, sequence: { gt: lastSeq } },
            orderBy: { sequence: 'asc' },
          })
          if (cancelled) {
            return
          }
          foundEvents = events.length > 0
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
        }, nextSseCatchUpDelay(foundEvents))
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

  async finalizeReviewDisposition(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      taskId: string
      userId: string
      reviewPackageId: string
      inputBatchId: string | null
      disposition: 'confirmed' | 'rejected'
    },
  ): Promise<AiConversationEvent[]> {
    const batch = params.inputBatchId
      ? await tx.aiInputBatch.findFirst({
          where: {
            id: params.inputBatchId,
            taskLinks: { some: { taskId: params.taskId } },
            organizationId: params.organizationId,
            status: AiInputBatchStatus.awaiting_review,
          },
        })
      : await tx.aiInputBatch.findFirst({
          where: {
            taskLinks: { some: { taskId: params.taskId } },
            organizationId: params.organizationId,
            status: AiInputBatchStatus.awaiting_review,
          },
          orderBy: { conversationVersion: 'desc' },
        })
    if (!batch) {
      return []
    }

    await tx.aiInputBatch.update({
      where: { id: batch.id },
      data: { status: AiInputBatchStatus.completed },
    })
    await tx.agentTask.updateMany({
      where: { id: params.taskId, status: AgentTaskStatus.waiting },
      data: { status: AgentTaskStatus.active, statusVersion: { increment: 1 } },
    })
    await tx.taskActivity.create({
      data: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        actorUserId: params.userId,
        kind: TaskActivityKind.progress,
        summary:
          params.disposition === 'confirmed' ? 'User 已确认审核项' : 'User 已拒绝审核项',
        payload: { reviewPackageId: params.reviewPackageId },
      },
    })
    const statusEvent = await this.appendEvent(tx, {
      organizationId: params.organizationId,
      conversationId: batch.conversationId,
      kind: AiConversationEventKind.batch_status,
      payload: {
        batchId: batch.id,
        status: AiInputBatchStatus.completed,
        reviewPackageId: params.reviewPackageId,
        disposition: params.disposition,
      },
    })
    const events = [statusEvent]
    if (params.disposition !== 'confirmed') {
      await tx.aiConversation.update({
        where: { id: batch.conversationId },
        data: { updatedAt: new Date() },
      })
      return events
    }

    const continuation = await tx.aiInputBatch.create({
      data: {
        organizationId: params.organizationId,
        conversationId: batch.conversationId,
        creatorUserId: params.userId,
        userMessageEventId: batch.userMessageEventId,
        conversationVersion: statusEvent.sequence,
        status: AiInputBatchStatus.ready_for_agent,
        taskLinks: {
          create: {
            organizationId: params.organizationId,
            taskId: params.taskId,
            role: InputBatchTaskRole.primary,
          },
        },
      },
    })
    await tx.aiWorkflowJob.create({
      data: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        conversationId: batch.conversationId,
        inputBatchId: continuation.id,
        type: AiWorkflowJobType.agent_batch,
        jobKey: agentBatchJobKey(continuation.id),
        status: AiWorkflowJobStatus.pending,
      },
    })
    const readyEvent = await this.appendEvent(tx, {
      organizationId: params.organizationId,
      conversationId: batch.conversationId,
      kind: AiConversationEventKind.batch_status,
      payload: {
        batchId: continuation.id,
        status: AiInputBatchStatus.ready_for_agent,
        reviewPackageId: params.reviewPackageId,
        disposition: 'confirmed',
      },
    })
    events.push(readyEvent)
    await tx.aiConversation.update({
      where: { id: batch.conversationId },
      data: { updatedAt: new Date() },
    })
    return events
  }

  async recordReviewConflict(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      taskId: string
      userId: string
      reviewPackageId: string
      conversationId: string | null
      inputBatchId: string | null
      changeSummary: {
        baseVersion: number
        currentVersion: number
        changedFieldKeys: readonly string[]
      }
    },
  ): Promise<AiConversationEvent[]> {
    await tx.taskActivity.create({
      data: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        actorUserId: params.userId,
        kind: TaskActivityKind.progress,
        summary: '审核方案因目标版本变化进入冲突',
        payload: {
          reviewPackageId: params.reviewPackageId,
          changeSummary: params.changeSummary,
        },
      },
    })
    if (!params.conversationId) {
      return []
    }
    const event = await this.appendEvent(tx, {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      kind: AiConversationEventKind.batch_status,
      payload: {
        batchId: params.inputBatchId,
        status: 'conflict',
        reviewPackageId: params.reviewPackageId,
        disposition: 'conflict',
        changeSummary: params.changeSummary,
      },
    })
    await tx.aiConversation.update({
      where: { id: params.conversationId },
      data: { updatedAt: new Date() },
    })
    return [event]
  }

  async finalizeReviewCancel(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      taskId: string
      userId: string
      reviewPackageId: string
      inputBatchId: string | null
      conversationId: string | null
    },
  ): Promise<AiConversationEvent[]> {
    if (params.inputBatchId) {
      await tx.aiInputBatch.updateMany({
        where: {
          id: params.inputBatchId,
          status: AiInputBatchStatus.awaiting_review,
        },
        data: { status: AiInputBatchStatus.cancelled },
      })
    }
    const remaining = await tx.aiReviewPackage.count({
      where: {
        taskId: params.taskId,
        status: { in: ['pending', 'conflict'] },
      },
    })
    if (remaining === 0) {
      await tx.agentTask.updateMany({
        where: { id: params.taskId, status: AgentTaskStatus.waiting },
        data: { status: AgentTaskStatus.active, statusVersion: { increment: 1 } },
      })
    }
    await tx.taskActivity.create({
      data: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        actorUserId: params.userId,
        kind: TaskActivityKind.progress,
        summary: 'User 已取消指定审核等待项',
        payload: { reviewPackageId: params.reviewPackageId },
      },
    })
    const conversationId =
      params.conversationId ??
      (
        await tx.aiInputBatch.findFirst({
          where: { id: params.inputBatchId ?? '' },
          select: { conversationId: true },
        })
      )?.conversationId
    if (!conversationId) {
      return []
    }
    const statusEvent = await this.appendEvent(tx, {
      organizationId: params.organizationId,
      conversationId,
      kind: AiConversationEventKind.batch_status,
      payload: {
        batchId: params.inputBatchId,
        status: AiInputBatchStatus.cancelled,
        reason: 'review_package_cancelled',
        reviewPackageId: params.reviewPackageId,
      },
    })
    await tx.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })
    return [statusEvent]
  }

  async startReviewRegenerate(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      userId: string
      taskId: string
      reviewPackageId: string
      conversationId: string
      inputBatchId: string | null
    },
  ): Promise<AiConversationEvent[]> {
    if (params.inputBatchId) {
      await tx.aiInputBatch.updateMany({
        where: {
          id: params.inputBatchId,
          status: AiInputBatchStatus.awaiting_review,
        },
        data: { status: AiInputBatchStatus.cancelled },
      })
    }
    const statusEvent = await this.appendEvent(tx, {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      kind: AiConversationEventKind.batch_status,
      payload: {
        batchId: params.inputBatchId,
        status: 'regenerating',
        reviewPackageId: params.reviewPackageId,
        disposition: 'regenerate',
      },
    })
    const continuation = await tx.aiInputBatch.create({
      data: {
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        creatorUserId: params.userId,
        userMessageEventId: (
          await tx.aiInputBatch.findFirstOrThrow({
            where: params.inputBatchId
              ? { id: params.inputBatchId }
              : { conversationId: params.conversationId },
            orderBy: { createdAt: 'desc' },
            select: { userMessageEventId: true },
          })
        ).userMessageEventId,
        conversationVersion: statusEvent.sequence,
        status: AiInputBatchStatus.ready_for_agent,
        taskLinks: {
          create: {
            organizationId: params.organizationId,
            taskId: params.taskId,
            role: InputBatchTaskRole.primary,
          },
        },
      },
    })
    await tx.aiWorkflowJob.create({
      data: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        conversationId: params.conversationId,
        inputBatchId: continuation.id,
        type: AiWorkflowJobType.agent_batch,
        jobKey: agentBatchJobKey(continuation.id),
        status: AiWorkflowJobStatus.pending,
      },
    })
    await tx.agentTask.updateMany({
      where: { id: params.taskId, status: AgentTaskStatus.waiting },
      data: { status: AgentTaskStatus.active, statusVersion: { increment: 1 } },
    })
    await tx.taskActivity.create({
      data: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        actorUserId: params.userId,
        kind: TaskActivityKind.progress,
        summary: 'User 基于最新状态重新生成审核方案',
        payload: {
          reviewPackageId: params.reviewPackageId,
          inputBatchId: continuation.id,
        },
      },
    })
    const readyEvent = await this.appendEvent(tx, {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      kind: AiConversationEventKind.batch_status,
      payload: {
        batchId: continuation.id,
        status: AiInputBatchStatus.ready_for_agent,
        reviewPackageId: params.reviewPackageId,
        disposition: 'regenerate',
      },
    })
    await tx.aiConversation.update({
      where: { id: params.conversationId },
      data: { updatedAt: new Date() },
    })
    return [statusEvent, readyEvent]
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

  async tryPromoteBatch(
    tx: Prisma.TransactionClient,
    inputBatchId: string,
  ): Promise<{ conversationId: string; eventId: string }[]> {
    const batch = await tx.aiInputBatch.findUnique({
      where: { id: inputBatchId },
      include: BATCH_MATERIAL_INCLUDE,
    })
    if (!batch || batch.status !== AiInputBatchStatus.waiting_for_materials) {
      return []
    }
    const progress = materialProgressFromDeps(
      batch.sources.map((item) => ({
        required: item.required,
        parseResultVersion: item.parseVersion,
        failed: isFailedDependency(item),
      })),
    )
    if (progress.ready < progress.total) {
      const statusEvent = await this.appendEvent(tx, {
        organizationId: batch.organizationId,
        conversationId: batch.conversationId,
        kind: AiConversationEventKind.batch_status,
            payload: {
              batchId: batch.id,
              status: AiInputBatchStatus.waiting_for_materials,
              readyCount: progress.ready,
              totalCount: progress.total,
              failedCount: progress.failed,
              failedMaterials: toFailedMaterialPayload(batch.sources),
            },
      })
      return [{ conversationId: batch.conversationId, eventId: statusEvent.id }]
    }

    await tx.aiInputBatch.update({
      where: { id: batch.id },
      data: { status: AiInputBatchStatus.ready_for_agent },
    })
    await tx.aiWorkflowJob.create({
      data: {
        organizationId: batch.organizationId,
        taskId: primaryTaskId(batch),
        conversationId: batch.conversationId,
        inputBatchId: batch.id,
        type: AiWorkflowJobType.agent_batch,
        jobKey: agentBatchJobKey(batch.id),
        status: AiWorkflowJobStatus.pending,
      },
    })
    const statusEvent = await this.appendEvent(tx, {
      organizationId: batch.organizationId,
      conversationId: batch.conversationId,
      kind: AiConversationEventKind.batch_status,
        payload: {
          batchId: batch.id,
          status: AiInputBatchStatus.ready_for_agent,
          readyCount: progress.ready,
          totalCount: progress.total,
          failedCount: progress.failed,
        },
    })
    return [{ conversationId: batch.conversationId, eventId: statusEvent.id }]
  }

  private async loadConversationView(
    conversation: AiConversation,
    userId: string,
  ): Promise<AiConversationView> {
    const [events, projection, draft] = await Promise.all([
      this.prisma.aiConversationEvent.findMany({
        where: { conversationId: conversation.id },
        orderBy: { sequence: 'asc' },
      }),
      this.loadBatchProjection(conversation.id),
      this.prisma.aiConversationDraft.findUnique({
        where: { conversationId_userId: { conversationId: conversation.id, userId } },
      }),
    ])
    return toConversationView(
      conversation,
      events,
      projection.activeBatchSource,
      projection.pendingInteractionSource,
      projection.queuedBatchSources,
      draft,
    )
  }

  private async loadBatchProjection(conversationId: string): Promise<{
    activeBatch: AiInputBatchView | null
    pendingInteraction: AiConversationInteractionView | null
    queuedBatches: AiInputBatchView[]
    activeBatchSource: BatchWithMaterials | null
    pendingInteractionSource: AiConversationInteraction | null
    queuedBatchSources: BatchWithMaterials[]
  }> {
    const [openBatches, pendingInteraction] = await Promise.all([
      this.prisma.aiInputBatch.findMany({
        where: {
          conversationId,
          status: {
            in: [
              AiInputBatchStatus.ready_for_agent,
              AiInputBatchStatus.preparing_context,
              AiInputBatchStatus.agent_running,
              AiInputBatchStatus.waiting_for_materials,
              AiInputBatchStatus.awaiting_user_input,
              AiInputBatchStatus.awaiting_review,
            ],
          },
        },
        include: BATCH_MATERIAL_INCLUDE,
        orderBy: { conversationVersion: 'asc' },
      }),
      this.prisma.aiConversationInteraction.findFirst({
        where: { conversationId, status: AiConversationInteractionStatus.pending },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    const activeBatch = pickActiveBatch(openBatches)
    const queuedBatchSources = openBatches.filter(
      (batch) =>
        batch.status === AiInputBatchStatus.ready_for_agent && batch.id !== activeBatch?.id,
    )
    return {
      activeBatch: activeBatch ? toBatchView(activeBatch) : null,
      pendingInteraction: pendingInteraction ? toInteractionView(pendingInteraction) : null,
      queuedBatches: queuedBatchSources.map((batch) => toBatchView(batch, { queued: true })),
      activeBatchSource: activeBatch,
      pendingInteractionSource: pendingInteraction,
      queuedBatchSources,
    }
  }

  private async consumeInteractionReply(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      conversationId: string
      text: string
      reply: ConversationReplyInput
    },
  ): Promise<{
    replyToEventId: string
    interactionId: string
    text: string
    selectedOptionId?: string
    events: AiConversationEvent[]
  }> {
    const reply = requireCompleteReply(params.reply)
    const interaction = await tx.aiConversationInteraction.findFirst({
      where: {
        id: reply.interactionId,
        conversationId: params.conversationId,
        organizationId: params.organizationId,
      },
    })
    if (!interaction) {
      throw new NotFoundException('追问不存在')
    }
    if (interaction.eventId !== reply.replyToEventId) {
      throw new BadRequestException('replyToEventId 与当前追问不匹配')
    }
    const resolved = resolveReplyText(interaction, params.text, reply.selectedOptionId)
    const updated = await tx.aiConversationInteraction.updateMany({
      where: {
        id: interaction.id,
        version: reply.interactionVersion,
        status: AiConversationInteractionStatus.pending,
      },
      data: {
        status: AiConversationInteractionStatus.answered,
        version: { increment: 1 },
        responseJson: {
          text: resolved.text,
          selectedOptionId: resolved.selectedOptionId ?? null,
        },
      },
    })
    if (updated.count !== 1) {
      throw new ConflictException(staleInteractionMessage(interaction))
    }
    await tx.aiInputBatch.update({
      where: { id: interaction.inputBatchId },
      data: { status: AiInputBatchStatus.completed },
    })
    const statusEvent = await this.appendEvent(tx, {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      kind: AiConversationEventKind.batch_status,
      payload: {
        batchId: interaction.inputBatchId,
        status: AiInputBatchStatus.completed,
        interactionId: interaction.id,
        interactionStatus: AiConversationInteractionStatus.answered,
      },
    })
    return {
      replyToEventId: interaction.eventId,
      interactionId: interaction.id,
      text: resolved.text,
      selectedOptionId: resolved.selectedOptionId,
      events: [statusEvent],
    }
  }

  private async hasBlockingBatch(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<boolean> {
    const blocking = await tx.aiInputBatch.findFirst({
      where: {
        conversationId,
        status: {
          in: [
            AiInputBatchStatus.waiting_for_materials,
            AiInputBatchStatus.ready_for_agent,
            AiInputBatchStatus.preparing_context,
            AiInputBatchStatus.agent_running,
            AiInputBatchStatus.awaiting_user_input,
            AiInputBatchStatus.awaiting_review,
          ],
        },
      },
      select: { id: true },
    })
    return blocking != null
  }

  private async assertProcessingBatchCapacity(
    tx: Prisma.TransactionClient,
    params: { organizationId: string; userId: string; conversationId: string },
  ): Promise<void> {
    const processingStatus = {
      in: [
        AiInputBatchStatus.waiting_for_materials,
        AiInputBatchStatus.ready_for_agent,
        AiInputBatchStatus.preparing_context,
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

  private async requireOwnedUserConversation(
    db: { aiConversation: Prisma.TransactionClient['aiConversation'] },
    organizationId: string,
    userId: string,
    conversationId: string,
  ): Promise<AiConversation> {
    const conversation = await db.aiConversation.findFirst({
      where: { id: conversationId, organizationId },
    })
    if (!conversation) {
      throw new NotFoundException('会话不存在')
    }
    if (conversation.creatorUserId !== userId) {
      throw new ForbiddenException('仅会话所有者可访问该会话')
    }
    return conversation
  }

  private async findStoppableBatch(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<BatchWithMaterials | null> {
    const running = await tx.aiInputBatch.findFirst({
      where: {
        conversationId,
        status: { in: [AiInputBatchStatus.agent_running, AiInputBatchStatus.preparing_context] },
      },
      include: BATCH_MATERIAL_INCLUDE,
      orderBy: { conversationVersion: 'asc' },
    })
    if (running) {
      return running
    }
    return tx.aiInputBatch.findFirst({
      where: {
        conversationId,
        status: { in: [AiInputBatchStatus.ready_for_agent, AiInputBatchStatus.awaiting_user_input] },
      },
      include: BATCH_MATERIAL_INCLUDE,
      orderBy: { conversationVersion: 'asc' },
    })
  }

  private async cancelRunningBatch(
    tx: Prisma.TransactionClient,
    batch: BatchWithMaterials,
    reason: 'user_stop',
  ): Promise<{ batch: BatchWithMaterials; events: AiConversationEvent[] }> {
    if (batch.status === AiInputBatchStatus.cancelled) {
      return { batch, events: [] }
    }
    await tx.aiWorkflowJob.updateMany({
      where: {
        inputBatchId: batch.id,
        type: AiWorkflowJobType.agent_batch,
        status: { in: [AiWorkflowJobStatus.pending, AiWorkflowJobStatus.claimed] },
      },
      data: {
        status: AiWorkflowJobStatus.failed,
        lastErrorCode: 'BATCH_CANCELLED',
        leaseExpiresAt: null,
        generation: { increment: 1 },
      },
    })
    const runningAttempt = await tx.aiAgentAttempt.findFirst({
      where: { inputBatchId: batch.id, status: AiAgentAttemptStatus.running },
      orderBy: { startedAt: 'desc' },
    })
    await tx.aiAgentAttempt.updateMany({
      where: { inputBatchId: batch.id, status: AiAgentAttemptStatus.running },
      data: {
        status: AiAgentAttemptStatus.failed,
        errorCode: 'BATCH_CANCELLED',
        endedAt: new Date(),
      },
    })
    await tx.aiConversationInteraction.updateMany({
      where: {
        inputBatchId: batch.id,
        status: AiConversationInteractionStatus.pending,
      },
      data: {
        status: AiConversationInteractionStatus.cancelled,
        version: { increment: 1 },
      },
    })
    const updated = await tx.aiInputBatch.update({
      where: { id: batch.id },
      data: { status: AiInputBatchStatus.cancelled },
      include: BATCH_MATERIAL_INCLUDE,
    })
    const statusEvent = await this.appendEvent(tx, {
      organizationId: batch.organizationId,
      conversationId: batch.conversationId,
      kind: AiConversationEventKind.batch_status,
      payload: {
        batchId: batch.id,
        status: AiInputBatchStatus.cancelled,
        reason,
        attemptId: runningAttempt?.id ?? null,
      },
    })
    return { batch: updated, events: [statusEvent] }
  }

  private async requireOwnedConversation(
    organizationId: string,
    userId: string,
    taskId: string,
    conversationId: string,
  ): Promise<AiConversation> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, organizationId, taskLinks: { some: { taskId } } },
    })
    if (!conversation) {
      throw new NotFoundException('AI 建团会话不存在')
    }
    if (conversation.creatorUserId !== userId) {
      throw new ForbiddenException('仅任务创建者可访问该 AI 建团会话')
    }
    return conversation
  }

  private assertWaitingBatch(batch: BatchWithMaterials): void {
    if (batch.status === AiInputBatchStatus.waiting_for_materials) {
      return
    }
    if (
      batch.status === AiInputBatchStatus.ready_for_agent ||
      batch.status === AiInputBatchStatus.preparing_context ||
      batch.status === AiInputBatchStatus.agent_running
    ) {
      throw new ConflictException('Agent 认领后不可修改本批资料，请先停止当前处理并重新整理')
    }
    throw new ConflictException('当前批次不可再修改资料依赖')
  }

  private async loadBatch(
    tx: Prisma.TransactionClient,
    batchId: string,
  ): Promise<BatchWithMaterials> {
    return tx.aiInputBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: BATCH_MATERIAL_INCLUDE,
    })
  }

  private async runBatchCommand(params: {
    organizationId: string
    userId: string
    taskId: string
    conversationId: string
    batchId: string
    operation: string
    idempotencyKey: string | undefined
    request: unknown
    mutate: (
      tx: Prisma.TransactionClient,
      batch: BatchWithMaterials,
    ) => Promise<{ batch: BatchWithMaterials; events: AiConversationEvent[] }>
  }): Promise<SendAiConversationMessageResult> {
    await this.assertAssistAccess(params.userId)
    const key = requireIdempotencyKey(params.idempotencyKey)
    const hash = requestHash({
      taskId: params.taskId,
      conversationId: params.conversationId,
      batchId: params.batchId,
      request: params.request,
    })
    const existingRecord = await this.prisma.aiCreateIdempotencyRecord.findUnique({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId: params.organizationId,
          operation: params.operation,
          idempotencyKey: key,
        },
      },
    })
    if (
      existingRecord?.completedAt &&
      existingRecord.resultJson &&
      existingRecord.requestHash === hash &&
      existingRecord.taskId === params.taskId
    ) {
      return existingRecord.resultJson as unknown as SendAiConversationMessageResult
    }

    const published: AiConversationEventView[] = []
    const result = await this.prisma.$transaction(async (tx) => {
      await lockConversationRuntime(tx, params.organizationId, params.conversationId)
      await this.findOwnedInProgressTask(params.organizationId, params.userId, params.taskId, tx)
      const conversation = await this.requireOwnedConversation(
        params.organizationId,
        params.userId,
        params.taskId,
        params.conversationId,
      )
      if (conversation.status !== AiConversationStatus.open) {
        throw new BadRequestException('仅未完成的 AI 建团会话可处理资料批次')
      }
      const record = await tx.aiCreateIdempotencyRecord.upsert({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId: params.organizationId,
            operation: params.operation,
            idempotencyKey: key,
          },
        },
        create: {
          organizationId: params.organizationId,
          taskId: params.taskId,
          operation: params.operation,
          idempotencyKey: key,
          requestHash: hash,
        },
        update: {},
      })
      if (record.taskId !== params.taskId) {
        throw new ConflictException('幂等键已被其他任务使用')
      }
      if (record.requestHash !== hash) {
        throw new ConflictException('幂等键已用于不同的请求内容')
      }
      if (record.completedAt && record.resultJson) {
        return record.resultJson as unknown as SendAiConversationMessageResult
      }

      const batch = await tx.aiInputBatch.findFirst({
        where: {
          id: params.batchId,
          conversationId: conversation.id,
          taskLinks: { some: { taskId: params.taskId } },
          organizationId: params.organizationId,
        },
        include: BATCH_MATERIAL_INCLUDE,
      })
      if (!batch) {
        throw new NotFoundException('AI 输入批次不存在')
      }
      const mutated = await params.mutate(tx, batch)
      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })
      const events = mutated.events.map(toEventView)
      const last = await tx.aiConversationEvent.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { sequence: 'desc' },
      })
      const payload: SendAiConversationMessageResult = {
        conversationId: conversation.id,
        batch: toBatchView(mutated.batch),
        events,
        lastSequence: last?.sequence ?? 0,
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
      this.eventHub.publish(params.conversationId, event)
    }
    return result
  }

  private async findOwnedInProgressTask(
    organizationId: string,
    userId: string,
    taskId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<TaskWithDraft> {
    const task = await tx.aiCreateTask.findFirst({
      where: { id: taskId, agentTask: { organizationId } },
      include: TASK_INCLUDE,
    })
    if (!task || !task.draft) {
      throw new NotFoundException('AI 建团任务不存在')
    }
    if (task.agentTask.ownerUserId !== userId) {
      throw new ForbiddenException('仅任务创建者可访问该 AI 建团任务')
    }
    if (
      task.agentTask.status !== AgentTaskStatus.active &&
      task.agentTask.status !== AgentTaskStatus.waiting
    ) {
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

function pickActiveBatch(batches: BatchWithMaterials[]): BatchWithMaterials | null {
  const rank: Partial<Record<AiInputBatchStatus, number>> = {
    [AiInputBatchStatus.agent_running]: 0,
    [AiInputBatchStatus.preparing_context]: 0,
    [AiInputBatchStatus.waiting_for_materials]: 1,
    [AiInputBatchStatus.awaiting_user_input]: 2,
    [AiInputBatchStatus.awaiting_review]: 3,
    [AiInputBatchStatus.ready_for_agent]: 4,
  }
  return (
    [...batches].sort((left, right) => {
      const leftRank = rank[left.status] ?? 99
      const rightRank = rank[right.status] ?? 99
      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }
      return left.conversationVersion - right.conversationVersion
    })[0] ?? null
  )
}

function requestHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex')
}

function requireIdempotencyKey(idempotencyKey: string | undefined): string {
  const key = idempotencyKey?.trim()
  if (!key) {
    throw new BadRequestException('必须提供 Idempotency-Key 幂等键')
  }
  if (key.length > 200) {
    throw new BadRequestException('幂等键长度不能超过 200 个字符')
  }
  return key
}

function progressOf(batch: BatchWithMaterials) {
  return materialProgressFromDeps(
    batch.sources.map((item) => ({
      required: item.required,
      parseResultVersion: item.parseVersion,
      failed: isFailedDependency(item),
    })),
  )
}

function dedupeFiles(files: IncomingMaterialFile[]): IncomingMaterialFile[] {
  const seen = new Set<string>()
  const unique: IncomingMaterialFile[] = []
  for (const file of files) {
    const key = `${createHash('sha256').update(file.buffer).digest('hex')}:${file.buffer.byteLength}:${(file.mimetype ?? '').toLowerCase()}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(file)
  }
  return unique
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
