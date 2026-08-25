import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  AiCreateAssistAvailability,
  AiCreateAssistSession,
  AiCreateTaskSummary,
  DepartureCreationDraftSnapshot,
  DepartureSummary,
} from '@xiaotuanbao/shared'
import {
  AiCreatePhase,
  DepartureCreationDraftMode,
  DepartureType,
} from '@xiaotuanbao/shared'
import {
  classifyDraftFields,
  capabilitiesForPendingReview,
  evaluateReviewConfirmMerge,
  getTaskContextInputSchema,
  getTaskContextOutputSchema,
  getMaterialParseResultInputSchema,
  getMaterialParseResultOutputSchema,
  searchRouteTemplatesInputSchema,
  searchRouteTemplatesOutputSchema,
  submitReviewPackageInputSchema,
  submitReviewPackageOutputSchema,
  aiReviewCandidateInputSchema,
  AI_REVIEWABLE_BASIC_INFO_FIELDS,
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  DEPARTURE_REVIEW_TARGET_KIND,
  isTargetVersionStale,
  reviewConflictChangeSummary,
  reviewDecisionIdentitySchema,
  type GetTaskContextOutput,
  type SearchRouteTemplatesOutput,
  type SubmitReviewPackageOutput,
  type AiReviewableBasicInfoField,
} from '@xiaotuanbao/ai-contracts'
import type { AgentTask, AiConversationEvent, AiCreateTask, AiReviewPackage, DepartureCreationDraft, Prisma } from '@prisma/client'
import { AgentTaskStatus, AgentTaskType, AiCreateActivityRunStatus, AiReviewPackageStatus, AiReviewRecordAction, AiReviewWriteResult, DepartureType as PrismaDepartureType, TaskActivityKind } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureService } from '../departure/departure.service'
import { RouteTemplateService } from '../departure/route-template.service'
import { AuthService } from '../auth/auth.service'
import type {
  CancelAiReviewPackageDto,
  ConfirmAiCreateTaskDto,
  ConfirmAiReviewPackageDto,
  DepartureCreationDraftSnapshotDto,
  PatchAiReviewPackageDto,
  RejectAiReviewPackageDto,
  SaveDepartureCreationDraftDto,
  StartAiCreateAssistSessionDto,
} from './dto/ai-create-task.dto'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import { isAiCreateAssistEnabledForUser } from './ai-create-assist-access'
import { AiConversationService } from './ai-conversation.service'
import { REVIEW_ALREADY_HANDLED_MESSAGE } from './ai-conversation.constants'
import { isolateOpenTaskRuntime } from './agent-task.runtime'
import { lockAiCreateTask } from './ai-create-task.lock'
import { DepartureMaterialService } from './departure-material.service'
import {
  parseStoredCandidates,
  reviewConfirmValues,
  toReviewPackageView,
  toStoredCandidates,
  type StoredReviewCandidate,
} from './review-package.mapper'
import { findReviewPackageByProposalIdentity } from './review-package.projection'
import {
  departureReviewProposalHash,
  reviewDecisionRequestHash,
  reviewPackageCreateData,
} from './review-package.envelope'

const CONFIRM_OPERATION = 'ai-create-task.confirm'
const REVIEW_CONFIRM_OPERATION = 'ai-review-package.confirm'

type TaskWithDraft = AiCreateTask & {
  draft: DepartureCreationDraft | null
  agentTask: AgentTask & { reviewPackages?: AiReviewPackage[] }
}

const TASK_WITH_PENDING_INCLUDE = {
  draft: true,
  agentTask: {
    include: {
      reviewPackages: {
        where: { status: AiReviewPackageStatus.pending },
        orderBy: { createdAt: 'desc' as const },
      },
    },
  },
} satisfies Prisma.AiCreateTaskInclude

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

function requestHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex')
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

@Injectable()
export class AiCreateTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureService: DepartureService,
    private readonly routeTemplateService: RouteTemplateService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly conversationService: AiConversationService,
    private readonly materialService: DepartureMaterialService,
  ) {}

  async saveDraft(
    organizationId: string,
    userId: string,
    dto: SaveDepartureCreationDraftDto,
  ): Promise<AiCreateTaskSummary> {
    const snapshot = this.normalizeSnapshot(dto.draft)
    this.assertValidDraft(snapshot)

    if (!dto.taskId) {
      return this.createTaskWithDraft(organizationId, userId, snapshot)
    }

    if (dto.expectedVersion === undefined) {
      throw new BadRequestException('更新草稿必须提供 expectedVersion')
    }

    return this.updateDraft(
      organizationId,
      userId,
      dto.taskId,
      dto.expectedVersion,
      snapshot,
    )
  }

  async getTask(
    organizationId: string,
    userId: string,
    taskId: string,
  ): Promise<AiCreateTaskSummary> {
    const task = await this.findOwnedTaskOrThrow(organizationId, userId, taskId)
    return this.toSummary(task)
  }

  async getAssistAvailability(userId: string): Promise<AiCreateAssistAvailability> {
    const enabled = await this.canUseAssist(userId)
    return {
      enabled,
      agentRuntimeUrl: enabled ? this.agentRuntimeUrl() : null,
    }
  }

  async startAssistSession(
    organizationId: string,
    userId: string,
    dto: StartAiCreateAssistSessionDto,
  ): Promise<AiCreateAssistSession> {
    if (!(await this.canUseAssist(userId))) {
      throw AiCollaborationHttpException.fromCode('PERMISSION_DENIED')
    }

    const task = dto.taskId
      ? await this.findOwnedInProgressTask(organizationId, userId, dto.taskId)
      : await this.createTaskWithDraft(
          organizationId,
          userId,
          this.normalizeSnapshot(dto.draft ?? { mode: DepartureCreationDraftMode.MANUAL, routeName: '' }),
        ).then((summary) => this.findOwnedTaskOrThrow(organizationId, userId, summary.id))

    const conversation = await this.conversationService.openOrResume(
      organizationId,
      userId,
      task.id,
      dto.conversationId,
    )

    return {
      task: this.toSummary(task),
      conversation,
    }
  }

  async getTaskContextForAgent(
    caller: {
      userId: string
      organizationId: string
      taskId: string
      runId: string
      conversationId?: string
      inputBatchId?: string
      contextManifestId?: string
    },
    rawInput: unknown,
  ): Promise<GetTaskContextOutput> {
    let input: { taskId: string; runId: string }
    try {
      input = getTaskContextInputSchema.parse(rawInput)
    } catch {
      throw new BadRequestException('getTaskContext 参数无效')
    }
    if (input.taskId !== caller.taskId || input.runId !== caller.runId) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    const task = await this.findOwnedTaskOrThrow(caller.organizationId, caller.userId, caller.taskId)
    const run = await this.prisma.aiCreateActivityRun.findFirst({
      where: {
        id: caller.runId,
        taskId: caller.taskId,
        organizationId: caller.organizationId,
        creatorUserId: caller.userId,
      },
    })
    if (!run || run.status !== AiCreateActivityRunStatus.running) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    const summary = this.toSummary(task)
    const conversationPending = caller.conversationId
      ? (summary.pendingReviews ?? []).find((pkg) => pkg.conversationId === caller.conversationId)
      : undefined
    return getTaskContextOutputSchema.parse({
      task: {
        id: summary.id,
        status: summary.status,
        currentPhase: summary.currentPhase,
        creatorUserId: summary.creatorUserId,
      },
      snapshot: summary.draft.snapshot,
      objectVersion: summary.draft.version,
      pending: {
        hasPendingReview: Boolean(conversationPending),
        reviewPackageId: conversationPending?.id ?? null,
      },
      availableCapabilities: capabilitiesForPendingReview(Boolean(conversationPending)),
      fieldCoverage: classifyDraftFields(summary.draft.snapshot),
    })
  }

  async getMaterialParseResultForAgent(
    caller: {
      userId: string
      organizationId: string
      taskId: string
      runId: string
      inputBatchId?: string
    },
    rawInput: unknown,
  ) {
    let input: {
      taskId: string
      runId: string
      materialId: string
      parseResultVersion: number
      pageNumber?: number
    }
    try {
      input = getMaterialParseResultInputSchema.parse(rawInput)
    } catch {
      throw new BadRequestException('getMaterialParseResult 参数无效')
    }
    if (input.taskId !== caller.taskId || input.runId !== caller.runId) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }
    if (!caller.inputBatchId) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }
    const result = await this.materialService.getPinnedParseResult({
      organizationId: caller.organizationId,
      inputBatchId: caller.inputBatchId,
      sourceId: input.materialId,
      parseVersion: input.parseResultVersion,
      pageNumber: input.pageNumber,
    })
    return getMaterialParseResultOutputSchema.parse(result)
  }

  async searchRouteTemplatesForAgent(
    caller: { userId: string; organizationId: string; taskId: string; runId: string },
    rawInput: unknown,
  ): Promise<SearchRouteTemplatesOutput> {
    let input: ReturnType<typeof searchRouteTemplatesInputSchema.parse>
    try {
      input = searchRouteTemplatesInputSchema.parse(rawInput)
    } catch {
      throw AiCollaborationHttpException.fromCode('INVALID_FORMAT')
    }
    if (input.taskId !== caller.taskId || input.runId !== caller.runId) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    const task = await this.findOwnedTaskOrThrow(caller.organizationId, caller.userId, caller.taskId)
    if (task.agentTask.status !== AgentTaskStatus.active || task.departureId) {
      throw new BadRequestException('仅进行中的 AI 建团任务可查询常用路线')
    }
    const run = await this.prisma.aiCreateActivityRun.findFirst({
      where: {
        id: caller.runId,
        taskId: caller.taskId,
        organizationId: caller.organizationId,
        creatorUserId: caller.userId,
      },
    })
    if (!run || run.status !== AiCreateActivityRunStatus.running) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    const items = await this.routeTemplateService.searchForAgent(caller.organizationId, {
      keyword: input.keyword,
      dayCount: input.dayCount,
    })
    return searchRouteTemplatesOutputSchema.parse({ items })
  }

  async submitReviewPackageForAgent(
    caller: {
      userId: string
      organizationId: string
      taskId: string
      runId: string
      conversationId: string
      inputBatchId: string
      attemptId?: string
    },
    rawInput: unknown,
    options: { sourceActionId: string },
  ): Promise<SubmitReviewPackageOutput> {
    let input: ReturnType<typeof submitReviewPackageInputSchema.parse>
    try {
      input = submitReviewPackageInputSchema.parse(rawInput)
    } catch {
      throw AiCollaborationHttpException.fromCode('INVALID_FORMAT')
    }
    if (input.taskId !== caller.taskId || input.runId !== caller.runId) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }
    if (!caller.conversationId || !caller.inputBatchId) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }
    if (!options.sourceActionId) {
      throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
    }

    return this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, caller.organizationId, caller.taskId)

      const task = await tx.aiCreateTask.findFirst({
        where: { id: caller.taskId, agentTask: { organizationId: caller.organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      if (!task || !task.draft) {
        throw new NotFoundException('AI 建团任务不存在')
      }
      if (task.agentTask.ownerUserId !== caller.userId) {
        throw new ForbiddenException('仅任务创建者可提交审核包')
      }
      if (
        (task.agentTask.status !== AgentTaskStatus.active &&
          task.agentTask.status !== AgentTaskStatus.waiting) ||
        task.departureId
      ) {
        throw new BadRequestException('仅进行中的 AI 建团任务可提交审核包')
      }

      const run = await tx.aiCreateActivityRun.findFirst({
        where: {
          id: caller.runId,
          taskId: caller.taskId,
          organizationId: caller.organizationId,
          creatorUserId: caller.userId,
        },
      })
      if (!run || run.status !== AiCreateActivityRunStatus.running) {
        throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
      }

      if (task.draft.version !== input.objectVersion) {
        throw AiCollaborationHttpException.fromCode('VERSION_CONFLICT')
      }

      const replayed = await this.replaySubmittedReviewPackage(tx, {
        sourceActionId: options.sourceActionId,
        inputBatchId: caller.inputBatchId,
        targetId: task.draft.id,
        reviewPackage: input,
      })
      if (replayed) {
        return replayed
      }

      const stored = toStoredCandidates(input.candidates)
      const created = await tx.aiReviewPackage.create({
        data: reviewPackageCreateData({
          organizationId: caller.organizationId,
          taskId: caller.taskId,
          runId: caller.runId,
          conversationId: caller.conversationId,
          inputBatchId: caller.inputBatchId,
          attemptId: caller.attemptId,
          sourceActionId: options.sourceActionId,
          targetId: task.draft.id,
          baseObjectVersion: task.draft.version,
          baselineSnapshot: task.draft.snapshot as Prisma.InputJsonValue,
          reviewPackage: input,
        }),
      })
      return submitReviewPackageOutputSchema.parse({
        reviewPackageId: created.id,
        status: 'pending',
        objectVersion: task.draft.version,
        fieldKeys: stored.map((candidate) => candidate.fieldKey),
      })
    })
  }

  async patchReviewPackage(
    organizationId: string,
    userId: string,
    taskId: string,
    packageId: string,
    dto: PatchAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    const corrections = this.parseCorrections(dto.corrections)
    return this.prisma.$transaction(async (tx) => {
      const pkg = await this.lockPendingPackage(tx, organizationId, userId, taskId, packageId)
      await tx.aiReviewPackage.update({
        where: { id: pkg.id },
        data: { userCorrections: corrections as Prisma.InputJsonValue },
      })
      const task = await tx.aiCreateTask.findFirstOrThrow({
        where: { id: taskId, agentTask: { organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      return this.toSummary(task)
    })
  }

  async rejectReviewPackage(
    organizationId: string,
    userId: string,
    taskId: string,
    packageId: string,
    dto: RejectAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    const { summary, events } = await this.prisma.$transaction(async (tx) => {
      const pkg = await this.lockPendingPackage(
        tx,
        organizationId,
        userId,
        taskId,
        packageId,
        dto.expectedPackageVersion,
      )
      const candidates = parseStoredCandidates(pkg.candidates).map((candidate) => ({
        ...candidate,
        status: 'rejected' as const,
      }))
      const claimed = await tx.aiReviewPackage.updateMany({
        where: {
          id: pkg.id,
          status: AiReviewPackageStatus.pending,
          version: dto.expectedPackageVersion,
        },
        data: {
          status: AiReviewPackageStatus.rejected,
          version: { increment: 1 },
          candidates: candidates as unknown as Prisma.InputJsonValue,
        },
      })
      if (claimed.count !== 1) {
        await this.throwAlreadyHandled(tx, organizationId, taskId)
      }
      await this.writeReviewRecord(tx, {
        organizationId,
        packageId: pkg.id,
        operatorUserId: userId,
        action: AiReviewRecordAction.reject,
        candidates,
        corrections: {},
        submittedValues: {},
        objectVersion: pkg.baseObjectVersion,
        writeResult: AiReviewWriteResult.rejected,
      })
      const events = await this.conversationService.finalizeReviewDisposition(tx, {
        organizationId,
        taskId,
        userId,
        reviewPackageId: pkg.id,
        inputBatchId: pkg.inputBatchId,
        disposition: 'rejected',
      })
      const task = await tx.aiCreateTask.findFirstOrThrow({
        where: { id: taskId, agentTask: { organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      return { summary: this.toSummary(task), events }
    })
    for (const event of events) {
      this.conversationService.publish(event.conversationId, event)
    }
    return summary
  }

  async cancelReviewPackage(
    organizationId: string,
    userId: string,
    taskId: string,
    packageId: string,
    dto: CancelAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    await this.assertCurrentWritePermission(userId)
    const { summary, events } = await this.prisma.$transaction(async (tx) => {
      const pkg = await this.lockPendingPackage(
        tx,
        organizationId,
        userId,
        taskId,
        packageId,
        dto.expectedPackageVersion,
      )
      const claimed = await tx.aiReviewPackage.updateMany({
        where: {
          id: pkg.id,
          status: AiReviewPackageStatus.pending,
          version: dto.expectedPackageVersion,
        },
        data: {
          status: AiReviewPackageStatus.cancelled,
          version: { increment: 1 },
        },
      })
      if (claimed.count !== 1) {
        await this.throwAlreadyHandled(tx, organizationId, taskId)
      }
      await this.writeReviewRecord(tx, {
        organizationId,
        packageId: pkg.id,
        operatorUserId: userId,
        action: AiReviewRecordAction.cancel,
        candidates: parseStoredCandidates(pkg.candidates),
        corrections: this.parseCorrections(
          (pkg.userCorrections as Record<string, string | number | null> | undefined) ?? undefined,
        ),
        submittedValues: {},
        objectVersion: pkg.baseObjectVersion,
        writeResult: AiReviewWriteResult.rejected,
      })
      const events = await this.conversationService.finalizeReviewCancel(tx, {
        organizationId,
        taskId,
        userId,
        reviewPackageId: pkg.id,
        inputBatchId: pkg.inputBatchId,
        conversationId: pkg.conversationId,
      })
      const task = await tx.aiCreateTask.findFirstOrThrow({
        where: { id: taskId, agentTask: { organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      return { summary: this.toSummary(task), events }
    })
    for (const event of events) {
      this.conversationService.publish(event.conversationId, event)
    }
    return summary
  }

  async regenerateReviewPackage(
    organizationId: string,
    userId: string,
    taskId: string,
    packageId: string,
  ): Promise<AiCreateTaskSummary> {
    await this.assertCurrentWritePermission(userId)
    const { summary, events } = await this.prisma.$transaction(async (tx) => {
      const pkg = await this.lockPendingPackage(
        tx,
        organizationId,
        userId,
        taskId,
        packageId,
        undefined,
        [AiReviewPackageStatus.conflict],
      )
      if (!pkg.conversationId) {
        throw new BadRequestException('审核包缺少来源会话，无法重新生成')
      }
      const events = await this.conversationService.startReviewRegenerate(tx, {
        organizationId,
        userId,
        taskId,
        reviewPackageId: pkg.id,
        conversationId: pkg.conversationId,
        inputBatchId: pkg.inputBatchId,
      })
      const task = await tx.aiCreateTask.findFirstOrThrow({
        where: { id: taskId, agentTask: { organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      return { summary: this.toSummary(task), events }
    })
    for (const event of events) {
      this.conversationService.publish(event.conversationId, event)
    }
    return summary
  }

  async confirmReviewPackage(
    organizationId: string,
    userId: string,
    taskId: string,
    packageId: string,
    dto: ConfirmAiReviewPackageDto,
    decisionCommandId?: string,
  ): Promise<AiCreateTaskSummary> {
    const parsedIdentity = reviewDecisionIdentitySchema.safeParse({
      reviewPackageId: packageId,
      reviewVersion: dto.expectedPackageVersion,
      decisionCommandId: decisionCommandId?.trim() || dto.decisionCommandId?.trim(),
    })
    if (!parsedIdentity.success) {
      throw new BadRequestException('确认审核必须提供 decisionCommandId 或 Idempotency-Key')
    }
    const identity = parsedIdentity.data
    const requestCorrections = this.parseCorrections(dto.corrections)
    const requestHash = reviewDecisionRequestHash({
      ...identity,
      expectedVersion: dto.expectedVersion,
      corrections: requestCorrections,
    })
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.assertCurrentWritePermission(userId)
      await lockAiCreateTask(tx, organizationId, taskId)
      const replayed = await this.replayReviewDecision(tx, {
        organizationId,
        taskId,
        operation: REVIEW_CONFIRM_OPERATION,
        decisionCommandId: identity.decisionCommandId,
        requestHash,
      })
      if (replayed) {
        return replayed
      }

      const pkg = await this.lockPendingPackage(
        tx,
        organizationId,
        userId,
        taskId,
        packageId,
        dto.expectedPackageVersion,
        [AiReviewPackageStatus.pending, AiReviewPackageStatus.conflict],
      )
      const task = await tx.aiCreateTask.findFirstOrThrow({
        where: { id: taskId, agentTask: { organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      if (!task.draft) {
        throw new NotFoundException('发团创建草稿不存在')
      }

      const storedCorrections = this.parseCorrections(
        (pkg.userCorrections as Record<string, string | number | null> | undefined) ?? undefined,
      )
      const originalCandidates = parseStoredCandidates(pkg.candidates)
      this.assertStoredProposalIntegrity(pkg, originalCandidates)
      const candidates = this.applyCorrections(originalCandidates, {
        ...storedCorrections,
        ...requestCorrections,
      })
      const { corrections, submissions } = reviewConfirmValues(candidates)
      const baseline = this.parseSnapshot(pkg.baselineSnapshot)
      const current = this.parseSnapshot(task.draft.snapshot)

      if (
        task.draft.version !== dto.expectedVersion ||
        isTargetVersionStale(pkg.baseObjectVersion, task.draft.version)
      ) {
        const changeSummary = reviewConflictChangeSummary({
          baseVersion: pkg.baseObjectVersion,
          currentVersion: task.draft.version,
          baseline,
          current,
        })
        const events = await this.markPackageConflict(tx, {
          organizationId,
          userId,
          taskId,
          pkg,
          candidates,
          corrections,
          submissions,
          currentVersion: task.draft.version,
          changeSummary,
          decisionCommandId: identity.decisionCommandId,
        })
        const latest = await tx.aiCreateTask.findFirstOrThrow({
          where: { id: taskId, agentTask: { organizationId } },
          include: TASK_WITH_PENDING_INCLUDE,
        })
        const summary = this.toSummary(latest)
        await this.completeReviewDecision(tx, {
          organizationId,
          taskId,
          decisionCommandId: identity.decisionCommandId,
          requestHash,
          result: {
            kind: 'conflict',
            summary,
            changeSummary,
          },
        })
        return { kind: 'conflict' as const, summary, events, changeSummary }
      }

      const merge = evaluateReviewConfirmMerge({
        baselineSnapshot: current,
        currentSnapshot: current,
        submissions,
      })
      if (merge.status === 'conflict') {
        throw new BadRequestException('审核提案无法应用到当前草稿')
      }

      const adoptedTemplateId =
        typeof submissions.templateId === 'string' ? submissions.templateId.trim() : ''
      if (adoptedTemplateId) {
        const template = await tx.routeTemplate.findFirst({
          where: { id: adoptedTemplateId, organizationId },
        })
        if (!template) {
          await this.writeReviewRecord(tx, {
            organizationId,
            packageId: pkg.id,
            operatorUserId: userId,
            action: AiReviewRecordAction.confirm,
            decisionCommandId: identity.decisionCommandId,
            candidates,
            corrections,
            submittedValues: submissions,
            objectVersion: task.draft.version,
            writeResult: AiReviewWriteResult.validation_failed,
          })
          const latest = await tx.aiCreateTask.findFirstOrThrow({
            where: { id: taskId, agentTask: { organizationId } },
            include: TASK_WITH_PENDING_INCLUDE,
          })
          const summary = this.toSummary(latest)
          const message = '常用路线已不可用，请重新选择后确认'
          await this.completeReviewDecision(tx, {
            organizationId,
            taskId,
            decisionCommandId: identity.decisionCommandId,
            requestHash,
            result: {
              kind: 'validation_failed',
              summary,
              message,
            },
          })
          return {
            kind: 'validation_failed' as const,
            summary,
            events: [] as AiConversationEvent[],
            message,
          }
        }
        merge.nextSnapshot.mode = DepartureCreationDraftMode.TEMPLATE
        merge.nextSnapshot.templateId = template.id
        merge.nextSnapshot.routeName = template.name
        merge.nextSnapshot.defaultDayCount = template.defaultDayCount
      }

      this.assertValidDraft(merge.nextSnapshot)

      const claimed = await tx.aiReviewPackage.updateMany({
        where: {
          id: pkg.id,
          status: AiReviewPackageStatus.pending,
          version: dto.expectedPackageVersion,
        },
        data: {
          status: AiReviewPackageStatus.confirmed,
          version: { increment: 1 },
        },
      })
      if (claimed.count !== 1) {
        await this.throwAlreadyHandled(tx, organizationId, taskId)
      }

      const nextVersion = task.draft.version + 1
      await tx.departureCreationDraft.update({
        where: { id: task.draft.id },
        data: {
          version: nextVersion,
          snapshot: merge.nextSnapshot as unknown as Prisma.InputJsonValue,
        },
      })
      await this.writeReviewRecord(tx, {
        organizationId,
        packageId: pkg.id,
        operatorUserId: userId,
        action: AiReviewRecordAction.confirm,
        decisionCommandId: identity.decisionCommandId,
        candidates,
        corrections,
        submittedValues: submissions,
        objectVersion: nextVersion,
        writeResult: AiReviewWriteResult.success,
      })
      const staleEvents = await this.invalidateOtherPendingPackages(tx, {
        organizationId,
        userId,
        taskId,
        exceptPackageId: pkg.id,
        targetKind: pkg.targetKind,
        targetId: pkg.targetId,
        currentVersion: nextVersion,
        currentSnapshot: merge.nextSnapshot,
      })
      const events = await this.conversationService.finalizeReviewDisposition(tx, {
        organizationId,
        taskId,
        userId,
        reviewPackageId: pkg.id,
        inputBatchId: pkg.inputBatchId,
        disposition: 'confirmed',
      })

      const updated = await tx.aiCreateTask.findFirstOrThrow({
        where: { id: taskId, agentTask: { organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      const summary = this.toSummary(updated)
      await this.completeReviewDecision(tx, {
        organizationId,
        taskId,
        decisionCommandId: identity.decisionCommandId,
        requestHash,
        result: { kind: 'ok', summary },
      })
      return { kind: 'ok' as const, summary, events: [...staleEvents, ...events] }
    })
    for (const event of outcome.events) {
      this.conversationService.publish(event.conversationId, event)
    }
    if (outcome.kind === 'conflict') {
      throw new ConflictException({
        message: '目标版本已变化，请基于最新状态重新生成',
        data: {
          ...outcome.summary,
          reviewConflict: {
            status: 'stale_target_version',
            conflictFields: outcome.changeSummary.changedFieldKeys,
            changeSummary: outcome.changeSummary,
          },
        },
      })
    }
    if (outcome.kind === 'validation_failed') {
      throw new BadRequestException(outcome.message)
    }
    return outcome.summary
  }

  async confirm(
    organizationId: string,
    userId: string,
    taskId: string,
    dto: ConfirmAiCreateTaskDto,
    idempotencyKey?: string,
  ): Promise<DepartureSummary> {
    const key = idempotencyKey?.trim()
    if (!key) {
      throw new BadRequestException('确认创建必须提供 Idempotency-Key 幂等键')
    }
    if (key.length > 200) {
      throw new BadRequestException('幂等键长度不能超过 200 个字符')
    }

    const hash = requestHash({ taskId, expectedVersion: dto.expectedVersion })

    return this.prisma.$transaction(
      async (tx) => {
        await lockAiCreateTask(tx, organizationId, taskId)

        const record = await tx.aiCreateIdempotencyRecord.upsert({
          where: {
            organizationId_operation_idempotencyKey: {
              organizationId,
              operation: CONFIRM_OPERATION,
              idempotencyKey: key,
            },
          },
          create: {
            organizationId,
            taskId,
            operation: CONFIRM_OPERATION,
            idempotencyKey: key,
            requestHash: hash,
          },
          update: {},
        })

        if (record.taskId !== taskId) {
          throw new ConflictException('幂等键已被其他任务使用')
        }
        if (record.requestHash !== hash) {
          throw new ConflictException('幂等键已被其他请求载荷使用')
        }
        if (record.completedAt) {
          if (!record.resultJson || Array.isArray(record.resultJson)) {
            throw new ConflictException('幂等请求结果不可用，请联系管理员')
          }
          return record.resultJson as unknown as DepartureSummary
        }

        const task = await tx.aiCreateTask.findFirst({
          where: { id: taskId, agentTask: { organizationId } },
          include: TASK_WITH_PENDING_INCLUDE,
        })
        if (!task || !task.draft) {
          throw new NotFoundException('AI 建团任务不存在')
        }
        if (task.agentTask.ownerUserId !== userId) {
          throw new ForbiddenException('仅任务创建者可确认创建发团')
        }
        if (task.departureId) {
          const created = await tx.departure.findUniqueOrThrow({
            where: { id: task.departureId },
          })
          const summary = this.departureService.toFreshDepartureSummary(created)
          await tx.aiCreateIdempotencyRecord.update({
            where: { id: record.id },
            data: {
              resultJson: canonicalize(summary) as Prisma.InputJsonValue,
              completedAt: new Date(),
            },
          })
          return summary
        }
        if (task.agentTask.status !== AgentTaskStatus.active) {
          throw new BadRequestException('仅进行中的 AI 建团任务可确认创建')
        }
        if (task.draft.version !== dto.expectedVersion) {
          throw new ConflictException({
            message: '草稿版本已变化，请基于最新快照重试',
            data: this.toSummary(task),
          })
        }

        const snapshot = this.parseSnapshot(task.draft.snapshot)
        this.assertConfirmable(snapshot)

        const created = await this.createDepartureRecordFromSnapshot(
          organizationId,
          snapshot,
          tx,
        )
        const summary = this.departureService.toFreshDepartureSummary(created)

        await tx.aiCreateTask.update({
          where: { id: taskId },
          data: { departureId: created.id },
        })
        await isolateOpenTaskRuntime(tx, {
          taskId,
          errorCode: 'TASK_COMPLETED',
        })
        await tx.agentTask.update({
          where: { id: taskId },
          data: {
            status: AgentTaskStatus.completed,
            statusVersion: { increment: 1 },
            activities: {
              create: [
                {
                  organizationId,
                  actorUserId: userId,
                  kind: TaskActivityKind.business_object,
                  summary: '已创建发团',
                  payload: { targetKind: 'departure', targetId: created.id },
                },
                {
                  organizationId,
                  actorUserId: userId,
                  kind: TaskActivityKind.completed,
                  summary: '建团任务已完成',
                },
              ],
            },
          },
        })

        await tx.aiCreateIdempotencyRecord.update({
          where: { id: record.id },
          data: {
            resultJson: canonicalize(summary) as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        })

        return summary
      },
      { maxWait: 20_000, timeout: 20_000 },
    )
  }

  private async createDepartureRecordFromSnapshot(
    organizationId: string,
    snapshot: DepartureCreationDraftSnapshot,
    tx: Prisma.TransactionClient,
  ) {
    const name = snapshot.name?.trim()
    const startDate = snapshot.startDate?.trim()
    const endDate = snapshot.endDate?.trim()
    const ownerUserId = snapshot.ownerUserId?.trim()

    if (!name || !startDate || !endDate || !ownerUserId) {
      throw new BadRequestException('确认创建前须填写团名、出团日期、结束日期和负责人')
    }

    const departureType = this.toPrismaDepartureType(snapshot.departureType)

    if (snapshot.mode === DepartureCreationDraftMode.COPY) {
      const copyFromDepartureId = snapshot.copyFromDepartureId?.trim()
      if (!copyFromDepartureId) {
        throw new BadRequestException('复制发团缺少来源发团')
      }
      return this.departureService.copyRecord(
        organizationId,
        copyFromDepartureId,
        {
          name,
          startDate,
          endDate,
          ownerUserId,
          departureType,
          notes: snapshot.notes ?? undefined,
        },
        tx,
      )
    }

    return this.departureService.createRecord(
      organizationId,
      {
        name,
        routeName: snapshot.routeName.trim(),
        startDate,
        endDate,
        ownerUserId,
        departureType,
        notes: snapshot.notes ?? undefined,
        templateId:
          snapshot.mode === DepartureCreationDraftMode.TEMPLATE
            ? snapshot.templateId ?? undefined
            : undefined,
        driverSupplierId: snapshot.driverSupplierId ?? undefined,
        guideSupplierId: snapshot.guideSupplierId ?? undefined,
        vehiclePlate: snapshot.vehiclePlate ?? undefined,
        contactPhone: snapshot.contactPhone ?? undefined,
      },
      tx,
    )
  }

  private toPrismaDepartureType(
    value: string | null | undefined,
  ): PrismaDepartureType | undefined {
    if (!value) return undefined
    if (value === PrismaDepartureType.combined || value === PrismaDepartureType.independent) {
      return value
    }
    throw new BadRequestException('发团类型无效')
  }

  private async createTaskWithDraft(
    organizationId: string,
    userId: string,
    snapshot: DepartureCreationDraftSnapshot,
  ): Promise<AiCreateTaskSummary> {
    const task = await this.prisma.$transaction(async (tx) => {
      const genericTask = await tx.agentTask.create({
        data: {
          organizationId,
          ownerUserId: userId,
          type: AgentTaskType.departure_creation,
          goal: snapshot.routeName.trim()
            ? `创建发团：${snapshot.routeName.trim()}`
            : '创建发团',
          status: AgentTaskStatus.active,
          departureCreationTask: {
            create: {
              currentPhase: AiCreatePhase.BASIC_INFO,
              draft: {
                create: {
                  version: 1,
                  snapshot: snapshot as unknown as Prisma.InputJsonValue,
                },
              },
            },
          },
          activities: {
            create: {
              organizationId,
              actorUserId: userId,
              kind: TaskActivityKind.goal,
              summary: '创建发团',
              payload: { goalVersion: 1 },
            },
          },
        },
      })
      return tx.aiCreateTask.findUniqueOrThrow({
        where: { id: genericTask.id },
        include: TASK_WITH_PENDING_INCLUDE,
      })
    })
    return this.toSummary(task)
  }

  private async updateDraft(
    organizationId: string,
    userId: string,
    taskId: string,
    expectedVersion: number,
    snapshot: DepartureCreationDraftSnapshot,
  ): Promise<AiCreateTaskSummary> {
    return this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, organizationId, taskId)

      const task = await tx.aiCreateTask.findFirst({
        where: { id: taskId, agentTask: { organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      if (!task || !task.draft) {
        throw new NotFoundException('发团创建草稿不存在')
      }
      if (task.agentTask.ownerUserId !== userId) {
        throw new ForbiddenException('仅任务创建者可访问该 AI 建团任务')
      }
      if (
        task.agentTask.status !== AgentTaskStatus.active &&
        task.agentTask.status !== AgentTaskStatus.waiting
      ) {
        throw new BadRequestException('仅进行中的 AI 建团任务可保存草稿')
      }
      if (task.departureId) {
        throw new BadRequestException('已创建正式发团的任务不可再修改创建草稿')
      }
      if (task.draft.version !== expectedVersion) {
        throw new ConflictException({
          message: '草稿版本已变化，请基于最新快照重试',
          data: this.toSummary(task),
        })
      }

      const updated = await tx.departureCreationDraft.updateMany({
        where: { id: task.draft.id, version: expectedVersion },
        data: {
          version: expectedVersion + 1,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      })
      if (updated.count !== 1) {
        const latest = await tx.aiCreateTask.findFirst({
          where: { id: taskId, agentTask: { organizationId } },
          include: TASK_WITH_PENDING_INCLUDE,
        })
        throw new ConflictException({
          message: '草稿版本已变化，请基于最新快照重试',
          data: latest?.draft ? this.toSummary(latest) : this.toSummary(task),
        })
      }

      const draft = await tx.departureCreationDraft.findUniqueOrThrow({
        where: { id: task.draft.id },
      })
      return this.toSummary({ ...task, draft })
    })
  }

  private async findOwnedTaskOrThrow(
    organizationId: string,
    userId: string,
    taskId: string,
  ): Promise<TaskWithDraft> {
    const task = await this.prisma.aiCreateTask.findFirst({
      where: { id: taskId, agentTask: { organizationId } },
      include: TASK_WITH_PENDING_INCLUDE,
    })
    if (!task || !task.draft) {
      throw new NotFoundException('AI 建团任务不存在')
    }
    if (task.agentTask.ownerUserId !== userId) {
      throw new ForbiddenException('仅任务创建者可访问该 AI 建团任务')
    }
    return task
  }

  private async findOwnedInProgressTask(
    organizationId: string,
    userId: string,
    taskId: string,
  ): Promise<TaskWithDraft> {
    const task = await this.findOwnedTaskOrThrow(organizationId, userId, taskId)
    if (
      task.agentTask.status !== AgentTaskStatus.active &&
      task.agentTask.status !== AgentTaskStatus.waiting
    ) {
      throw new BadRequestException('仅进行中的 AI 建团任务可启动 AI 辅助')
    }
    if (task.departureId) {
      throw new BadRequestException('已创建正式发团的任务不可再启动 AI 辅助')
    }
    return task
  }

  private async canUseAssist(userId: string): Promise<boolean> {
    if (!isAiCreateAssistEnabledForUser(this.configService, userId)) return false
    const permissionKeys = await this.authService.getPermissionKeysForUser(userId)
    return permissionKeys.includes('departure:write')
  }

  private agentRuntimeUrl(): string {
    return this.configService.get<string>('app.aiCreateAssist.agentRuntimeUrl') ?? '/copilotkit'
  }

  private normalizeSnapshot(
    draft: DepartureCreationDraftSnapshotDto,
  ): DepartureCreationDraftSnapshot {
    const mode = draft.mode
    return {
      mode,
      routeName: draft.routeName?.trim() ?? '',
      templateId: emptyToNull(draft.templateId),
      copyFromDepartureId: emptyToNull(draft.copyFromDepartureId),
      defaultDayCount:
        draft.defaultDayCount === undefined || draft.defaultDayCount === null
          ? null
          : draft.defaultDayCount,
      name: emptyToNull(draft.name),
      startDate: emptyToNull(draft.startDate),
      endDate: emptyToNull(draft.endDate),
      ownerUserId: emptyToNull(draft.ownerUserId),
      departureType: draft.departureType ?? DepartureType.COMBINED,
      notes: emptyToNull(draft.notes),
      driverSupplierId: emptyToNull(draft.driverSupplierId),
      guideSupplierId: emptyToNull(draft.guideSupplierId),
      vehiclePlate: emptyToNull(draft.vehiclePlate),
      contactPhone: emptyToNull(draft.contactPhone),
      expectedGuestCountHint:
        draft.expectedGuestCountHint === undefined || draft.expectedGuestCountHint === null
          ? null
          : draft.expectedGuestCountHint,
    }
  }

  private assertValidDraft(snapshot: DepartureCreationDraftSnapshot): void {
    if (snapshot.mode === DepartureCreationDraftMode.TEMPLATE) {
      if (!snapshot.templateId) {
        throw new BadRequestException('选择路线模板时须提供 templateId')
      }
      return
    }
    if (snapshot.mode === DepartureCreationDraftMode.COPY) {
      if (!snapshot.copyFromDepartureId) {
        throw new BadRequestException('复制发团时须提供 copyFromDepartureId')
      }
      return
    }
    if (!snapshot.routeName.trim()) {
      throw new BadRequestException('手动路线须填写路线名称')
    }
  }

  private assertConfirmable(snapshot: DepartureCreationDraftSnapshot): void {
    this.assertValidDraft(snapshot)
    if (!snapshot.name?.trim()) {
      throw new BadRequestException('团名不能为空')
    }
    if (!snapshot.startDate || !snapshot.endDate) {
      throw new BadRequestException('出团日期与结束日期不能为空')
    }
    if (snapshot.endDate < snapshot.startDate) {
      throw new BadRequestException('结束日期不能早于出团日期')
    }
    if (!snapshot.ownerUserId?.trim()) {
      throw new BadRequestException('负责人不能为空')
    }
  }

  private parseSnapshot(raw: Prisma.JsonValue): DepartureCreationDraftSnapshot {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('发团创建草稿快照损坏')
    }
    return this.normalizeSnapshot(raw as unknown as DepartureCreationDraftSnapshotDto)
  }

  private assertStoredProposalIntegrity(
    pkg: AiReviewPackage,
    candidates: StoredReviewCandidate[],
  ): void {
    for (const candidate of candidates) {
      try {
        aiReviewCandidateInputSchema.parse({
          fieldKey: candidate.fieldKey,
          proposedValue: candidate.proposedValue,
          clarity: candidate.clarity,
          evidence: candidate.evidence,
        })
      } catch {
        throw new BadRequestException('审核证据已失效，请基于最新状态重新生成')
      }
    }
    const expectedHash = departureReviewProposalHash({
      objectVersion: pkg.baseObjectVersion,
      confirmationUnit: 'basic_info_draft',
      candidates: candidates.map((candidate) => ({
        fieldKey: candidate.fieldKey,
        proposedValue: candidate.proposedValue,
        clarity: candidate.clarity,
        evidence: candidate.evidence,
      })) as ReturnType<typeof submitReviewPackageInputSchema.parse>['candidates'],
    })
    if (pkg.proposalHash && pkg.proposalHash !== expectedHash) {
      throw new ConflictException('审核提案内容与记录 Hash 不一致，请重新生成')
    }
  }

  private async assertCurrentWritePermission(userId: string): Promise<void> {
    const permissionKeys = await this.authService.getPermissionKeysForUser(userId)
    if (!permissionKeys.includes('departure:write')) {
      throw new ForbiddenException('当前权限已撤销，不能处理审核包')
    }
  }

  private async replaySubmittedReviewPackage(
    tx: Prisma.TransactionClient,
    params: {
      sourceActionId: string
      inputBatchId: string
      targetId: string
      reviewPackage: ReturnType<typeof submitReviewPackageInputSchema.parse>
    },
  ): Promise<SubmitReviewPackageOutput | null> {
    const byAction = await tx.aiReviewPackage.findFirst({
      where: { sourceActionId: params.sourceActionId },
      select: { id: true, candidates: true, baseObjectVersion: true },
    })
    if (byAction) {
      return submitReviewPackageOutputSchema.parse({
        reviewPackageId: byAction.id,
        status: 'pending',
        objectVersion: byAction.baseObjectVersion,
        fieldKeys: parseStoredCandidates(byAction.candidates).map((candidate) => candidate.fieldKey),
      })
    }
    const byIdentity = await findReviewPackageByProposalIdentity(tx, {
      inputBatchId: params.inputBatchId,
      capabilityVersion: AI_CREATE_CAPABILITY_REFS_BY_TOOL.submitReviewPackage.version,
      targetKind: DEPARTURE_REVIEW_TARGET_KIND,
      targetId: params.targetId,
      proposalHash: departureReviewProposalHash(params.reviewPackage),
    })
    if (!byIdentity) {
      return null
    }
    return submitReviewPackageOutputSchema.parse({
      reviewPackageId: byIdentity.id,
      status: 'pending',
      objectVersion: params.reviewPackage.objectVersion,
      fieldKeys: parseStoredCandidates(byIdentity.candidates).map((candidate) => candidate.fieldKey),
    })
  }

  private async replayReviewDecision(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      taskId: string
      operation: string
      decisionCommandId: string
      requestHash: string
    },
  ): Promise<
    | { kind: 'ok'; summary: AiCreateTaskSummary; events: [] }
    | {
        kind: 'conflict'
        summary: AiCreateTaskSummary
        events: []
        changeSummary: ReturnType<typeof reviewConflictChangeSummary>
      }
    | {
        kind: 'validation_failed'
        summary: AiCreateTaskSummary
        events: []
        message: string
      }
    | null
  > {
    const record = await tx.aiCreateIdempotencyRecord.upsert({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId: params.organizationId,
          operation: params.operation,
          idempotencyKey: params.decisionCommandId,
        },
      },
      create: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        operation: params.operation,
        idempotencyKey: params.decisionCommandId,
        requestHash: params.requestHash,
      },
      update: {},
    })
    if (record.taskId !== params.taskId) {
      throw new ConflictException('决策命令已被其他任务使用')
    }
    if (record.requestHash !== params.requestHash) {
      throw new ConflictException('决策命令已被其他请求载荷使用')
    }
    if (!record.completedAt) {
      return null
    }
    const stored = record.resultJson as
      | { kind: 'ok'; summary: AiCreateTaskSummary }
      | {
          kind: 'conflict'
          summary: AiCreateTaskSummary
          changeSummary: ReturnType<typeof reviewConflictChangeSummary>
        }
      | { kind: 'validation_failed'; summary: AiCreateTaskSummary; message: string }
      | null
    if (!stored || Array.isArray(stored)) {
      throw new ConflictException('决策命令结果不可用，请联系管理员')
    }
    if (stored.kind === 'conflict') {
      return { kind: 'conflict', summary: stored.summary, events: [], changeSummary: stored.changeSummary }
    }
    if (stored.kind === 'validation_failed') {
      return {
        kind: 'validation_failed',
        summary: stored.summary,
        events: [],
        message: stored.message,
      }
    }
    return { kind: 'ok', summary: stored.summary, events: [] }
  }

  private async completeReviewDecision(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      taskId: string
      decisionCommandId: string
      requestHash: string
      result: unknown
    },
  ): Promise<void> {
    await tx.aiCreateIdempotencyRecord.update({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId: params.organizationId,
          operation: REVIEW_CONFIRM_OPERATION,
          idempotencyKey: params.decisionCommandId,
        },
      },
      data: {
        requestHash: params.requestHash,
        resultJson: canonicalize(params.result) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    })
  }

  private async markPackageConflict(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      userId: string
      taskId: string
      pkg: AiReviewPackage
      candidates: StoredReviewCandidate[]
      corrections: Partial<Record<AiReviewableBasicInfoField, string | number | null>>
      submissions: Partial<Record<AiReviewableBasicInfoField, string | number | null>>
      currentVersion: number
      changeSummary: ReturnType<typeof reviewConflictChangeSummary>
      decisionCommandId?: string
    },
  ) {
    const claimed = await tx.aiReviewPackage.updateMany({
      where: {
        id: params.pkg.id,
        status: { in: [AiReviewPackageStatus.pending, AiReviewPackageStatus.conflict] },
      },
      data: {
        status: AiReviewPackageStatus.conflict,
        version: { increment: 1 },
      },
    })
    if (claimed.count !== 1 && params.pkg.status !== AiReviewPackageStatus.conflict) {
      await this.throwAlreadyHandled(tx, params.organizationId, params.taskId)
    }
    await this.writeReviewRecord(tx, {
      organizationId: params.organizationId,
      packageId: params.pkg.id,
      operatorUserId: params.userId,
      action: AiReviewRecordAction.confirm,
      decisionCommandId: params.decisionCommandId,
      candidates: params.candidates,
      corrections: params.corrections,
      submittedValues: params.submissions,
      objectVersion: params.currentVersion,
      writeResult: AiReviewWriteResult.conflict,
      conflictFields: params.changeSummary.changedFieldKeys,
    })
    return this.conversationService.recordReviewConflict(tx, {
      organizationId: params.organizationId,
      taskId: params.taskId,
      userId: params.userId,
      reviewPackageId: params.pkg.id,
      conversationId: params.pkg.conversationId,
      inputBatchId: params.pkg.inputBatchId,
      changeSummary: params.changeSummary,
    })
  }

  private async invalidateOtherPendingPackages(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      userId: string
      taskId: string
      exceptPackageId: string
      targetKind: string
      targetId: string
      currentVersion: number
      currentSnapshot: DepartureCreationDraftSnapshot
    },
  ) {
    const stale = await tx.aiReviewPackage.findMany({
      where: {
        organizationId: params.organizationId,
        targetKind: params.targetKind,
        targetId: params.targetId,
        status: AiReviewPackageStatus.pending,
        id: { not: params.exceptPackageId },
      },
    })
    const events = []
    for (const pkg of stale) {
      const baseline = this.parseSnapshot(pkg.baselineSnapshot)
      const changeSummary = reviewConflictChangeSummary({
        baseVersion: pkg.baseObjectVersion,
        currentVersion: params.currentVersion,
        baseline,
        current: params.currentSnapshot,
      })
      events.push(
        ...(await this.markPackageConflict(tx, {
          organizationId: params.organizationId,
          userId: params.userId,
          taskId: params.taskId,
          pkg,
          candidates: parseStoredCandidates(pkg.candidates),
          corrections: this.parseCorrections(
            (pkg.userCorrections as Record<string, string | number | null> | undefined) ?? undefined,
          ),
          submissions: {},
          currentVersion: params.currentVersion,
          changeSummary,
        })),
      )
    }
    return events
  }

  private async lockPendingPackage(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    taskId: string,
    packageId: string,
    expectedPackageVersion?: number,
    allowedStatuses: AiReviewPackageStatus[] = [AiReviewPackageStatus.pending],
  ): Promise<AiReviewPackage> {
    await lockAiCreateTask(tx, organizationId, taskId)
    const task = await tx.aiCreateTask.findFirst({
      where: { id: taskId, agentTask: { organizationId } },
      include: { agentTask: true },
    })
    if (!task) {
      throw new NotFoundException('AI 建团任务不存在')
    }
    if (task.agentTask.ownerUserId !== userId) {
      throw new ForbiddenException('仅任务创建者可处理审核包')
    }
    if (
      task.agentTask.status !== AgentTaskStatus.active &&
      task.agentTask.status !== AgentTaskStatus.waiting
    ) {
      throw new BadRequestException('仅进行中的 AI 建团任务可处理审核包')
    }
    const pkg = await tx.aiReviewPackage.findFirst({
      where: { id: packageId, taskId, organizationId },
    })
    if (!pkg) {
      throw new NotFoundException('审核包不存在')
    }
    if (!allowedStatuses.includes(pkg.status)) {
      await this.throwAlreadyHandled(tx, organizationId, taskId)
    }
    if (
      pkg.status === AiReviewPackageStatus.pending &&
      expectedPackageVersion != null &&
      pkg.version !== expectedPackageVersion
    ) {
      throw new ConflictException('审核包版本已变化，请刷新后重试')
    }
    return pkg
  }

  private async throwAlreadyHandled(
    tx: Prisma.TransactionClient,
    organizationId: string,
    taskId: string,
  ): Promise<never> {
    const task = await tx.aiCreateTask.findFirstOrThrow({
      where: { id: taskId, agentTask: { organizationId } },
      include: TASK_WITH_PENDING_INCLUDE,
    })
    throw new ConflictException({
      message: REVIEW_ALREADY_HANDLED_MESSAGE,
      data: this.toSummary(task),
    })
  }

  private parseCorrections(
    raw: Record<string, string | number | null> | undefined,
  ): Partial<Record<AiReviewableBasicInfoField, string | number | null>> {
    if (!raw) return {}
    const allowed = new Set<string>(AI_REVIEWABLE_BASIC_INFO_FIELDS)
    const corrections: Partial<Record<AiReviewableBasicInfoField, string | number | null>> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (!allowed.has(key)) {
        throw new BadRequestException('不能修正负责人和发团类型等系统关联字段')
      }
      corrections[key as AiReviewableBasicInfoField] = value
    }
    return corrections
  }

  private applyCorrections(
    candidates: StoredReviewCandidate[],
    corrections: Partial<Record<AiReviewableBasicInfoField, string | number | null>>,
  ): StoredReviewCandidate[] {
    return candidates.map((candidate) => {
      if (!(candidate.fieldKey in corrections)) return candidate
      return {
        ...candidate,
        userCorrectedValue: corrections[candidate.fieldKey] ?? null,
      }
    })
  }

  private async writeReviewRecord(
    tx: Prisma.TransactionClient,
    args: {
      organizationId: string
      packageId: string
      operatorUserId: string
      action: AiReviewRecordAction
      decisionCommandId?: string
      candidates: StoredReviewCandidate[]
      corrections: Partial<Record<AiReviewableBasicInfoField, string | number | null>>
      submittedValues: Partial<Record<AiReviewableBasicInfoField, string | number | null>>
      objectVersion: number
      writeResult: AiReviewWriteResult
      conflictFields?: string[]
    },
  ): Promise<void> {
    await tx.aiReviewRecord.create({
      data: {
        organizationId: args.organizationId,
        packageId: args.packageId,
        operatorUserId: args.operatorUserId,
        action: args.action,
        decisionCommandId: args.decisionCommandId,
        originalCandidates: args.candidates.map((candidate) => ({
          fieldKey: candidate.fieldKey,
          proposedValue: candidate.proposedValue,
        })) as Prisma.InputJsonValue,
        userCorrections: args.corrections as Prisma.InputJsonValue,
        submittedValues: args.submittedValues as Prisma.InputJsonValue,
        evidence: args.candidates.flatMap((candidate) => candidate.evidence) as Prisma.InputJsonValue,
        objectVersion: args.objectVersion,
        writeResult: args.writeResult,
        conflictFields: args.conflictFields as Prisma.InputJsonValue | undefined,
      },
    })
  }

  private toSummary(task: TaskWithDraft): AiCreateTaskSummary {
    if (!task.draft) {
      throw new BadRequestException('发团创建草稿不存在')
    }
    const snapshot = this.parseSnapshot(task.draft.snapshot)
    const pendingReviews = (task.agentTask.reviewPackages ?? []).map((pending) =>
      toReviewPackageView({
        ...pending,
        baselineSnapshot: this.parseSnapshot(pending.baselineSnapshot),
      }),
    )
    return {
      id: task.id,
      status:
        task.agentTask.status === AgentTaskStatus.completed
          ? 'completed'
          : task.agentTask.status === AgentTaskStatus.cancelled ||
              task.agentTask.status === AgentTaskStatus.closed
            ? 'abandoned'
            : 'in_progress',
      currentPhase: task.currentPhase,
      departureId: task.departureId,
      creatorUserId: task.agentTask.ownerUserId,
      statusVersion: task.agentTask.statusVersion,
      createdAt: task.agentTask.createdAt.toISOString(),
      updatedAt: task.agentTask.updatedAt.toISOString(),
      draft: {
        version: task.draft.version,
        snapshot,
        updatedAt: task.draft.updatedAt.toISOString(),
      },
      pendingReview: pendingReviews.length === 1 ? pendingReviews[0] : null,
      pendingReviews,
    }
  }
}
