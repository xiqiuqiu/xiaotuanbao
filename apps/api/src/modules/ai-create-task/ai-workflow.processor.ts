import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import {
  AiCollaborationError,
  type HeadlessExecutionResult,
  type SubmitReviewPackageModelInput,
} from '@xiaotuanbao/ai-contracts'
import {
  AiAgentAttemptStatus,
  AiConversationEventKind,
  AiConversationInteractionStatus,
  AiCreateActivityRunStatus,
  AiInputBatchStatus,
  AiReviewPackageStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  OrganizationStatus,
  UserStatus,
  type AiInputBatch,
  type AiWorkflowJob,
  type Prisma,
} from '@prisma/client'
import {
  AI_OP_DELEGATION_JWT_AUD,
  AI_OP_DELEGATION_JWT_TYP,
} from '../../common/jwt-claims'
import type { AiOperationDelegationPayload } from '../../common/types/api-response.type'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import {
  assembleFrozenUserText,
  buildContextManifest,
  buildFrozenProjection,
  excerptDigestsFor,
  resolveAttemptUserText,
} from './ai-context-manifest'
import { AiConversationService } from './ai-conversation.service'
import { WORKFLOW_LEASE_MS, WORKFLOW_MAX_ATTEMPTS } from './ai-conversation.constants'
import { isAiCreateAssistEnabledForUser } from './ai-create-assist-access'
import { lockAiCreateTask } from './ai-create-task.lock'
import { isFailedDependency, toFailedMaterialPayload } from './ai-conversation.mapper'
import { responseSchemaFor } from './ai-conversation.interaction'
import { AiHeadlessClient } from './ai-headless.client'
import { DepartureMaterialService } from './departure-material.service'
import {
  PARSE_FAILED_ERROR_CODE,
  materialProgressFromDeps,
  parseErrorMessage,
} from './departure-material.constants'
import { toStoredCandidates } from './review-package.mapper'

type ClaimedJob = AiWorkflowJob & { inputBatch: AiInputBatch }

@Injectable()
export class AiWorkflowProcessor {
  private readonly logger = new Logger(AiWorkflowProcessor.name)
  private readonly workerId = process.env.HOSTNAME?.trim() || `worker-${randomUUID()}`

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly conversationService: AiConversationService,
    private readonly headlessClient: AiHeadlessClient,
    private readonly materialService: DepartureMaterialService,
  ) {}

  async processDueJobs(limit = 10): Promise<number> {
    let processed = 0
    for (let index = 0; index < limit; index += 1) {
      const claimed = (await this.claimNextParse()) ?? (await this.claimNextAgent())
      if (!claimed) {
        break
      }
      await this.executeClaimed(claimed)
      processed += 1
    }
    return processed
  }

  private async claimNextParse(): Promise<ClaimedJob | null> {
    try {
      const claimed = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT j.id
          FROM ai_workflow_jobs j
          WHERE j.type = 'material_parse'::ai_workflow_job_type
            AND (
              (
                j.status = 'pending'::ai_workflow_job_status
                AND j.next_attempt_at <= NOW()
              )
              OR (
                j.status = 'claimed'::ai_workflow_job_status
                AND j.lease_expires_at IS NOT NULL
                AND j.lease_expires_at <= NOW()
              )
            )
          ORDER BY j.created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `
        if (rows.length === 0) {
          return null
        }
        const job = await tx.aiWorkflowJob.findUniqueOrThrow({
          where: { id: rows[0].id },
          include: { inputBatch: true },
        })
        const claimedJob = await tx.aiWorkflowJob.update({
          where: { id: job.id },
          data: {
            status: AiWorkflowJobStatus.claimed,
            claimedAt: new Date(),
            claimedBy: this.workerId,
            leaseExpiresAt: this.leaseUntil(),
            attemptCount: { increment: 1 },
          },
        })
        return { ...job, ...claimedJob, inputBatch: job.inputBatch }
      })
      return claimed
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null
      }
      throw error
    }
  }

  private async claimNextAgent(): Promise<ClaimedJob | null> {
    try {
      const published: { conversationId: string; eventId: string }[] = []
      const claimed = await this.prisma.$transaction(async (tx) => {
        // Continuations reuse the review-turn user_message but snapshot a later
        // confirm event. Claim by originating turn so they run before later queues.
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT j.id
          FROM ai_workflow_jobs j
          JOIN ai_input_batches b ON b.id = j.input_batch_id
          JOIN ai_conversation_events origin ON origin.id = b.user_message_event_id
          WHERE j.type = 'agent_batch'::ai_workflow_job_type
            AND (
              (
                j.status = 'pending'::ai_workflow_job_status
                AND j.next_attempt_at <= NOW()
              )
              OR (
                j.status = 'claimed'::ai_workflow_job_status
                AND j.lease_expires_at IS NOT NULL
                AND j.lease_expires_at <= NOW()
              )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM ai_input_batches running
              WHERE running.task_id = j.task_id
                AND running.status = 'agent_running'::ai_input_batch_status
                AND running.id <> j.input_batch_id
            )
            AND (
              NOT EXISTS (
                SELECT 1
                FROM ai_conversation_interactions pending
                WHERE pending.conversation_id = j.conversation_id
                  AND pending.status = 'pending'::ai_conversation_interaction_status
              )
              OR EXISTS (
                SELECT 1
                FROM ai_conversation_interactions pending
                WHERE pending.conversation_id = j.conversation_id
                  AND pending.status = 'pending'::ai_conversation_interaction_status
                  AND b.reply_to_event_id = pending.event_id
              )
            )
            AND (
              NOT EXISTS (
                SELECT 1
                FROM ai_input_batches reply
                WHERE reply.conversation_id = j.conversation_id
                  AND reply.status IN (
                    'waiting_for_materials'::ai_input_batch_status,
                    'ready_for_agent'::ai_input_batch_status
                  )
                  AND reply.reply_to_event_id IS NOT NULL
              )
              OR b.reply_to_event_id IS NOT NULL
            )
            AND (
              b.reply_to_event_id IS NOT NULL
              OR NOT EXISTS (
                SELECT 1
                FROM ai_input_batches blocking
                JOIN ai_conversation_events blocking_origin
                  ON blocking_origin.id = blocking.user_message_event_id
                WHERE blocking.conversation_id = j.conversation_id
                  AND blocking.id <> j.input_batch_id
                  AND blocking_origin.sequence < origin.sequence
                  AND blocking.status IN (
                    'waiting_for_materials'::ai_input_batch_status,
                    'awaiting_review'::ai_input_batch_status
                  )
              )
            )
          ORDER BY origin.sequence ASC, b.conversation_version ASC
          FOR UPDATE OF j SKIP LOCKED
          LIMIT 1
        `
        if (rows.length === 0) {
          return null
        }

        const job = await tx.aiWorkflowJob.findUniqueOrThrow({
          where: { id: rows[0].id },
          include: { inputBatch: true },
        })
        await lockAiCreateTask(tx, job.organizationId, job.taskId)
        const running = await tx.aiInputBatch.findFirst({
          where: {
            taskId: job.taskId,
            status: AiInputBatchStatus.agent_running,
            id: { not: job.inputBatchId },
          },
          select: { id: true },
        })
        if (running) {
          return null
        }
        if (
          !job.inputBatch.replyToEventId &&
          (await this.hasEarlierNonReplyClaimBlocker(tx, job.inputBatch))
        ) {
          return null
        }

        if (job.status === AiWorkflowJobStatus.claimed) {
          await tx.aiAgentAttempt.updateMany({
            where: { jobId: job.id, status: AiAgentAttemptStatus.running },
            data: {
              status: AiAgentAttemptStatus.failed,
              errorCode: 'AGENT_UNAVAILABLE',
              endedAt: new Date(),
            },
          })
        }

        const claimedJob = await tx.aiWorkflowJob.update({
          where: { id: job.id },
          data: {
            status: AiWorkflowJobStatus.claimed,
            claimedAt: new Date(),
            claimedBy: this.workerId,
            leaseExpiresAt: this.leaseUntil(),
            attemptCount: { increment: 1 },
          },
        })
        if (job.inputBatch.status !== AiInputBatchStatus.agent_running) {
          await tx.aiInputBatch.update({
            where: { id: job.inputBatchId },
            data: { status: AiInputBatchStatus.agent_running },
          })
          const statusEvent = await this.conversationService.appendEvent(tx, {
            organizationId: job.organizationId,
            conversationId: job.conversationId,
            kind: AiConversationEventKind.batch_status,
            payload: { batchId: job.inputBatchId, status: AiInputBatchStatus.agent_running },
          })
          published.push({ conversationId: job.conversationId, eventId: statusEvent.id })
        }
        return {
          ...job,
          ...claimedJob,
          inputBatch: { ...job.inputBatch, status: AiInputBatchStatus.agent_running },
        }
      })

      if (claimed) {
        for (const item of published) {
          const event = await this.prisma.aiConversationEvent.findUnique({
            where: { id: item.eventId },
          })
          if (event) {
            this.conversationService.publish(item.conversationId, event)
          }
        }
      }
      return claimed
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null
      }
      throw error
    }
  }

  private async executeClaimed(job: ClaimedJob): Promise<void> {
    if (job.type === AiWorkflowJobType.material_parse) {
      await this.executeParse(job)
      return
    }
    if (job.attemptCount > WORKFLOW_MAX_ATTEMPTS) {
      await this.persistFailure(job, 'AGENT_UNAVAILABLE')
      return
    }

    const authorized = await this.recheckAuthorization(job)
    if (!authorized.ok) {
      await this.persistFailure(job, authorized.errorCode)
      return
    }

    try {
      const prepared = await this.prepareAttempt(job)
      const renewed = await this.renewLease(job.id)
      if (!renewed) {
        return
      }
      const result = await this.headlessClient.run(prepared.request, prepared.delegationToken)
      await this.persistOutcome(job, prepared.attemptId, result)
    } catch (error) {
      this.logger.warn(`Agent 批次执行失败 job=${job.id}: ${String(error)}`)
      await this.persistFailure(job, 'AGENT_UNAVAILABLE')
    }
  }

  private async executeParse(job: ClaimedJob): Promise<void> {
    if (job.attemptCount > WORKFLOW_MAX_ATTEMPTS) {
      if (job.materialId) {
        await this.materialService.markParseTerminalFailure(job.materialId)
      }
      await this.persistParseBarrierFailure(job, PARSE_FAILED_ERROR_CODE)
      return
    }
    try {
      const parsed = await this.materialService.executeParseJob(job)
      if (!parsed) {
        await this.persistParseBarrierFailure(job, PARSE_FAILED_ERROR_CODE)
        return
      }
      const batchIds = await this.materialService.pinMaterialVersion(
        parsed.materialId,
        parsed.parseResultVersion,
      )
      for (const batchId of batchIds) {
        const published = await this.prisma.$transaction(async (tx) => {
          const batch = await tx.aiInputBatch.findUnique({ where: { id: batchId } })
          if (!batch) {
            return []
          }
          await lockAiCreateTask(tx, batch.organizationId, batch.taskId)
          return this.conversationService.tryPromoteBatch(tx, batchId)
        })
        for (const item of published) {
          const event = await this.prisma.aiConversationEvent.findUnique({
            where: { id: item.eventId },
          })
          if (event) {
            this.conversationService.publish(item.conversationId, event)
          }
        }
      }
    } catch (error) {
      this.logger.warn(`资料解析失败 job=${job.id}: ${String(error)}`)
      await this.prisma.aiWorkflowJob.update({
        where: { id: job.id },
        data: {
          status: AiWorkflowJobStatus.pending,
          lastErrorCode: PARSE_FAILED_ERROR_CODE,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + 5_000),
        },
      })
    }
  }

  private async recheckAuthorization(
    job: ClaimedJob,
  ): Promise<{ ok: true } | { ok: false; errorCode: string }> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: job.inputBatch.creatorUserId,
        organizationId: job.organizationId,
        status: UserStatus.enabled,
        deletedAt: null,
        organization: { deletedAt: null, status: OrganizationStatus.enabled },
      },
      select: { id: true },
    })
    if (!user) {
      return { ok: false, errorCode: 'PERMISSION_DENIED' }
    }
    if (!isAiCreateAssistEnabledForUser(this.configService, user.id)) {
      return { ok: false, errorCode: 'PERMISSION_DENIED' }
    }
    const permissionKeys = await this.authService.getPermissionKeysForUser(user.id)
    if (!permissionKeys.includes('departure:write')) {
      return { ok: false, errorCode: 'PERMISSION_DENIED' }
    }
    return { ok: true }
  }

  private async prepareAttempt(job: ClaimedJob): Promise<{
    request: {
      taskId: string
      conversationId: string
      inputBatchId: string
      attemptId: string
      contextManifestId: string
      userText: string
    }
    attemptId: string
    delegationToken: string
  }> {
    const userEvent = await this.prisma.aiConversationEvent.findUniqueOrThrow({
      where: { id: job.inputBatch.userMessageEventId },
    })
    const versionEvent = await this.prisma.aiConversationEvent.findFirst({
      where: {
        conversationId: job.conversationId,
        organizationId: job.organizationId,
        sequence: job.inputBatch.conversationVersion,
      },
      select: { kind: true, payload: true },
    })
    const task = await this.prisma.aiCreateTask.findUniqueOrThrow({
      where: { id: job.taskId },
      include: { draft: true },
    })
    if (!task.draft) {
      throw new Error('发团创建草稿不存在')
    }
    const originalUserText = (
      userEvent.payload && typeof userEvent.payload === 'object' && 'text' in userEvent.payload
        ? String((userEvent.payload as { text: unknown }).text ?? '')
        : ''
    ).trim()
    const userText = resolveAttemptUserText(originalUserText, versionEvent).trim()
    if (!userText) {
      throw new Error('输入批次缺少 User 原文')
    }
    const modelId =
      this.configService.get<string>('app.aiCreateAssist.modelId')?.trim() || 'deterministic'
    const pinnedMaterials = await this.prisma.aiInputBatchMaterial.findMany({
      where: {
        inputBatchId: job.inputBatchId,
        required: true,
        parseResultVersion: { not: null },
      },
      select: { materialId: true, parseResultVersion: true },
    })
    const materialVersions = pinnedMaterials.map((item) => ({
      materialId: item.materialId,
      parseResultVersion: item.parseResultVersion as number,
    }))
    const parseIndex = await this.materialService.loadPinnedParseIndex(
      job.organizationId,
      job.inputBatchId,
    )
    const historyEvents = await this.prisma.aiConversationEvent.findMany({
      where: {
        conversationId: job.conversationId,
        organizationId: job.organizationId,
        sequence: { lte: job.inputBatch.conversationVersion },
      },
      orderBy: { sequence: 'asc' },
      select: { sequence: true, kind: true, payload: true },
    })
    const projection = buildFrozenProjection({
      events: historyEvents,
      conversationVersion: job.inputBatch.conversationVersion,
      originUserMessageSequence: userEvent.sequence,
      materials: parseIndex.materials,
      materialTruncationReasons: parseIndex.truncationReasons,
    })
    const composedUserText = assembleFrozenUserText(userText, projection)
    const excerptDigests = excerptDigestsFor(projection.pinnedMaterials)
    const manifestRecord = buildContextManifest({
      conversationId: job.conversationId,
      inputBatchId: job.inputBatchId,
      conversationVersion: job.inputBatch.conversationVersion,
      eventSequences: projection.recentTail.map((event) => event.sequence),
      businessSnapshotVersion: task.draft.version,
      modelId,
      materialVersions,
      excerptDigests,
      truncationReasons: projection.truncationReasons,
    })

    const prepared = await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, job.organizationId, job.taskId)
      const run = await this.getOrCreateRunningActivityRun(
        tx,
        job.organizationId,
        job.taskId,
        job.inputBatch.creatorUserId,
      )
      const existingManifest = await tx.aiContextManifest.findFirst({
        where: {
          organizationId: job.organizationId,
          inputBatchId: job.inputBatchId,
          conversationId: job.conversationId,
          inputHash: manifestRecord.inputHash,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      const manifest = existingManifest
        ? { id: existingManifest.id }
        : await tx.aiContextManifest.create({
            data: {
              organizationId: job.organizationId,
              taskId: job.taskId,
              conversationId: job.conversationId,
              inputBatchId: job.inputBatchId,
              conversationVersion: manifestRecord.conversationVersion,
              eventSequences: manifestRecord.eventSequences,
              businessSnapshotVersion: manifestRecord.businessSnapshotVersion,
              builderVersion: manifestRecord.builderVersion,
              systemPromptVersion: manifestRecord.systemPromptVersion,
              toolSchemaVersion: manifestRecord.toolSchemaVersion,
              modelId: manifestRecord.modelId,
              inputHash: manifestRecord.inputHash,
              truncationReasons: manifestRecord.truncationReasons,
              materialVersions,
              summaryVersion: null,
              excerptDigests: JSON.parse(JSON.stringify(manifestRecord.excerptDigests)) as Prisma.InputJsonValue,
            },
          })
      const attempt = await tx.aiAgentAttempt.create({
        data: {
          organizationId: job.organizationId,
          taskId: job.taskId,
          conversationId: job.conversationId,
          inputBatchId: job.inputBatchId,
          jobId: job.id,
          activityRunId: run.id,
          contextManifestId: manifest.id,
          status: AiAgentAttemptStatus.running,
        },
      })
      return { runId: run.id, attemptId: attempt.id, contextManifestId: manifest.id }
    })

    const ttlSec = this.configService.get<number>('app.aiCreateAssist.delegationTtlSec') ?? 600
    const payload: AiOperationDelegationPayload = {
      typ: AI_OP_DELEGATION_JWT_TYP,
      sub: job.inputBatch.creatorUserId,
      organizationId: job.organizationId,
      taskId: job.taskId,
      runId: prepared.runId,
      conversationId: job.conversationId,
      inputBatchId: job.inputBatchId,
      attemptId: prepared.attemptId,
      contextManifestId: prepared.contextManifestId,
    }
    const delegationToken = await this.jwtService.signAsync(payload, {
      expiresIn: ttlSec,
      secret: this.configService.getOrThrow<string>('app.jwtDelegationSecret'),
      audience: AI_OP_DELEGATION_JWT_AUD,
    })

    return {
      request: {
        taskId: job.taskId,
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        attemptId: prepared.attemptId,
        contextManifestId: prepared.contextManifestId,
        userText: composedUserText,
      },
      attemptId: prepared.attemptId,
      delegationToken,
    }
  }

  private async getOrCreateRunningActivityRun(
    tx: Prisma.TransactionClient,
    organizationId: string,
    taskId: string,
    creatorUserId: string,
  ) {
    const existing = await tx.aiCreateActivityRun.findFirst({
      where: { taskId, organizationId, status: AiCreateActivityRunStatus.running },
      orderBy: { startedAt: 'desc' },
    })
    if (existing) {
      return existing
    }
    return tx.aiCreateActivityRun.create({
      data: { organizationId, taskId, creatorUserId },
    })
  }

  private async persistOutcome(
    job: ClaimedJob,
    attemptId: string,
    result: HeadlessExecutionResult,
  ): Promise<void> {
    if (result.kind === 'failed') {
      await this.persistFailure(job, result.error.code, result, attemptId)
      return
    }

    const published: string[] = []
    await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, job.organizationId, job.taskId)
      if (!(await this.ownsClaimedJob(tx, job.id))) {
        return
      }
      const batchStatus = batchStatusForResult(result)
      const message =
        result.kind === 'completed'
          ? result.message
          : result.kind === 'awaiting_user_input'
            ? result.interaction.prompt
            : '已提交待审核建议，请在中间表单确认。'
      const interactionId =
        result.kind === 'awaiting_user_input' ? randomUUID() : null
      const interactionPayload =
        result.kind === 'awaiting_user_input' && interactionId
          ? {
              interactionId,
              type: result.interaction.type,
              prompt: result.interaction.prompt,
              options: result.interaction.options ?? [],
              responseSchema: responseSchemaFor(
                result.interaction.type === 'single_choice' ? 'single_choice' : 'free_text',
                result.interaction.options ?? [],
              ),
              status: AiConversationInteractionStatus.pending,
              version: 1,
            }
          : null

      const reviewPackageId =
        result.kind === 'awaiting_review'
          ? await this.persistReviewPackage(tx, job, result.reviewPackage)
          : null

      const agentEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.agent_message,
        payload: {
          text: message,
          batchId: job.inputBatchId,
          attemptId,
          ...(interactionPayload ? { interaction: interactionPayload } : {}),
          ...(reviewPackageId ? { reviewPackageId } : {}),
        } as Prisma.InputJsonValue,
      })
      published.push(agentEvent.id)
      if (result.kind === 'awaiting_user_input' && interactionId && interactionPayload) {
        await tx.aiConversationInteraction.create({
          data: {
            id: interactionId,
            organizationId: job.organizationId,
            conversationId: job.conversationId,
            inputBatchId: job.inputBatchId,
            eventId: agentEvent.id,
            type: result.interaction.type,
            prompt: result.interaction.prompt,
            options: interactionPayload.options,
            responseSchema: interactionPayload.responseSchema as Prisma.InputJsonValue,
            status: AiConversationInteractionStatus.pending,
            version: 1,
          },
        })
      }

      const statusEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.batch_status,
        payload: {
          batchId: job.inputBatchId,
          status: batchStatus,
          attemptId,
          ...(reviewPackageId ? { reviewPackageId } : {}),
        },
      })
      published.push(statusEvent.id)

      await tx.aiInputBatch.update({
        where: { id: job.inputBatchId },
        data: { status: batchStatus },
      })
      await tx.aiAgentAttempt.update({
        where: { id: attemptId },
        data: {
          status: AiAgentAttemptStatus.completed,
          resultJson: result as unknown as Prisma.InputJsonValue,
          endedAt: new Date(),
        },
      })
      await tx.aiWorkflowJob.update({
        where: { id: job.id },
        data: {
          status: AiWorkflowJobStatus.succeeded,
          leaseExpiresAt: null,
        },
      })
      if (batchStatus === AiInputBatchStatus.completed) {
        await tx.aiCreateActivityRun.updateMany({
          where: {
            taskId: job.taskId,
            status: AiCreateActivityRunStatus.running,
          },
          data: {
            status: AiCreateActivityRunStatus.completed,
            endedAt: new Date(),
          },
        })
      }
    })

    for (const eventId of published) {
      const event = await this.prisma.aiConversationEvent.findUnique({ where: { id: eventId } })
      if (event) {
        this.conversationService.publish(job.conversationId, event)
      }
    }
  }

  private async persistParseBarrierFailure(job: ClaimedJob, errorCode: string): Promise<void> {
    const published: string[] = []
    await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, job.organizationId, job.taskId)
      if (!(await this.ownsClaimedJob(tx, job.id))) {
        return
      }
      await tx.aiWorkflowJob.update({
        where: { id: job.id },
        data: {
          status: AiWorkflowJobStatus.failed,
          lastErrorCode: errorCode,
          leaseExpiresAt: null,
        },
      })
      const batch = await tx.aiInputBatch.findUnique({
        where: { id: job.inputBatchId },
        include: {
          materials: {
            include: {
              material: {
                include: {
                  parseRuns: { orderBy: { resultVersion: 'desc' }, take: 1 },
                },
              },
            },
          },
        },
      })
      if (!batch || batch.status !== AiInputBatchStatus.waiting_for_materials) {
        return
      }
      const failedMaterial = job.materialId
        ? await tx.departureMaterial.findUnique({ where: { id: job.materialId } })
        : null
      const errorEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.error,
        payload: {
          batchId: job.inputBatchId,
          materialId: job.materialId,
          originalFilename: failedMaterial?.originalFilename ?? null,
          errorCode,
          errorMessage: parseErrorMessage(errorCode),
        },
      })
      published.push(errorEvent.id)
      const progress = materialProgressFromDeps(
        batch.materials.map((item) => ({
          required: item.required,
          parseResultVersion: item.parseResultVersion,
          failed: item.parseResultVersion == null && (item.materialId === job.materialId || isFailedDependency(item)),
        })),
      )
      const statusEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.batch_status,
        payload: {
          batchId: job.inputBatchId,
          status: AiInputBatchStatus.waiting_for_materials,
          readyCount: progress.ready,
          totalCount: progress.total,
          failedCount: progress.failed,
          failedMaterials: toFailedMaterialPayload(batch.materials),
        },
      })
      published.push(statusEvent.id)
    })

    for (const eventId of published) {
      const event = await this.prisma.aiConversationEvent.findUnique({ where: { id: eventId } })
      if (event) {
        this.conversationService.publish(job.conversationId, event)
      }
    }
  }

  private async persistFailure(
    job: ClaimedJob,
    errorCode: string,
    result?: HeadlessExecutionResult,
    attemptId?: string,
  ): Promise<void> {
    const published: string[] = []
    await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, job.organizationId, job.taskId)
      if (!(await this.ownsClaimedJob(tx, job.id))) {
        return
      }
      const errorEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.error,
        payload: { batchId: job.inputBatchId, errorCode, attemptId: attemptId ?? null },
      })
      published.push(errorEvent.id)
      const statusEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.batch_status,
        payload: {
          batchId: job.inputBatchId,
          status: AiInputBatchStatus.failed,
          errorCode,
        },
      })
      published.push(statusEvent.id)
      await tx.aiInputBatch.update({
        where: { id: job.inputBatchId },
        data: { status: AiInputBatchStatus.failed },
      })
      if (attemptId) {
        await tx.aiAgentAttempt.update({
          where: { id: attemptId },
          data: {
            status: AiAgentAttemptStatus.failed,
            errorCode,
            resultJson: (result ?? {
              kind: 'failed',
              error: AiCollaborationError.fromCode(
                errorCode === 'PERMISSION_DENIED' ? 'PERMISSION_DENIED' : 'AGENT_UNAVAILABLE',
              ).toJSON(),
            }) as unknown as Prisma.InputJsonValue,
            endedAt: new Date(),
          },
        })
      }
      await tx.aiWorkflowJob.update({
        where: { id: job.id },
        data: {
          status: AiWorkflowJobStatus.failed,
          lastErrorCode: errorCode,
          leaseExpiresAt: null,
        },
      })
      await tx.aiCreateActivityRun.updateMany({
        where: { taskId: job.taskId, status: AiCreateActivityRunStatus.running },
        data: {
          status: AiCreateActivityRunStatus.failed,
          endedAt: new Date(),
          errorCode,
        },
      })
    })

    for (const eventId of published) {
      const event = await this.prisma.aiConversationEvent.findUnique({ where: { id: eventId } })
      if (event) {
        this.conversationService.publish(job.conversationId, event)
      }
    }
  }

  private leaseUntil(): Date {
    return new Date(Date.now() + WORKFLOW_LEASE_MS)
  }

  private async renewLease(jobId: string): Promise<boolean> {
    const result = await this.prisma.aiWorkflowJob.updateMany({
      where: {
        id: jobId,
        status: AiWorkflowJobStatus.claimed,
        claimedBy: this.workerId,
      },
      data: { leaseExpiresAt: this.leaseUntil() },
    })
    return result.count === 1
  }

  private async hasEarlierNonReplyClaimBlocker(
    tx: Prisma.TransactionClient,
    batch: Pick<AiInputBatch, 'id' | 'conversationId' | 'userMessageEventId'>,
  ): Promise<boolean> {
    const origin = await tx.aiConversationEvent.findUnique({
      where: { id: batch.userMessageEventId },
      select: { sequence: true },
    })
    if (!origin) {
      return false
    }
    const blocking = await tx.aiInputBatch.findFirst({
      where: {
        conversationId: batch.conversationId,
        id: { not: batch.id },
        userMessageEvent: { sequence: { lt: origin.sequence } },
        status: {
          in: [AiInputBatchStatus.waiting_for_materials, AiInputBatchStatus.awaiting_review],
        },
      },
      select: { id: true },
    })
    return blocking != null
  }

  private async ownsClaimedJob(tx: Prisma.TransactionClient, jobId: string): Promise<boolean> {
    const owned = await tx.aiWorkflowJob.findFirst({
      where: {
        id: jobId,
        status: AiWorkflowJobStatus.claimed,
        claimedBy: this.workerId,
      },
      select: { id: true },
    })
    return owned !== null
  }

  private async persistReviewPackage(
    tx: Prisma.TransactionClient,
    job: ClaimedJob,
    reviewPackage: SubmitReviewPackageModelInput,
  ): Promise<string> {
    const task = await tx.aiCreateTask.findFirst({
      where: { id: job.taskId, organizationId: job.organizationId },
      include: {
        draft: true,
        reviewPackages: {
          where: { status: AiReviewPackageStatus.pending },
          take: 1,
        },
      },
    })
    if (!task?.draft) {
      throw new Error('REVIEW_PACKAGE_TASK_MISSING')
    }
    const existing = task.reviewPackages[0]
    if (existing) {
      if (!existing.inputBatchId) {
        await tx.aiReviewPackage.update({
          where: { id: existing.id },
          data: { inputBatchId: job.inputBatchId },
        })
      }
      return existing.id
    }
    if (task.draft.version !== reviewPackage.objectVersion) {
      throw new Error('VERSION_CONFLICT')
    }
    const run = await this.getOrCreateRunningActivityRun(
      tx,
      job.organizationId,
      job.taskId,
      job.inputBatch.creatorUserId,
    )
    const stored = toStoredCandidates(reviewPackage.candidates)
    const created = await tx.aiReviewPackage.create({
      data: {
        organizationId: job.organizationId,
        taskId: job.taskId,
        runId: run.id,
        inputBatchId: job.inputBatchId,
        status: AiReviewPackageStatus.pending,
        confirmationUnit: reviewPackage.confirmationUnit,
        baseObjectVersion: task.draft.version,
        baselineSnapshot: task.draft.snapshot as Prisma.InputJsonValue,
        candidates: stored as unknown as Prisma.InputJsonValue,
        version: 1,
      },
    })
    return created.id
  }
}

function batchStatusForResult(result: HeadlessExecutionResult): AiInputBatchStatus {
  if (result.kind === 'awaiting_user_input') {
    return AiInputBatchStatus.awaiting_user_input
  }
  if (result.kind === 'awaiting_review') {
    return AiInputBatchStatus.awaiting_review
  }
  return AiInputBatchStatus.completed
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}
