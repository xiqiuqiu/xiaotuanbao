import { randomUUID } from 'node:crypto'
import { Injectable, Inject, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import {
  AI_CREATE_AGENT_DEFINITION_REF,
  AI_CREATE_AGENT_CAPABILITY_DECLARATION,
  CONVERSATION_GENERAL_AGENT_CAPABILITY_DECLARATION,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_INSTRUCTIONS,
  CONVERSATION_RECALL_TOOL_NAMES,
  aiCreateCapabilityDefinitionForTool,
  aiCreateCapabilityDefinitionRegistry,
  conversationGeneralCapabilityDefinitionRegistry,
  AiCollaborationError,
  capabilityGrantResolver,
  capabilitiesForPendingReview,
  requestContextSchema,
  TOKEN_LIMITER_PROCESSOR_VERSION,
  type HeadlessExecutionResult,
  type RequestContext,
  type VersionedDefinitionRef,
  versionedDefinitionRefSchema,
  type SubmitReviewPackageModelInput,
} from '@xiaotuanbao/ai-contracts'
import {
  AgentTaskStatus,
  AiAgentAttemptStatus,
  AiConversationEventKind,
  AiConversationInteractionStatus,
  AiInputBatchStatus,
  AiReviewPackageStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  InputBatchTaskRole,
  OrganizationStatus,
  TaskActivityKind,
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
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import { createPrismaAiActionStore } from '../ai-action/ai-action.prisma.store'
import { createPrismaAiActionTargetAuthority } from '../ai-action/ai-action.prisma.target-authority'
import { AuthService } from '../auth/auth.service'
import {
  buildContextManifest,
  eventSequencesForModelInput,
  excerptDigestsFor,
  isConfirmedReviewContinuation,
  resolveAttemptUserText,
} from './ai-context-manifest'
import { buildBudgetedContext } from './ai-context-budget'
import { resolvePreparedProjection } from './ai-context-compaction'
import { resolveModelCurrentInput, userMessageSourceOrigin, withSourceIndexTruncation } from './ai-context-source-index'
import { markBatchAgentRunningAfterAttempt } from './ai-workflow.agent-running'
import { workflowErrorCode } from './ai-workflow-error'
import { AiConversationService } from './ai-conversation.service'
import {
  CONVERSATION_GENERAL_SYSTEM_PROMPT_VERSION,
  CONVERSATION_GENERAL_TOOL_SCHEMA_VERSION,
  WORKFLOW_AGENT_CONCURRENCY,
  WORKFLOW_HEARTBEAT_MS,
  WORKFLOW_LEASE_MS,
  WORKFLOW_MAX_ATTEMPTS,
  WORKFLOW_PARSE_CONCURRENCY,
  isImmediateWorkflowFailure,
  workflowBackoffMs,
} from './ai-conversation.constants'
import { isAiCreateAssistEnabledForUser } from './ai-create-assist-access'
import { isOpenAgentTaskStatus } from './agent-task.runtime'
import {
  AgentExecutionRouter,
  type AgentExecutionRoute,
  type FrozenAgentAssociation,
} from './agent-execution-router'
import { lockConversationRuntime } from './ai-create-task.lock'
import { isFailedDependency, toFailedMaterialPayload } from './ai-conversation.mapper'
import { responseSchemaFor } from './ai-conversation.interaction'
import { AiHeadlessClient } from './ai-headless.client'
import {
  AGENT_LIVE_OUTPUT,
  type AgentLiveOutput,
} from './agent-live-output'
import { LiveOutputFlusher } from './live-output-flusher'
import { AiToolWorkerAdapter } from './ai-tool-worker.adapter'
import { DepartureMaterialService } from './departure-material.service'
import { PageLocatorResolver, type ResolvedPageContext } from './page-locator.resolver'
import {
  PARSE_FAILED_ERROR_CODE,
  materialProgressFromDeps,
  parseErrorMessage,
} from './departure-material.constants'
import { attemptDiagnosticUpdate, manifestUsageUpdate } from './attempt-diagnostic'
import { loadEvidenceAuthority } from './evidence-authority'
import { requireValidReviewProposal } from './review-proposal.commit'
import { projectPendingReviewPackage } from './review-package.projection'

type ClaimedJob = AiWorkflowJob & { inputBatch: AiInputBatch }

@Injectable()
export class AiWorkflowProcessor {
  private readonly logger = new Logger(AiWorkflowProcessor.name)
  private readonly workerId = process.env.HOSTNAME?.trim() || `worker-${randomUUID()}`
  private parseInFlight = 0
  private agentInFlight = 0
  private readonly executionRouter = new AgentExecutionRouter()

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly conversationService: AiConversationService,
    private readonly headlessClient: AiHeadlessClient,
    private readonly materialService: DepartureMaterialService,
    private readonly pageLocatorResolver: PageLocatorResolver,
    @Inject(AGENT_LIVE_OUTPUT) private readonly liveOutput: AgentLiveOutput,
  ) {}

  async processDueJobs(limit = 10): Promise<number> {
    let processed = 0
    const running = new Map<string, Promise<void>>()

    const startJob = (claimed: ClaimedJob) => {
      const jobId = claimed.id
      const isParse = claimed.type === AiWorkflowJobType.material_parse
      if (isParse) {
        this.parseInFlight += 1
      } else {
        this.agentInFlight += 1
      }
      this.workflowLog('claimed', {
        job: jobId,
        type: claimed.type,
        attempt: claimed.attemptCount,
        queuedMs: Math.max(
          0,
          Date.now() - (claimed.nextAttemptAt ?? claimed.createdAt).getTime(),
        ),
        inFlightParse: this.parseInFlight,
        inFlightAgent: this.agentInFlight,
      })
      const task = this.executeClaimed(claimed)
        .catch((error: unknown) => {
          this.logger.error(`workflow execute failed job=${jobId}: ${String(error)}`)
        })
        .finally(() => {
          if (isParse) {
            this.parseInFlight -= 1
          } else {
            this.agentInFlight -= 1
          }
          running.delete(jobId)
          processed += 1
        })
      running.set(jobId, task)
    }

    const fill = async () => {
      while (processed + running.size < limit) {
        let started = false
        if (
          this.parseInFlight < this.parseConcurrency() &&
          processed + running.size < limit
        ) {
          const parseJob = await this.claimNextParse()
          if (parseJob) {
            startJob(parseJob)
            started = true
          }
        }
        if (
          this.agentInFlight < this.agentConcurrency() &&
          processed + running.size < limit
        ) {
          const agentJob = await this.claimNextAgent()
          if (agentJob) {
            startJob(agentJob)
            started = true
          }
        }
        if (!started) {
          break
        }
      }
    }

    await fill()
    while (running.size > 0) {
      await Promise.race(running.values())
      await fill()
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
        if (job.status === AiWorkflowJobStatus.claimed) {
          this.workflowLog('recovered', {
            job: job.id,
            type: job.type,
            previousWorker: job.claimedBy,
            attempt: job.attemptCount + 1,
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
            generation: { increment: 1 },
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
              WHERE running.conversation_id = j.conversation_id
                AND running.status IN (
                  'agent_running'::ai_input_batch_status,
                  'preparing_context'::ai_input_batch_status
                )
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
                    'ready_for_agent'::ai_input_batch_status,
                    'preparing_context'::ai_input_batch_status
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
        await lockConversationRuntime(tx, job.organizationId, job.conversationId)
        const running = await tx.aiInputBatch.findFirst({
          where: {
            conversationId: job.conversationId,
            status: {
              in: [AiInputBatchStatus.agent_running, AiInputBatchStatus.preparing_context],
            },
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
          this.workflowLog('recovered', {
            job: job.id,
            type: job.type,
            previousWorker: job.claimedBy,
            attempt: job.attemptCount + 1,
          })
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
            generation: { increment: 1 },
          },
        })
        let batchStatus = job.inputBatch.status
        // 压缩在 prepareAttempt 内同步完成；认领时先进入 preparing_context，
        // 使租约过期后的跨 Worker 续跑与槽位占用把「整理上下文」视同在途。
        if (job.inputBatch.status === AiInputBatchStatus.ready_for_agent) {
          await tx.aiInputBatch.update({
            where: { id: job.inputBatchId },
            data: { status: AiInputBatchStatus.preparing_context },
          })
          const statusEvent = await this.conversationService.appendEvent(tx, {
            organizationId: job.organizationId,
            conversationId: job.conversationId,
            kind: AiConversationEventKind.batch_status,
            payload: { batchId: job.inputBatchId, status: AiInputBatchStatus.preparing_context },
          })
          published.push({ conversationId: job.conversationId, eventId: statusEvent.id })
          batchStatus = AiInputBatchStatus.preparing_context
        }
        return {
          ...job,
          ...claimedJob,
          inputBatch: { ...job.inputBatch, status: batchStatus },
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
    const startedAt = Date.now()
    if (job.type === AiWorkflowJobType.material_parse) {
      await this.executeParse(job)
      return
    }
    if (job.attemptCount > WORKFLOW_MAX_ATTEMPTS) {
      await this.persistFailure(job, 'AGENT_UNAVAILABLE')
      this.workflowLog('failed', {
        job: job.id,
        type: job.type,
        reason: 'AGENT_UNAVAILABLE',
        attempt: job.attemptCount,
      })
      return
    }

    try {
      const routing = await this.resolveExecutionRoute(job)
      if (routing.route.kind !== 'execution_definition') {
        throw new Error(`尚未实现的 Agent 执行路由结果: ${routing.route.kind}`)
      }
      const executionRoute = routing.route
      const routedJob = executionRoute.taskId
        ? { ...job, taskId: executionRoute.taskId }
        : job
      const authorized = await this.recheckAuthorization(routedJob, executionRoute)
      if (!authorized.ok) {
        await this.persistFailure(routedJob, authorized.errorCode)
        this.workflowLog('failed', {
          job: job.id,
          type: job.type,
          reason: authorized.errorCode,
          attempt: job.attemptCount,
        })
        return
      }

      // Attempt 与 batch_status:agent_running 在同一事务提交后，才开启模型流。
      const prepared = await this.prepareAttempt(
        routedJob,
        authorized.permissionKeys,
        executionRoute,
        routing.pageAttachment,
      )
      await this.liveOutput.supersede(job.conversationId, prepared.attemptId)
      this.workflowLog('agent_started', {
        job: job.id,
        attemptId: prepared.attemptId,
        agentDefinition: definitionRefLog(prepared.requestContext.agentDefinition),
        capabilities: capabilityRefsLog(prepared.requestContext.grantedCapabilities),
      })
      const flusher = new LiveOutputFlusher(this.liveOutput, {
        attemptId: prepared.attemptId,
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        batchId: job.inputBatchId,
        generation: job.generation,
      })
      try {
        const renewed = await this.renewLease(job.id)
        if (!renewed) {
          return
        }
        const result = await this.withHeartbeat(job.id, async () => {
          const outcome = await this.headlessClient.run(
            prepared.request,
            prepared.delegationToken,
            {
              onPublicText: (text) => {
                flusher.push({ text })
              },
              onReasoningText: (reasoningText) => {
                flusher.push({ reasoningText })
              },
            },
          )
          await flusher.flush()
          await this.persistOutcome(routedJob, executionRoute, prepared.attemptId, outcome)
          return outcome
        })
        if (result.kind === 'failed') {
          return
        }
        this.workflowLog('agent_done', {
          job: job.id,
          durationMs: Date.now() - startedAt,
          attempt: job.attemptCount,
          result: result.kind,
          agentDefinition: definitionRefLog(prepared.requestContext.agentDefinition),
          capabilities: capabilityRefsLog(prepared.requestContext.grantedCapabilities),
        })
      } finally {
        flusher.dispose()
        try {
          await this.liveOutput.clear(prepared.attemptId)
        } catch (error: unknown) {
          this.logger.warn(`清除即时输出失败 attempt=${prepared.attemptId}: ${String(error)}`)
        }
      }
    } catch (error) {
      const errorCode = workflowErrorCode(error)
      this.logger.warn(`Agent 批次执行失败 job=${job.id}: ${String(error)}`)
      if (isImmediateWorkflowFailure(errorCode) || !isTransientWorkflowError(error)) {
        await this.persistFailure(job, errorCode)
        this.workflowLog('failed', {
          job: job.id,
          type: job.type,
          reason: errorCode,
          attempt: job.attemptCount,
        })
        return
      }
      await this.scheduleRetry(job, errorCode)
    }
  }

  private async executeParse(job: ClaimedJob): Promise<void> {
    const startedAt = Date.now()
    if (job.attemptCount > WORKFLOW_MAX_ATTEMPTS) {
      if (job.sourceId) {
        await this.materialService.markParseTerminalFailure(job.sourceId)
      }
      await this.persistParseBarrierFailure(job, PARSE_FAILED_ERROR_CODE)
      this.workflowLog('failed', {
        job: job.id,
        type: job.type,
        reason: PARSE_FAILED_ERROR_CODE,
        attempt: job.attemptCount,
      })
      return
    }
    if (!(await this.organizationUsable(job.organizationId))) {
      if (job.sourceId) {
        await this.materialService.markParseTerminalFailure(job.sourceId)
      }
      await this.persistParseBarrierFailure(job, 'PERMISSION_DENIED')
      this.workflowLog('failed', {
        job: job.id,
        type: job.type,
        reason: 'PERMISSION_DENIED',
        attempt: job.attemptCount,
      })
      return
    }
    try {
      const completed = await this.withHeartbeat(job.id, async () => {
        const parsed = await this.materialService.executeParseJob(job)
        if (!parsed) {
          return false
        }
        const batchIds = await this.materialService.pinSourceVersion(
          parsed.sourceId,
          parsed.parseVersion,
          parsed.contentDigest,
        )
        for (const batchId of batchIds) {
          const published = await this.prisma.$transaction(async (tx) => {
            const batch = await tx.aiInputBatch.findUnique({ where: { id: batchId } })
            if (!batch) {
              return []
            }
            await lockConversationRuntime(tx, batch.organizationId, batch.conversationId)
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
        return true
      })
      if (!completed) {
        await this.persistParseBarrierFailure(job, PARSE_FAILED_ERROR_CODE)
        this.workflowLog('failed', {
          job: job.id,
          type: job.type,
          reason: PARSE_FAILED_ERROR_CODE,
          attempt: job.attemptCount,
        })
        return
      }
      this.workflowLog('parse_done', {
        job: job.id,
        durationMs: Date.now() - startedAt,
        attempt: job.attemptCount,
      })
    } catch (error) {
      this.logger.warn(`资料解析失败 job=${job.id}: ${String(error)}`)
      if (!isTransientWorkflowError(error)) {
        if (job.sourceId) {
          await this.materialService.markParseTerminalFailure(job.sourceId)
        }
        await this.persistParseBarrierFailure(job, PARSE_FAILED_ERROR_CODE)
        this.workflowLog('failed', {
          job: job.id,
          type: job.type,
          reason: PARSE_FAILED_ERROR_CODE,
          attempt: job.attemptCount,
        })
        return
      }
      await this.scheduleRetry(job, 'PARSE_UNAVAILABLE')
    }
  }

  private async recheckAuthorization(
    job: ClaimedJob,
    route: Extract<AgentExecutionRoute, { kind: 'execution_definition' }>,
  ): Promise<{ ok: true; permissionKeys: string[] } | { ok: false; errorCode: string }> {
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
    if (route.agentDefinition.key === CONVERSATION_GENERAL_AGENT_DEFINITION_REF.key) {
      return { ok: true, permissionKeys: [] }
    }
    if (!job.taskId || route.agentDefinition.key !== AI_CREATE_AGENT_DEFINITION_REF.key) {
      return { ok: false, errorCode: 'PERMISSION_DENIED' }
    }
    if (!isAiCreateAssistEnabledForUser(this.configService, user.id)) {
      return { ok: false, errorCode: 'PERMISSION_DENIED' }
    }
    const permissionKeys = await this.authService.getPermissionKeysForUser(user.id)
    if (!permissionKeys.includes('departure:write')) {
      return { ok: false, errorCode: 'PERMISSION_DENIED' }
    }
    return { ok: true, permissionKeys }
  }

  private async resolveExecutionRoute(job: ClaimedJob): Promise<{
    route: AgentExecutionRoute
    pageAttachment?: ResolvedPageContext
  }> {
    const [pageAttachment, taskLinks, interaction, versionEvent] = await Promise.all([
      this.pageLocatorResolver.resolve(
        job.organizationId,
        job.inputBatch.creatorUserId,
        job.inputBatch.pageLocator,
      ),
      this.prisma.inputBatchTaskLink.findMany({
        where: { inputBatchId: job.inputBatchId, organizationId: job.organizationId },
        select: { taskId: true, role: true, task: { select: { type: true } } },
      }),
      job.inputBatch.replyToEventId
        ? this.prisma.aiConversationInteraction.findUnique({
            where: { eventId: job.inputBatch.replyToEventId },
            select: {
              id: true,
              inputBatch: {
                select: {
                  agentAttempts: {
                    orderBy: { startedAt: 'desc' },
                    take: 1,
                    select: {
                      taskId: true,
                      agentDefinitionKey: true,
                      agentDefinitionVersion: true,
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve(null),
      this.prisma.aiConversationEvent.findFirst({
        where: {
          conversationId: job.conversationId,
          organizationId: job.organizationId,
          sequence: job.inputBatch.conversationVersion,
        },
        select: { payload: true },
      }),
    ])
    const reviewPackageId = stringField(versionEvent?.payload, 'reviewPackageId')
    const reviewPackage = reviewPackageId
      ? await this.prisma.aiReviewPackage.findFirst({
          where: { id: reviewPackageId, organizationId: job.organizationId },
          select: {
            id: true,
            taskId: true,
            attempt: {
              select: { agentDefinitionKey: true, agentDefinitionVersion: true },
            },
          },
        })
      : null
    const interactionAttempt = interaction?.inputBatch.agentAttempts[0]
    const interactionAssociation = interactionAttempt
      ? frozenAssociation(interaction.id, interactionAttempt, interactionAttempt.taskId)
      : undefined
    const reviewAssociation = reviewPackage?.attempt
      ? frozenAssociation(reviewPackage.id, reviewPackage.attempt, reviewPackage.taskId)
      : undefined

    return {
      route: this.executionRouter.route({
        associations: {
          ...(interactionAssociation ? { interaction: interactionAssociation } : {}),
          ...(reviewAssociation ? { reviewPackage: reviewAssociation } : {}),
          taskRefs: taskLinks
            .filter(
              (link) =>
                link.role === InputBatchTaskRole.primary ||
                link.role === InputBatchTaskRole.created,
            )
            .map((link) => ({
              taskId: link.taskId,
              role: link.role,
              taskType: link.task.type,
            })),
        },
        ...(pageAttachment ? { pageAttachment } : {}),
      }),
      ...(pageAttachment ? { pageAttachment } : {}),
    }
  }

  private async prepareAttempt(
    job: ClaimedJob,
    permissionKeys: readonly string[],
    route: Extract<AgentExecutionRoute, { kind: 'execution_definition' }>,
    pageAttachment?: ResolvedPageContext,
  ): Promise<{
    request: {
      taskId?: string
      conversationId: string
      inputBatchId: string
      attemptId: string
      contextManifestId: string
      userText: string
      userTextSha256: string
    }
    attemptId: string
    delegationToken: string
    requestContext: RequestContext
  }> {
    if (route.agentDefinition.key === CONVERSATION_GENERAL_AGENT_DEFINITION_REF.key) {
      return this.prepareTasklessAttempt(job, pageAttachment)
    }
    if (route.agentDefinition.key !== AI_CREATE_AGENT_DEFINITION_REF.key || !job.taskId) {
      throw new Error(`不支持的 Agent 执行定义: ${definitionRefLog(route.agentDefinition)}`)
    }
    const taskId = job.taskId
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
    const originalUserText = (
      userEvent.payload && typeof userEvent.payload === 'object' && 'text' in userEvent.payload
        ? String((userEvent.payload as { text: unknown }).text ?? '')
        : ''
    ).trim()
    const userText = resolveAttemptUserText(originalUserText, versionEvent).trim()
    const confirmedReviewContinuation = isConfirmedReviewContinuation(versionEvent)
    if (!userText) {
      throw new Error('输入批次缺少 User 原文')
    }
    const modelId =
      this.configService.get<string>('app.aiCreateAssist.modelId')?.trim() || 'deterministic'
    const pinnedSources = await this.prisma.inputBatchSource.findMany({
      where: {
        inputBatchId: job.inputBatchId,
        required: true,
        parseVersion: { not: null },
      },
      select: { sourceId: true, parseVersion: true, contentDigest: true },
    })
    const materialVersions = pinnedSources.map((item) => ({
      materialId: item.sourceId,
      parseResultVersion: item.parseVersion as number,
    }))
    const sourceVersions = pinnedSources.map((item) => ({
      sourceId: item.sourceId,
      parseVersion: item.parseVersion as number,
      contentDigest: item.contentDigest ?? '',
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
    const published: { conversationId: string; eventId: string }[] = []
    const prepared = await this.prisma.$transaction(async (tx) => {
      await lockConversationRuntime(tx, job.organizationId, job.conversationId)
      const task = await tx.aiCreateTask.findUniqueOrThrow({
        where: { id: taskId },
        include: { draft: true, agentTask: true },
      })
      if (!task.draft) {
        throw new Error('发团创建草稿不存在')
      }
      const draft = task.draft
      const pendingReview = await tx.aiReviewPackage.findFirst({
        where: {
          organizationId: job.organizationId,
          conversationId: job.conversationId,
          status: AiReviewPackageStatus.pending,
        },
        select: { id: true },
      })
      const availableToolNames = capabilitiesForPendingReview(pendingReview != null)
      const preparedProjection = await resolvePreparedProjection(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        conversationVersion: job.inputBatch.conversationVersion,
        originUserMessageSequence: userEvent.sequence,
        currentUserMessageSequence: confirmedReviewContinuation ? undefined : userEvent.sequence,
        events: historyEvents,
        materials: parseIndex.materials,
        materialTruncationReasons: parseIndex.truncationReasons,
        currentUserText: userText,
        businessFacts: {
          taskId: task.id,
          status: task.agentTask.status,
          currentPhase: task.currentPhase,
          objectVersion: draft.version,
          snapshot: draft.snapshot,
        },
        unresolvedState: {
          hasPendingReview: pendingReview != null,
          reviewPackageId: pendingReview?.id ?? null,
        },
        modelId,
        toolNames: availableToolNames,
      })
      const modelInput = await resolveModelCurrentInput(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        origin: userMessageSourceOrigin(job.conversationId, userEvent),
        originalText: userText,
        plan: preparedProjection.plan,
      })
      const budgetedContext = buildBudgetedContext({
        modelId,
        toolNames: availableToolNames,
        currentUserText: modelInput.currentUserText,
        businessFacts: {
          taskId: task.id,
          status: task.agentTask.status,
          currentPhase: task.currentPhase,
          objectVersion: draft.version,
          snapshot: draft.snapshot,
        },
        unresolvedState: {
          hasPendingReview: pendingReview != null,
          reviewPackageId: pendingReview?.id ?? null,
        },
        projection: withSourceIndexTruncation(
          preparedProjection.projection,
          modelInput.truncationReasons,
        ),
      })
      const excerptDigests = excerptDigestsFor(
        budgetedContext.projection.pinnedMaterials,
      )
      const manifestRecord = buildContextManifest({
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        conversationVersion: job.inputBatch.conversationVersion,
        eventSequences: eventSequencesForModelInput(
          budgetedContext.projection.recentTail,
          confirmedReviewContinuation
            ? job.inputBatch.conversationVersion
            : userEvent.sequence,
        ),
        businessSnapshotVersion: draft.version,
        taskRefs: [
          {
            taskId,
            role: 'primary',
            goalVersion: task.agentTask.goalVersion,
            statusVersion: task.agentTask.statusVersion,
          },
        ],
        modelId,
        materialVersions,
        sourceVersions,
        excerptDigests,
        truncationReasons: budgetedContext.truncationReasons,
        inputHash: budgetedContext.inputHash,
        budget: budgetedContext.budget,
        sections: budgetedContext.sections,
        summaryVersion: preparedProjection.summaryVersion,
        sourceIndexVersion: modelInput.sourceIndexVersion,
      })
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
              taskId,
              conversationId: job.conversationId,
              inputBatchId: job.inputBatchId,
              conversationVersion: manifestRecord.conversationVersion,
              eventSequences: manifestRecord.eventSequences,
              businessSnapshotVersion: manifestRecord.businessSnapshotVersion,
              taskRefs: manifestRecord.taskRefs,
              builderVersion: manifestRecord.builderVersion,
              systemPromptVersion: manifestRecord.systemPromptVersion,
              toolSchemaVersion: manifestRecord.toolSchemaVersion,
              modelId: manifestRecord.modelId,
              inputHash: manifestRecord.inputHash,
              truncationReasons: manifestRecord.truncationReasons,
              materialVersions,
              sourceVersions,
              summaryVersion: preparedProjection.summaryVersion,
              sourceIndexVersion: modelInput.sourceIndexVersion,
              excerptDigests: JSON.parse(JSON.stringify(manifestRecord.excerptDigests)) as Prisma.InputJsonValue,
              budget: JSON.parse(JSON.stringify(manifestRecord.budget)) as Prisma.InputJsonValue,
              sections: JSON.parse(JSON.stringify(manifestRecord.sections)) as Prisma.InputJsonValue,
              processorVersion: TOKEN_LIMITER_PROCESSOR_VERSION,
            },
          })
      const attempt = await tx.aiAgentAttempt.create({
        data: {
          organizationId: job.organizationId,
          taskId,
          conversationId: job.conversationId,
          inputBatchId: job.inputBatchId,
          jobId: job.id,
          contextManifestId: manifest.id,
          agentDefinitionKey: AI_CREATE_AGENT_DEFINITION_REF.key,
          agentDefinitionVersion: AI_CREATE_AGENT_DEFINITION_REF.version,
          grantedCapabilities: [],
          generation: job.generation,
          status: AiAgentAttemptStatus.running,
        },
      })
      const unresolvedContext = requestContextSchema.parse({
        organizationId: job.organizationId,
        userId: job.inputBatch.creatorUserId,
        taskId,
        runId: attempt.id,
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        attemptId: attempt.id,
        contextManifestId: manifest.id,
        agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
        entitlementStatus: 'unavailable',
        objectScopes: [
          { organizationId: job.organizationId, kind: 'ai_create_task', id: taskId },
        ],
      })
      const grants = capabilityGrantResolver.resolve({
        agentDefinition: AI_CREATE_AGENT_CAPABILITY_DECLARATION,
        capabilities: aiCreateCapabilityDefinitionRegistry,
        requestContext: unresolvedContext,
        user: { organizationId: job.organizationId, permissionKeys },
        entitlements: { status: 'unavailable' },
        riskPolicy: { allowedRisks: ['low', 'medium'] },
        availableCapabilities: availableToolNames.flatMap(
          (toolName) => {
            const definition = aiCreateCapabilityDefinitionForTool(toolName)
            return definition ? [{ key: definition.key, version: definition.version }] : []
          },
        ),
      })
      const requestContext = requestContextSchema.parse({
        ...unresolvedContext,
        grantedCapabilities: grants.granted,
        entitlementStatus: grants.entitlementStatus,
      })
      await tx.aiAgentAttempt.update({
        where: { id: attempt.id },
        data: { grantedCapabilities: grants.granted },
      })
      await this.appendAgentRunningStatus(tx, job, attempt, published)
      return {
        runId: attempt.id,
        attemptId: attempt.id,
        contextManifestId: manifest.id,
        requestContext,
        userText: budgetedContext.userText,
        userTextSha256: budgetedContext.userTextSha256,
      }
    })

    for (const item of published) {
      const event = await this.prisma.aiConversationEvent.findUnique({
        where: { id: item.eventId },
      })
      if (event) {
        this.conversationService.publish(item.conversationId, event)
      }
    }

    const ttlSec = this.configService.get<number>('app.aiCreateAssist.delegationTtlSec') ?? 600
    const payload: AiOperationDelegationPayload = {
      typ: AI_OP_DELEGATION_JWT_TYP,
      sub: job.inputBatch.creatorUserId,
      organizationId: job.organizationId,
      taskId,
      runId: prepared.runId,
      conversationId: job.conversationId,
      inputBatchId: job.inputBatchId,
      attemptId: prepared.attemptId,
      contextManifestId: prepared.contextManifestId,
      agentDefinition: prepared.requestContext.agentDefinition,
      grantedCapabilities: prepared.requestContext.grantedCapabilities,
      entitlementStatus: prepared.requestContext.entitlementStatus,
      objectScopes: prepared.requestContext.objectScopes,
    }
    const delegationToken = await this.jwtService.signAsync(payload, {
      expiresIn: ttlSec,
      secret: this.configService.getOrThrow<string>('app.jwtDelegationSecret'),
      audience: AI_OP_DELEGATION_JWT_AUD,
    })

    return {
      request: {
        taskId,
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        attemptId: prepared.attemptId,
        contextManifestId: prepared.contextManifestId,
        userText: prepared.userText,
        userTextSha256: prepared.userTextSha256,
      },
      attemptId: prepared.attemptId,
      delegationToken,
      requestContext: prepared.requestContext,
    }
  }

  private async prepareTasklessAttempt(
    job: ClaimedJob,
    pageContext?: ResolvedPageContext,
  ): Promise<{
    request: {
      conversationId: string
      inputBatchId: string
      attemptId: string
      contextManifestId: string
      userText: string
      userTextSha256: string
    }
    attemptId: string
    delegationToken: string
    requestContext: RequestContext
  }> {
    const userEvent = await this.prisma.aiConversationEvent.findUniqueOrThrow({
      where: { id: job.inputBatch.userMessageEventId },
    })
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
    const historyEvents = await this.prisma.aiConversationEvent.findMany({
      where: {
        conversationId: job.conversationId,
        organizationId: job.organizationId,
        sequence: { lte: job.inputBatch.conversationVersion },
      },
      orderBy: { sequence: 'asc' },
      select: { sequence: true, kind: true, payload: true },
    })
    const parseIndex = await this.materialService.loadPinnedParseIndex(
      job.organizationId,
      job.inputBatchId,
    )
    const pinnedSources = await this.prisma.inputBatchSource.findMany({
      where: {
        inputBatchId: job.inputBatchId,
        required: true,
        parseVersion: { not: null },
      },
      select: { sourceId: true, parseVersion: true, contentDigest: true },
    })
    const materialVersions = pinnedSources.map((item) => ({
      materialId: item.sourceId,
      parseResultVersion: item.parseVersion as number,
    }))
    const sourceVersions = pinnedSources.map((item) => ({
      sourceId: item.sourceId,
      parseVersion: item.parseVersion as number,
      contentDigest: item.contentDigest ?? '',
    }))
    const published: { conversationId: string; eventId: string }[] = []
    const prepared = await this.prisma.$transaction(async (tx) => {
      await lockConversationRuntime(tx, job.organizationId, job.conversationId)
      const businessFacts = pageContext
        ? { conversationId: job.conversationId, page: pageContext.facts }
        : { conversationId: job.conversationId }
      const preparedProjection = await resolvePreparedProjection(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        conversationVersion: job.inputBatch.conversationVersion,
        originUserMessageSequence: userEvent.sequence,
        currentUserMessageSequence: userEvent.sequence,
        events: historyEvents,
        materials: parseIndex.materials,
        materialTruncationReasons: parseIndex.truncationReasons,
        currentUserText: userText,
        businessFacts,
        unresolvedState: { hasPendingReview: false, reviewPackageId: null },
        modelId,
        toolNames: CONVERSATION_RECALL_TOOL_NAMES,
        systemInstructions: CONVERSATION_GENERAL_INSTRUCTIONS,
        systemPromptVersion: CONVERSATION_GENERAL_SYSTEM_PROMPT_VERSION,
        toolSchemaVersion: CONVERSATION_GENERAL_TOOL_SCHEMA_VERSION,
      })
      const modelInput = await resolveModelCurrentInput(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        origin: userMessageSourceOrigin(job.conversationId, userEvent),
        originalText: userText,
        plan: preparedProjection.plan,
      })
      const budgetedContext = buildBudgetedContext({
        modelId,
        toolNames: CONVERSATION_RECALL_TOOL_NAMES,
        systemInstructions: CONVERSATION_GENERAL_INSTRUCTIONS,
        systemPromptVersion: CONVERSATION_GENERAL_SYSTEM_PROMPT_VERSION,
        toolSchemaVersion: CONVERSATION_GENERAL_TOOL_SCHEMA_VERSION,
        currentUserText: modelInput.currentUserText,
        businessFacts,
        unresolvedState: { hasPendingReview: false, reviewPackageId: null },
        projection: withSourceIndexTruncation(
          preparedProjection.projection,
          modelInput.truncationReasons,
        ),
      })
      const manifestRecord = buildContextManifest({
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        conversationVersion: job.inputBatch.conversationVersion,
        eventSequences: eventSequencesForModelInput(
          budgetedContext.projection.recentTail,
          userEvent.sequence,
        ),
        businessSnapshotVersion: pageContext?.objectVersion ?? 0,
        taskRefs: [],
        modelId,
        materialVersions,
        sourceVersions,
        excerptDigests: excerptDigestsFor(budgetedContext.projection.pinnedMaterials),
        truncationReasons: budgetedContext.truncationReasons,
        inputHash: budgetedContext.inputHash,
        budget: budgetedContext.budget,
        sections: budgetedContext.sections,
        summaryVersion: preparedProjection.summaryVersion,
        sourceIndexVersion: modelInput.sourceIndexVersion,
      })
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
              conversationId: job.conversationId,
              inputBatchId: job.inputBatchId,
              conversationVersion: manifestRecord.conversationVersion,
              eventSequences: manifestRecord.eventSequences,
              businessSnapshotVersion: manifestRecord.businessSnapshotVersion,
              taskRefs: manifestRecord.taskRefs,
              builderVersion: manifestRecord.builderVersion,
              systemPromptVersion: manifestRecord.systemPromptVersion,
              toolSchemaVersion: manifestRecord.toolSchemaVersion,
              modelId: manifestRecord.modelId,
              inputHash: manifestRecord.inputHash,
              truncationReasons: manifestRecord.truncationReasons,
              materialVersions,
              sourceVersions,
              summaryVersion: preparedProjection.summaryVersion,
              sourceIndexVersion: modelInput.sourceIndexVersion,
              excerptDigests: [],
              budget: JSON.parse(JSON.stringify(manifestRecord.budget)) as Prisma.InputJsonValue,
              sections: JSON.parse(JSON.stringify(manifestRecord.sections)) as Prisma.InputJsonValue,
              processorVersion: TOKEN_LIMITER_PROCESSOR_VERSION,
            },
          })
      const attempt = await tx.aiAgentAttempt.create({
        data: {
          organizationId: job.organizationId,
          conversationId: job.conversationId,
          inputBatchId: job.inputBatchId,
          jobId: job.id,
          contextManifestId: manifest.id,
          agentDefinitionKey: CONVERSATION_GENERAL_AGENT_DEFINITION_REF.key,
          agentDefinitionVersion: CONVERSATION_GENERAL_AGENT_DEFINITION_REF.version,
          grantedCapabilities: [],
          generation: job.generation,
          status: AiAgentAttemptStatus.running,
        },
      })
      const unresolvedContext = requestContextSchema.parse({
        organizationId: job.organizationId,
        userId: job.inputBatch.creatorUserId,
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        attemptId: attempt.id,
        contextManifestId: manifest.id,
        agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
        entitlementStatus: 'unavailable',
        objectScopes: [
          {
            organizationId: job.organizationId,
            kind: 'agent_conversation',
            id: job.conversationId,
          },
        ],
      })
      const grants = capabilityGrantResolver.resolve({
        agentDefinition: CONVERSATION_GENERAL_AGENT_CAPABILITY_DECLARATION,
        capabilities: conversationGeneralCapabilityDefinitionRegistry,
        requestContext: unresolvedContext,
        user: { organizationId: job.organizationId, permissionKeys: [] },
        entitlements: { status: 'unavailable' },
        riskPolicy: { allowedRisks: ['low'] },
      })
      const requestContext = requestContextSchema.parse({
        ...unresolvedContext,
        grantedCapabilities: grants.granted,
        entitlementStatus: grants.entitlementStatus,
      })
      await tx.aiAgentAttempt.update({
        where: { id: attempt.id },
        data: { grantedCapabilities: grants.granted },
      })
      await this.appendAgentRunningStatus(tx, job, attempt, published)
      return {
        attemptId: attempt.id,
        contextManifestId: manifest.id,
        requestContext,
        userText: budgetedContext.userText,
        userTextSha256: budgetedContext.userTextSha256,
      }
    })

    for (const item of published) {
      const event = await this.prisma.aiConversationEvent.findUnique({
        where: { id: item.eventId },
      })
      if (event) {
        this.conversationService.publish(item.conversationId, event)
      }
    }

    const ttlSec = this.configService.get<number>('app.aiCreateAssist.delegationTtlSec') ?? 600
    const payload: AiOperationDelegationPayload = {
      typ: AI_OP_DELEGATION_JWT_TYP,
      sub: job.inputBatch.creatorUserId,
      organizationId: job.organizationId,
      conversationId: job.conversationId,
      inputBatchId: job.inputBatchId,
      attemptId: prepared.attemptId,
      contextManifestId: prepared.contextManifestId,
      agentDefinition: prepared.requestContext.agentDefinition,
      grantedCapabilities: prepared.requestContext.grantedCapabilities,
      entitlementStatus: prepared.requestContext.entitlementStatus,
      objectScopes: prepared.requestContext.objectScopes,
    }
    const delegationToken = await this.jwtService.signAsync(payload, {
      expiresIn: ttlSec,
      secret: this.configService.getOrThrow<string>('app.jwtDelegationSecret'),
      audience: AI_OP_DELEGATION_JWT_AUD,
    })
    return {
      request: {
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        attemptId: prepared.attemptId,
        contextManifestId: prepared.contextManifestId,
        userText: prepared.userText,
        userTextSha256: prepared.userTextSha256,
      },
      attemptId: prepared.attemptId,
      delegationToken,
      requestContext: prepared.requestContext,
    }
  }

  private async persistOutcome(
    job: ClaimedJob,
    route: Extract<AgentExecutionRoute, { kind: 'execution_definition' }>,
    attemptId: string,
    result: HeadlessExecutionResult,
  ): Promise<void> {
    if (result.kind === 'failed') {
      const errorCode = result.error.code
      if (isImmediateWorkflowFailure(errorCode) || result.error.retryable === false) {
        await this.persistFailure(job, errorCode, result, attemptId)
        this.workflowLog('failed', {
          job: job.id,
          type: job.type,
          reason: errorCode,
          attempt: job.attemptCount,
        })
        return
      }
      await this.scheduleRetry(job, errorCode, attemptId)
      return
    }
    if (result.kind === 'awaiting_review' && !job.taskId) {
      await this.persistFailure(job, 'INVALID_FORMAT', result, attemptId)
      this.workflowLog('failed', {
        job: job.id,
        type: job.type,
        reason: 'INVALID_FORMAT',
        attempt: job.attemptCount,
      })
      return
    }

    const published: string[] = []
    await this.prisma.$transaction(async (tx) => {
      await lockConversationRuntime(tx, job.organizationId, job.conversationId)
      if (!(await this.ownsClaimedJob(tx, job.id))) {
        return
      }
      const currentJob = await tx.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } })
      const currentAttempt = await tx.aiAgentAttempt.findUnique({
        where: { id: attemptId },
        select: { generation: true },
      })
      if (!currentAttempt || currentAttempt.generation !== currentJob.generation) {
        return
      }
      if (job.taskId) {
        const task = await tx.agentTask.findUnique({
          where: { id: job.taskId },
          select: { status: true },
        })
        if (!isOpenAgentTaskStatus(task?.status)) {
          return
        }
      }
      const finalAuthorization = await this.recheckAuthorization(job, route)
      if (!finalAuthorization.ok) {
        throw AiCollaborationError.fromCode('PERMISSION_DENIED')
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
        result.kind === 'awaiting_review' && job.taskId
          ? await this.projectReviewPackageViaGateway(tx, job, attemptId, result.reviewPackage)
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
          ...(reviewPackageId
            ? {
                reviewPackageId,
                fieldKeys:
                  result.kind === 'awaiting_review'
                    ? result.reviewPackage.candidates.map((candidate) => candidate.fieldKey)
                    : undefined,
              }
            : {}),
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
          ...attemptDiagnosticUpdate(result),
          endedAt: new Date(),
        },
      })
      await this.writeManifestUsage(tx, attemptId, result)
      await tx.aiWorkflowJob.update({
        where: { id: job.id },
        data: {
          status: AiWorkflowJobStatus.succeeded,
          leaseExpiresAt: null,
        },
      })
      if (job.taskId) {
        const waiting =
          batchStatus === AiInputBatchStatus.awaiting_review ||
          batchStatus === AiInputBatchStatus.awaiting_user_input
        await tx.agentTask.updateMany({
          where: {
            id: job.taskId,
            AND: [
              {
                status: {
                  in: [AgentTaskStatus.proposed, AgentTaskStatus.active, AgentTaskStatus.waiting],
                },
              },
              {
                status: {
                  not: waiting ? AgentTaskStatus.waiting : AgentTaskStatus.active,
                },
              },
            ],
          },
          data: {
            status: waiting ? AgentTaskStatus.waiting : AgentTaskStatus.active,
            statusVersion: { increment: 1 },
          },
        })
        await tx.taskActivity.create({
          data: {
            organizationId: job.organizationId,
            taskId: job.taskId,
            kind: waiting ? TaskActivityKind.waiting : TaskActivityKind.progress,
            summary: waiting ? '任务正在等待 User 处理' : 'Agent 已完成一轮推进',
            payload: {
              inputBatchId: job.inputBatchId,
              interactionId,
              reviewPackageId,
            },
          },
        })
      }
      await tx.aiConversation.update({
        where: { id: job.conversationId },
        data: { lastActivityAt: new Date(), updatedAt: new Date() },
      })
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
      await lockConversationRuntime(tx, job.organizationId, job.conversationId)
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
          sources: {
            include: {
              source: {
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
      const failedSource = job.sourceId
        ? await tx.conversationSource.findUnique({ where: { id: job.sourceId } })
        : null
      const errorEvent = await this.conversationService.appendEvent(tx, {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        kind: AiConversationEventKind.error,
        payload: {
          batchId: job.inputBatchId,
          materialId: job.sourceId,
          originalFilename: failedSource?.originalFilename ?? null,
          errorCode,
          errorMessage: parseErrorMessage(errorCode),
        },
      })
      published.push(errorEvent.id)
      const progress = materialProgressFromDeps(
        batch.sources.map((item) => ({
          required: item.required,
          parseResultVersion: item.parseVersion,
          failed: item.parseVersion == null && (item.sourceId === job.sourceId || isFailedDependency(item)),
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
          failedMaterials: toFailedMaterialPayload(batch.sources),
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
      await lockConversationRuntime(tx, job.organizationId, job.conversationId)
      if (!(await this.ownsClaimedJob(tx, job.id))) {
        return
      }
      if (attemptId) {
        const currentJob = await tx.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } })
        const currentAttempt = await tx.aiAgentAttempt.findUnique({
          where: { id: attemptId },
          select: { generation: true },
        })
        if (!currentAttempt || currentAttempt.generation !== currentJob.generation) {
          return
        }
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
                collaborationErrorCodeForWorkflowFailure(errorCode),
              ).toJSON(),
            }) as unknown as Prisma.InputJsonValue,
            ...attemptDiagnosticUpdate(result),
            endedAt: new Date(),
          },
        })
        await this.writeManifestUsage(tx, attemptId, result)
      }
      await tx.aiWorkflowJob.update({
        where: { id: job.id },
        data: {
          status: AiWorkflowJobStatus.failed,
          lastErrorCode: errorCode,
          leaseExpiresAt: null,
        },
      })

      await tx.aiConversation.update({
        where: { id: job.conversationId },
        data: { lastActivityAt: new Date(), updatedAt: new Date() },
      })
    })

    for (const eventId of published) {
      const event = await this.prisma.aiConversationEvent.findUnique({ where: { id: eventId } })
      if (event) {
        this.conversationService.publish(job.conversationId, event)
      }
    }
  }

  private async writeManifestUsage(
    tx: Prisma.TransactionClient,
    attemptId: string,
    result?: HeadlessExecutionResult,
  ): Promise<void> {
    const attempt = await tx.aiAgentAttempt.findUnique({
      where: { id: attemptId },
      select: { contextManifestId: true },
    })
    if (!attempt) {
      return
    }
    await tx.aiContextManifest.update({
      where: { id: attempt.contextManifestId },
      data: manifestUsageUpdate(result),
    })
  }

  private leaseUntil(): Date {
    return new Date(Date.now() + this.leaseMs())
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

  private async withHeartbeat<T>(jobId: string, work: () => Promise<T>): Promise<T> {
    const timer = setInterval(() => {
      void this.renewLease(jobId)
    }, this.heartbeatMs())
    try {
      return await work()
    } finally {
      clearInterval(timer)
    }
  }

  private async scheduleRetry(
    job: ClaimedJob,
    errorCode: string,
    attemptId?: string,
  ): Promise<void> {
    if (job.attemptCount > WORKFLOW_MAX_ATTEMPTS) {
      if (job.type === AiWorkflowJobType.material_parse) {
        if (job.sourceId) {
          await this.materialService.markParseTerminalFailure(job.sourceId)
        }
        await this.persistParseBarrierFailure(job, PARSE_FAILED_ERROR_CODE)
        this.workflowLog('failed', {
          job: job.id,
          type: job.type,
          reason: PARSE_FAILED_ERROR_CODE,
          attempt: job.attemptCount,
        })
        return
      }
      await this.persistFailure(job, errorCode)
      this.workflowLog('failed', {
        job: job.id,
        type: job.type,
        reason: errorCode,
        attempt: job.attemptCount,
      })
      return
    }
    const delayMs = workflowBackoffMs(job.attemptCount)
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.ownsClaimedJob(tx, job.id))) {
        return
      }
      if (attemptId) {
        await tx.aiAgentAttempt.updateMany({
          where: { id: attemptId, status: AiAgentAttemptStatus.running },
          data: {
            status: AiAgentAttemptStatus.failed,
            errorCode,
            ...attemptDiagnosticUpdate(),
            endedAt: new Date(),
          },
        })
      }
      await tx.aiWorkflowJob.update({
        where: { id: job.id },
        data: {
          status: AiWorkflowJobStatus.pending,
          lastErrorCode: errorCode,
          leaseExpiresAt: null,
          claimedAt: null,
          claimedBy: null,
          nextAttemptAt: new Date(Date.now() + delayMs),
        },
      })
    })
    this.workflowLog('retry_scheduled', {
      job: job.id,
      type: job.type,
      reason: errorCode,
      attempt: job.attemptCount,
      delayMs,
    })
  }

  private async appendAgentRunningStatus(
    tx: Prisma.TransactionClient,
    job: ClaimedJob,
    attempt: { id: string; generation: number },
    published: { conversationId: string; eventId: string }[],
  ): Promise<void> {
    const runningEventId = await markBatchAgentRunningAfterAttempt(
      tx,
      (inner, params) => this.conversationService.appendEvent(inner, params),
      {
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        batchId: job.inputBatchId,
        attemptId: attempt.id,
        generation: attempt.generation,
      },
    )
    published.push({ conversationId: job.conversationId, eventId: runningEventId })
  }

  private async organizationUsable(organizationId: string): Promise<boolean> {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
        status: OrganizationStatus.enabled,
      },
      select: { id: true },
    })
    return organization != null
  }

  private leaseMs(): number {
    return this.configNumber('app.workflow.leaseMs', WORKFLOW_LEASE_MS)
  }

  private heartbeatMs(): number {
    return this.configNumber('app.workflow.heartbeatMs', WORKFLOW_HEARTBEAT_MS)
  }

  private parseConcurrency(): number {
    return this.configNumber('app.workflow.parseConcurrency', WORKFLOW_PARSE_CONCURRENCY)
  }

  private agentConcurrency(): number {
    return this.configNumber('app.workflow.agentConcurrency', WORKFLOW_AGENT_CONCURRENCY)
  }

  private configNumber(key: string, fallback: number): number {
    const configured = this.configService.get<number>(key)
    if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
      return Math.floor(configured)
    }
    return fallback
  }

  private workflowLog(
    event: string,
    fields: Record<string, string | number | boolean | null | undefined>,
  ): void {
    const parts = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ')
    this.logger.log(`workflow ${event} ${parts}`)
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
    const owned = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM ai_workflow_jobs
      WHERE id = ${jobId}
        AND status = 'claimed'::ai_workflow_job_status
        AND claimed_by = ${this.workerId}
      FOR UPDATE
    `
    return owned.length === 1
  }

  private async projectReviewPackageViaGateway(
    tx: Prisma.TransactionClient,
    job: ClaimedJob,
    attemptId: string,
    reviewPackage: SubmitReviewPackageModelInput,
  ): Promise<string> {
    if (!job.taskId) {
      throw new Error('REVIEW_PACKAGE_REQUIRES_TASK')
    }
    const taskId = job.taskId
    const attempt = await tx.aiAgentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: {
        contextManifestId: true,
        agentDefinitionKey: true,
        agentDefinitionVersion: true,
        grantedCapabilities: true,
      },
    })
    const authority = await loadEvidenceAuthority(tx, {
      organizationId: job.organizationId,
      conversationId: job.conversationId,
      inputBatchId: job.inputBatchId,
      attemptId,
      contextManifestId: attempt.contextManifestId ?? undefined,
    })
    if (!authority) {
      throw new Error('REVIEW_PACKAGE_AUTHORITY_MISSING')
    }
    const validated = requireValidReviewProposal({
      proposal: reviewPackage,
      authority,
    })
    const adapter = new AiToolWorkerAdapter(
      new AiActionGateway(
        createPrismaAiActionStore(tx),
        createPrismaAiActionTargetAuthority(tx),
      ),
    )
    const projected = await adapter.projectReviewPackage({
      actor: {
        organizationId: job.organizationId,
        userId: job.inputBatch.creatorUserId,
        taskId,
        conversationId: job.conversationId,
        inputBatchId: job.inputBatchId,
        attemptId,
        contextManifestId: attempt.contextManifestId,
        agentDefinition: {
          key: attempt.agentDefinitionKey,
          version: attempt.agentDefinitionVersion,
        },
        grantedCapabilities: versionedDefinitionRefSchema
          .array()
          .parse(attempt.grantedCapabilities),
      },
      input: validated.reviewPackage,
      persist: async ({ action, target }) => {
        if (!action?.id) {
          throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
        }
        if (target.version == null) {
          throw new Error('NORMALIZED_TARGET_VERSION_MISSING')
        }
        return projectPendingReviewPackage(tx, {
          organizationId: job.organizationId,
          taskId,
          conversationId: job.conversationId,
          inputBatchId: job.inputBatchId,
          attemptId,
          reviewPackage: { ...validated.reviewPackage, objectVersion: target.version },
          sourceActionId: action.id,
        })
      },
    })
    return projected.reviewPackageId
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

function definitionRefLog(ref: { key: string; version: number }): string {
  return `${ref.key}@${ref.version}`
}

function capabilityRefsLog(refs: readonly { key: string; version: number }[]): string {
  return refs.map(definitionRefLog).join(',')
}

function frozenAssociation(
  id: string,
  attempt: { agentDefinitionKey: string; agentDefinitionVersion: number },
  taskId?: string | null,
): FrozenAgentAssociation {
  const agentDefinition: VersionedDefinitionRef = versionedDefinitionRefSchema.parse({
    key: attempt.agentDefinitionKey,
    version: attempt.agentDefinitionVersion,
  })
  return { id, agentDefinition, ...(taskId ? { taskId } : {}) }
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' && field.length > 0 ? field : undefined
}

function collaborationErrorCodeForWorkflowFailure(
  errorCode: string,
): 'PERMISSION_DENIED' | 'CONTEXT_CAPACITY_EXCEEDED' | 'AGENT_UNAVAILABLE' {
  if (errorCode === 'PERMISSION_DENIED' || errorCode === 'CONTEXT_CAPACITY_EXCEEDED') {
    return errorCode
  }
  return 'AGENT_UNAVAILABLE'
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}

function isTransientWorkflowError(error: unknown): boolean {
  if (error instanceof ServiceUnavailableException) {
    return true
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return true
  }
  if (error instanceof TypeError && /fetch|network|ECONN|ETIMEDOUT/i.test(error.message)) {
    return true
  }
  return false
}
