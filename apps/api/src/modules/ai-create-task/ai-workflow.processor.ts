import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import {
  AiCollaborationError,
  type HeadlessExecutionResult,
} from '@xiaotuanbao/ai-contracts'
import {
  AiAgentAttemptStatus,
  AiConversationEventKind,
  AiCreateActivityRunStatus,
  AiInputBatchStatus,
  AiWorkflowJobStatus,
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
import { buildPlaintextContextManifest } from './ai-context-manifest'
import { AiConversationService } from './ai-conversation.service'
import { WORKFLOW_LEASE_MS, WORKFLOW_MAX_ATTEMPTS } from './ai-conversation.constants'
import { isAiCreateAssistEnabledForUser } from './ai-create-assist-access'
import { lockAiCreateTask } from './ai-create-task.lock'
import { AiHeadlessClient } from './ai-headless.client'

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
  ) {}

  async processDueJobs(limit = 10): Promise<number> {
    let processed = 0
    for (let index = 0; index < limit; index += 1) {
      const claimed = await this.claimNext()
      if (!claimed) {
        break
      }
      await this.executeClaimed(claimed)
      processed += 1
    }
    return processed
  }

  private async claimNext(): Promise<ClaimedJob | null> {
    try {
      const published: { conversationId: string; eventId: string }[] = []
      const claimed = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT j.id
          FROM ai_workflow_jobs j
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
              FROM ai_input_batches b
              WHERE b.task_id = j.task_id
                AND b.status = 'agent_running'::ai_input_batch_status
                AND b.id <> j.input_batch_id
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
    const task = await this.prisma.aiCreateTask.findUniqueOrThrow({
      where: { id: job.taskId },
      include: { draft: true },
    })
    if (!task.draft) {
      throw new Error('发团创建草稿不存在')
    }
    const userText = (
      userEvent.payload && typeof userEvent.payload === 'object' && 'text' in userEvent.payload
        ? String((userEvent.payload as { text: unknown }).text ?? '')
        : ''
    ).trim()
    if (!userText) {
      throw new Error('输入批次缺少 User 原文')
    }
    const modelId =
      this.configService.get<string>('app.aiCreateAssist.modelId')?.trim() || 'deterministic'
    const manifestRecord = buildPlaintextContextManifest({
      conversationId: job.conversationId,
      inputBatchId: job.inputBatchId,
      conversationVersion: job.inputBatch.conversationVersion,
      eventSequences: [userEvent.sequence],
      userText,
      businessSnapshotVersion: task.draft.version,
      modelId,
    })

    const prepared = await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, job.organizationId, job.taskId)
      const run = await this.getOrCreateRunningActivityRun(
        tx,
        job.organizationId,
        job.taskId,
        job.inputBatch.creatorUserId,
      )
      const manifest = await tx.aiContextManifest.create({
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
        userText,
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
            ? result.question
            : '已提交待审核建议，请在中间表单确认。'

      const agentEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.agent_message,
        payload: { text: message, batchId: job.inputBatchId, attemptId },
      })
      published.push(agentEvent.id)

      const statusEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.batch_status,
        payload: { batchId: job.inputBatchId, status: batchStatus, attemptId },
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
