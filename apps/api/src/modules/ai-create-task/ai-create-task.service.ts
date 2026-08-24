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
  AI_REVIEWABLE_BASIC_INFO_FIELDS,
  type GetTaskContextOutput,
  type SearchRouteTemplatesOutput,
  type SubmitReviewPackageOutput,
  type AiReviewableBasicInfoField,
} from '@xiaotuanbao/ai-contracts'
import type { AgentTask, AiCreateTask, AiReviewPackage, DepartureCreationDraft, Prisma } from '@prisma/client'
import { AgentTaskStatus, AgentTaskType, AiCreateActivityRunStatus, AiReviewPackageStatus, AiReviewRecordAction, AiReviewWriteResult, DepartureType as PrismaDepartureType, TaskActivityKind } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureService } from '../departure/departure.service'
import { RouteTemplateService } from '../departure/route-template.service'
import { AuthService } from '../auth/auth.service'
import type {
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
import { lockAiCreateTask } from './ai-create-task.lock'
import { DepartureMaterialService } from './departure-material.service'
import {
  parseStoredCandidates,
  reviewConfirmValues,
  toReviewPackageView,
  toStoredCandidates,
  type StoredReviewCandidate,
} from './review-package.mapper'
import { httpPendingReviewDisposition } from './review-package.projection'

const CONFIRM_OPERATION = 'ai-create-task.confirm'

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
        take: 1,
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
    const pending = summary.pendingReview
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
        hasPendingReview: Boolean(pending),
        reviewPackageId: pending?.id ?? null,
      },
      availableCapabilities: capabilitiesForPendingReview(Boolean(pending)),
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
      taskId: caller.taskId,
      inputBatchId: caller.inputBatchId,
      materialId: input.materialId,
      parseResultVersion: input.parseResultVersion,
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
    caller: { userId: string; organizationId: string; taskId: string; runId: string },
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
      if (task.agentTask.status !== AgentTaskStatus.active || task.departureId) {
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

      const pending = task.agentTask.reviewPackages?.[0]
      const disposition = httpPendingReviewDisposition(pending, options.sourceActionId)
      if (disposition === 'reject') {
        throw AiCollaborationHttpException.fromCode('REVIEW_PENDING')
      }
      if (disposition === 'replay' && pending) {
        const stored = parseStoredCandidates(pending.candidates)
        return submitReviewPackageOutputSchema.parse({
          reviewPackageId: pending.id,
          status: 'pending',
          objectVersion: task.draft.version,
          fieldKeys: stored.map((candidate) => candidate.fieldKey),
        })
      }
      if (!options.sourceActionId) {
        throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
      }

      const stored = toStoredCandidates(input.candidates)
      const created = await tx.aiReviewPackage.create({
        data: {
          organizationId: caller.organizationId,
          taskId: caller.taskId,
          runId: caller.runId,
          status: AiReviewPackageStatus.pending,
          confirmationUnit: input.confirmationUnit,
          baseObjectVersion: task.draft.version,
          baselineSnapshot: task.draft.snapshot as Prisma.InputJsonValue,
          candidates: stored as unknown as Prisma.InputJsonValue,
          sourceActionId: options.sourceActionId,
        },
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
      const candidates = this.applyCorrections(parseStoredCandidates(pkg.candidates), corrections)
      await tx.aiReviewPackage.update({
        where: { id: pkg.id },
        data: { candidates: candidates as unknown as Prisma.InputJsonValue },
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
      await tx.taskActivity.create({
        data: {
          organizationId,
          taskId,
          actorUserId: userId,
          kind: TaskActivityKind.waiting,
          summary: 'User 已取消指定审核等待项',
          payload: { reviewPackageId: pkg.id, disposition: 'rejected' },
        },
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
  ): Promise<AiCreateTaskSummary> {
    const requestCorrections = this.parseCorrections(dto.corrections)
    const { summary, events } = await this.prisma.$transaction(async (tx) => {
      const pkg = await this.lockPendingPackage(
        tx,
        organizationId,
        userId,
        taskId,
        packageId,
        dto.expectedPackageVersion,
      )
      const task = await tx.aiCreateTask.findFirstOrThrow({
        where: { id: taskId, agentTask: { organizationId } },
        include: TASK_WITH_PENDING_INCLUDE,
      })
      if (!task.draft) {
        throw new NotFoundException('发团创建草稿不存在')
      }

      const candidates = this.applyCorrections(
        parseStoredCandidates(pkg.candidates),
        requestCorrections,
      )
      const { corrections, submissions } = reviewConfirmValues(candidates)

      if (task.draft.version !== dto.expectedVersion) {
        await this.writeReviewRecord(tx, {
          organizationId,
          packageId: pkg.id,
          operatorUserId: userId,
          action: AiReviewRecordAction.confirm,
          candidates,
          corrections,
          submittedValues: submissions,
          objectVersion: task.draft.version,
          writeResult: AiReviewWriteResult.conflict,
          conflictFields: [],
        })
        throw new ConflictException({
          message: '草稿版本已变化，请基于最新快照重试',
          data: {
            ...this.toSummary(task),
            reviewConflict: { status: 'draft_version', conflictFields: [] },
          },
        })
      }

      const baseline = this.parseSnapshot(pkg.baselineSnapshot)
      const current = this.parseSnapshot(task.draft.snapshot)
      const merge = evaluateReviewConfirmMerge({
        baselineSnapshot: baseline,
        currentSnapshot: current,
        submissions,
      })

      if (merge.status === 'conflict') {
        await this.writeReviewRecord(tx, {
          organizationId,
          packageId: pkg.id,
          operatorUserId: userId,
          action: AiReviewRecordAction.confirm,
          candidates,
          corrections,
          submittedValues: submissions,
          objectVersion: task.draft.version,
          writeResult: AiReviewWriteResult.conflict,
          conflictFields: merge.conflictFields,
        })
        throw new ConflictException({
          message: '草稿在候选产生后已变化，旧候选不能覆盖新值',
          data: {
            ...this.toSummary(task),
            reviewConflict: {
              status: 'candidate_stale',
              conflictFields: merge.conflictFields,
            },
          },
        })
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
            candidates,
            corrections,
            submittedValues: submissions,
            objectVersion: task.draft.version,
            writeResult: AiReviewWriteResult.validation_failed,
          })
          throw new BadRequestException('常用路线已不可用，请重新选择后确认')
        }
        merge.nextSnapshot.mode = DepartureCreationDraftMode.TEMPLATE
        merge.nextSnapshot.templateId = template.id
        merge.nextSnapshot.routeName = template.name
        merge.nextSnapshot.defaultDayCount = template.defaultDayCount
      }

      try {
        this.assertValidDraft(merge.nextSnapshot)
      } catch (error) {
        await this.writeReviewRecord(tx, {
          organizationId,
          packageId: pkg.id,
          operatorUserId: userId,
          action: AiReviewRecordAction.confirm,
          candidates,
          corrections,
          submittedValues: submissions,
          objectVersion: task.draft.version,
          writeResult: AiReviewWriteResult.validation_failed,
        })
        throw error
      }

      const claimed = await tx.aiReviewPackage.updateMany({
        where: {
          id: pkg.id,
          status: AiReviewPackageStatus.pending,
          version: dto.expectedPackageVersion,
        },
        data: {
          status: AiReviewPackageStatus.confirmed,
          version: { increment: 1 },
          candidates: candidates.map((candidate) => ({
            ...candidate,
            status: 'confirmed',
          })) as unknown as Prisma.InputJsonValue,
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
        candidates,
        corrections,
        submittedValues: submissions,
        objectVersion: nextVersion,
        writeResult: AiReviewWriteResult.success,
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
      return { summary: this.toSummary(updated), events }
    })
    for (const event of events) {
      this.conversationService.publish(event.conversationId, event)
    }
    return summary
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

  private async lockPendingPackage(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    taskId: string,
    packageId: string,
    expectedPackageVersion?: number,
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
    if (pkg.status !== AiReviewPackageStatus.pending) {
      await this.throwAlreadyHandled(tx, organizationId, taskId)
    }
    if (expectedPackageVersion != null && pkg.version !== expectedPackageVersion) {
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
    const pending = task.agentTask.reviewPackages?.[0]
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
      createdAt: task.agentTask.createdAt.toISOString(),
      updatedAt: task.agentTask.updatedAt.toISOString(),
      draft: {
        version: task.draft.version,
        snapshot,
        updatedAt: task.draft.updatedAt.toISOString(),
      },
      pendingReview: pending
        ? toReviewPackageView({
            ...pending,
            baselineSnapshot: this.parseSnapshot(pending.baselineSnapshot),
          })
        : null,
    }
  }
}
