import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  nextReviewItemIdentity,
  requiredPermissionKeyForReviewPayloadSchema,
  SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT,
  SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA,
  SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
  historyStatusFromClassification,
  sourceOrderReceivableReviewCandidates,
} from '@xiaotuanbao/ai-contracts'
import type {
  AcceptReviewConfirmationDto,
  AiReviewPackageView,
  DepartureCollaborationView,
  ReviewConfirmationView,
  ReviewRevisionView,
} from '@xiaotuanbao/shared'
import {
  AiInputBatchStatus,
  AiReviewPackageStatus,
  AiReviewRecordAction,
  AiReviewWriteResult,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  type AiReviewPackage,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureService } from '../departure/departure.service'
import { DepartureResourceService } from '../departure/departure-resource.service'
import { SegmentResourceService } from '../departure/segment-resource.service'
import { SourceOrderService } from '../departure/source-order.service'
import { AuthService } from '../auth/auth.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import { DepartureFinanceGenerationService } from '../finance/departure-finance-generation.service'
import { lockAiCreateTask, lockAgentConversation } from './ai-create-task.lock'
import { findInFlightReviewConfirmJob } from './review-confirm-in-flight'
import { AiCreateTaskService } from './ai-create-task.service'
import { AiConversationService } from './ai-conversation.service'
import { reviewDecisionRequestHash, reviewProposalHash } from './review-package.envelope'
import { reviewConfirmValues, toReviewPackageView, toStoredCandidates } from './review-package.mapper'
import { departureObjectVersion } from './review-package.projection'
import {
  sourceOrderWriteFromReviewValues,
  valuesFromReviewPackage,
} from './source-order-review.mapper'
import { ensureDepartureCollaborationTaskInTx } from './ensure-departure-collaboration-task'
import {
  REVIEW_CONFIRM_BATCH_OPERATION,
  REVIEW_CONFIRM_ITEM_OPERATION,
  decisionCommandIdFromReviewConfirmJobKey,
  reviewConfirmItemKey,
  reviewConfirmJobKey,
} from './review-collaboration.constants'
import {
  DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  resolveDepartureResourceReviewDraft,
  resolveSegmentResourceReviewDraft,
} from '@xiaotuanbao/ai-contracts'

const REVISION_PENDING_REASON = '助手正在核对该事项，请等待更新后再确认'
const REVISING_BATCH_STATUSES: AiInputBatchStatus[] = [
  AiInputBatchStatus.waiting_for_materials,
  AiInputBatchStatus.ready_for_agent,
  AiInputBatchStatus.preparing_context,
  AiInputBatchStatus.agent_running,
  AiInputBatchStatus.awaiting_user_input,
]

@Injectable()
export class ReviewCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: AiCreateTaskService,
    private readonly conversations: AiConversationService,
    private readonly departures: DepartureService,
    private readonly segmentResources: SegmentResourceService,
    private readonly departureResources: DepartureResourceService,
    private readonly sourceOrders: SourceOrderService,
    private readonly auth: AuthService,
    private readonly finance: DepartureFinanceFacade,
    private readonly generation: DepartureFinanceGenerationService,
  ) {}

  async ensureDepartureCollaborationTask(
    organizationId: string,
    userId: string,
    departureId: string,
    conversationId: string,
  ): Promise<{ taskId: string; departureId: string }> {
    await this.departures.getById(organizationId, departureId)
    return this.prisma.$transaction(async (tx) => {
      await lockAgentConversation(tx, organizationId, conversationId)
      const conversation = await tx.aiConversation.findFirst({
        where: { id: conversationId, organizationId, creatorUserId: userId },
      })
      if (!conversation) {
        throw new NotFoundException('会话不存在')
      }
      const task = await ensureDepartureCollaborationTaskInTx(tx, {
        organizationId,
        userId,
        departureId,
        conversationId,
      })
      return { taskId: task.id, departureId }
    })
  }

  async prepareSourceOrderReceivableReview(
    organizationId: string,
    userId: string,
    departureId: string,
    dto: { sourceOrderId: string; conversationId: string },
  ): Promise<AiReviewPackageView> {
    const permissionKeys = await this.auth.getPermissionKeysForUser(userId)
    if (!permissionKeys.includes('/departure')) {
      throw new ForbiddenException('无权准备初始应收')
    }
    await this.departures.getById(organizationId, departureId)
    return this.prisma.$transaction(async (tx) => {
      await lockAgentConversation(tx, organizationId, dto.conversationId)
      const conversation = await tx.aiConversation.findFirst({
        where: { id: dto.conversationId, organizationId, creatorUserId: userId },
      })
      if (!conversation) {
        throw new NotFoundException('会话不存在')
      }
      const sourceOrder = await tx.sourceOrder.findFirst({
        where: {
          id: dto.sourceOrderId,
          departureId,
          departure: { organizationId },
        },
        select: { id: true },
      })
      if (!sourceOrder) {
        throw new NotFoundException('客源单不存在')
      }
      const sourceRecords = await tx.aiReviewRecord.findMany({
        where: {
          organizationId,
          writeResult: AiReviewWriteResult.success,
          package: {
            conversationId: dto.conversationId,
            payloadSchema: SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
            status: AiReviewPackageStatus.confirmed,
          },
        },
        orderBy: { createdAt: 'desc' },
        include: { package: true },
      })
      const sourceRecord = sourceRecords.find(
        (record) => parseStoredResultRef(record.afterSnapshot)?.objectId === dto.sourceOrderId,
      )
      const sourcePackage = sourceRecord?.package
      const taskId = sourcePackage?.taskId
      const inputBatchId = sourcePackage?.inputBatchId
      if (!sourcePackage || !taskId || !inputBatchId) {
        throw new BadRequestException('只能从本次成功创建的客源继续提交应收')
      }
      await lockAiCreateTask(tx, organizationId, taskId)
      const siblings = await tx.aiReviewPackage.findMany({
        where: { organizationId, conversationId: dto.conversationId },
        select: {
          id: true,
          status: true,
          version: true,
          itemIdentity: true,
          payloadSchema: true,
          baselineSnapshot: true,
        },
      })
      const existing = siblings.find(
        (pkg) =>
          pkg.payloadSchema === SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA &&
          sourceOrderIdFromBaseline(pkg.baselineSnapshot) === dto.sourceOrderId,
      )
      if (existing?.status === AiReviewPackageStatus.confirmed) {
        const confirmed = await tx.aiReviewPackage.findFirstOrThrow({ where: { id: existing.id } })
        return toReviewPackageView(confirmed)
      }
      if (existing?.status === AiReviewPackageStatus.pending) {
        const inFlight = await findInFlightReviewConfirmJob(tx, existing.id)
        if (inFlight) {
          throw new ConflictException('该事项正在确认中，暂不可重复准备')
        }
      }
      const preview = await this.generation.previewInitialReceivables(
        organizationId,
        dto.sourceOrderId,
        tx,
      )
      const candidates = sourceOrderReceivableReviewCandidates({
        sourceOrderId: preview.order.id,
        displayName: preview.order.displayName,
        partnerName: preview.order.partner.name,
        collectionMode: preview.order.collectionMode,
        netReceivableCents: preview.order.netReceivableCents,
        paths: preview.expectedPaths,
        classification: preview.classification,
      })
      const stored = toStoredCandidates(candidates)
      const baselineSnapshot = {
        sourceOrderId: preview.order.id,
        collectionMode: preview.order.collectionMode,
        depositCents: preview.order.depositCents,
        balanceCents: preview.order.balanceCents,
        netReceivableCents: preview.order.netReceivableCents,
        partnerId: preview.order.partnerId,
      }
      const departure = await tx.departure.findFirstOrThrow({
        where: { id: departureId, organizationId },
        select: { updatedAt: true },
      })
      if (existing?.status === AiReviewPackageStatus.pending) {
        const updated = await tx.aiReviewPackage.update({
          where: { id: existing.id },
          data: {
            candidates: stored as unknown as Prisma.InputJsonValue,
            baselineSnapshot,
            proposalHash: reviewProposalHash({
              confirmationUnit: SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT,
              candidates,
            }),
            version: { increment: 1 },
            baseObjectVersion: departureObjectVersion(departure.updatedAt),
          },
        })
        return toReviewPackageView(updated)
      }
      const created = await tx.aiReviewPackage.create({
        data: {
          organizationId,
          taskId,
          conversationId: dto.conversationId,
          inputBatchId,
          attemptId: sourcePackage.attemptId,
          status: AiReviewPackageStatus.pending,
          confirmationUnit: SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT,
          payloadSchema: SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA,
          capabilityKey: 'departure.source-order-receivable.prepare',
          capabilityVersion: 1,
          targetKind: 'departure',
          targetId: departureId,
          itemIdentity: nextReviewItemIdentity(
            (
              await tx.aiReviewPackage.findMany({
                where: { inputBatchId },
                select: { itemIdentity: true },
              })
            ).map((pkg) => pkg.itemIdentity),
          ),
          proposalHash: reviewProposalHash({
            confirmationUnit: SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT,
            candidates,
          }),
          baseObjectVersion: departureObjectVersion(departure.updatedAt),
          baselineSnapshot,
          candidates: stored as unknown as Prisma.InputJsonValue,
          version: 1,
        },
      })
      return toReviewPackageView(created)
    })
  }

  async acceptReviewConfirmation(
    organizationId: string,
    userId: string,
    dto: AcceptReviewConfirmationDto,
  ): Promise<ReviewConfirmationView> {
    const packageIds = dto.items.map((item) => item.packageId)
    if (new Set(packageIds).size !== packageIds.length) {
      throw new BadRequestException('确认选择不能包含重复事项')
    }
    const requestHash = reviewDecisionRequestHash({
      decisionCommandId: dto.decisionCommandId,
      items: dto.items.map((item) => ({
        packageId: item.packageId,
        expectedPackageVersion: item.expectedPackageVersion,
      })),
    })
    const outcome = await this.prisma.$transaction(async (tx) => {
      const packages = await tx.aiReviewPackage.findMany({
        where: { id: { in: packageIds }, organizationId },
        include: { task: true },
      })
      if (packages.length !== packageIds.length) {
        throw new NotFoundException('审核事项不存在')
      }
      const permissionKeys = await this.auth.getPermissionKeysForUser(userId)
      for (const pkg of packages) {
        if (!pkg.task || pkg.task.organizationId !== organizationId) {
          throw new ForbiddenException('无权确认该事项')
        }
        if (pkg.task.ownerUserId !== userId) {
          throw new ForbiddenException('仅事项所有者可确认')
        }
        const required = requiredPermissionKeyForReviewPayloadSchema(pkg.payloadSchema)
        if (!permissionKeys.includes(required)) {
          throw new ForbiddenException('无权确认该事项')
        }
      }
      const record = await tx.aiCreateIdempotencyRecord.upsert({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId,
            operation: REVIEW_CONFIRM_BATCH_OPERATION,
            idempotencyKey: dto.decisionCommandId,
          },
        },
        create: {
          organizationId,
          operation: REVIEW_CONFIRM_BATCH_OPERATION,
          idempotencyKey: dto.decisionCommandId,
          requestHash,
          requestSnapshot: dto as unknown as Prisma.InputJsonValue,
          operatorUserId: userId,
          taskId: packages[0]?.taskId,
        },
        update: {},
      })
      if (record.requestHash !== requestHash) {
        throw new ConflictException('幂等键已用于不同的确认选择')
      }
      if (record.resultJson) {
        return record.resultJson as unknown as ReviewConfirmationView
      }
      const items = []
      for (const item of dto.items) {
        const pkg = packages.find((candidate) => candidate.id === item.packageId)
        if (!pkg?.conversationId || !pkg.inputBatchId || !pkg.taskId) {
          throw new BadRequestException('审核事项缺少来源会话，无法受理确认')
        }
        await lockAiCreateTask(tx, organizationId, pkg.taskId)
        const current = await tx.aiReviewPackage.findFirst({
          where: { id: pkg.id, organizationId, taskId: pkg.taskId },
        })
        if (!current) {
          throw new NotFoundException('审核事项不存在')
        }
        if (current.status !== AiReviewPackageStatus.pending) {
          throw new ConflictException('仅待审核事项可确认')
        }
        if (current.version !== item.expectedPackageVersion) {
          throw new ConflictException('审核包版本已变化，请刷新后重试')
        }
        if (!current.conversationId || !current.inputBatchId || !current.taskId) {
          throw new BadRequestException('审核事项缺少来源会话，无法受理确认')
        }
        await this.assertNoPendingRevision(tx, organizationId, current)
        const jobKey = reviewConfirmJobKey(dto.decisionCommandId, current.id)
        const inFlight = await findInFlightReviewConfirmJob(tx, current.id, jobKey)
        if (inFlight) {
          throw new ConflictException('该事项正在确认中，暂不可重复确认')
        }
        const itemKey = reviewConfirmItemKey(dto.decisionCommandId, current.id)
        await tx.aiCreateIdempotencyRecord.upsert({
          where: {
            organizationId_operation_idempotencyKey: {
              organizationId,
              operation: REVIEW_CONFIRM_ITEM_OPERATION,
              idempotencyKey: itemKey,
            },
          },
          create: {
            organizationId,
            operation: REVIEW_CONFIRM_ITEM_OPERATION,
            idempotencyKey: itemKey,
            requestHash,
            requestSnapshot: item as unknown as Prisma.InputJsonValue,
            operatorUserId: userId,
            taskId: current.taskId,
          },
          update: {},
        })
        const itemRecord = await tx.aiCreateIdempotencyRecord.findUniqueOrThrow({
          where: {
            organizationId_operation_idempotencyKey: {
              organizationId,
              operation: REVIEW_CONFIRM_ITEM_OPERATION,
              idempotencyKey: itemKey,
            },
          },
        })
        await tx.aiWorkflowJob.upsert({
          where: { jobKey },
          create: {
            organizationId,
            taskId: current.taskId,
            conversationId: current.conversationId,
            inputBatchId: current.inputBatchId,
            reviewPackageId: current.id,
            idempotencyRecordId: itemRecord.id,
            type: AiWorkflowJobType.review_confirm,
            jobKey,
            status: AiWorkflowJobStatus.pending,
          },
          update: {},
        })
        items.push({
          packageId: current.id,
          itemIdentity: current.itemIdentity,
          status: 'accepted' as const,
        })
      }
      const view: ReviewConfirmationView = {
        decisionCommandId: dto.decisionCommandId,
        accepted: true,
        items,
      }
      await tx.aiCreateIdempotencyRecord.update({
        where: { id: record.id },
        data: {
          resultJson: view as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      })
      return view
    })
    return outcome
  }

  async getReviewConfirmation(
    organizationId: string,
    userId: string,
    decisionCommandId: string,
  ): Promise<ReviewConfirmationView> {
    const record = await this.prisma.aiCreateIdempotencyRecord.findUnique({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId,
          operation: REVIEW_CONFIRM_BATCH_OPERATION,
          idempotencyKey: decisionCommandId,
        },
      },
    })
    if (!record) {
      throw new NotFoundException('确认命令不存在')
    }
    if (record.operatorUserId && record.operatorUserId !== userId) {
      throw new ForbiddenException('仅确认发起人可查询该确认')
    }
    const jobs = await this.prisma.aiWorkflowJob.findMany({
      where: {
        organizationId,
        type: AiWorkflowJobType.review_confirm,
        jobKey: { startsWith: `review_confirm:${decisionCommandId}:` },
      },
      include: { reviewPackage: true },
    })
    const items = await Promise.all(
      jobs.map(async (job) => {
        const itemKey = reviewConfirmItemKey(decisionCommandId, job.reviewPackageId ?? '')
        const itemRecord = await this.prisma.aiCreateIdempotencyRecord.findUnique({
          where: {
            organizationId_operation_idempotencyKey: {
              organizationId,
              operation: REVIEW_CONFIRM_ITEM_OPERATION,
              idempotencyKey: itemKey,
            },
          },
        })
        const saved = itemRecord?.resultJson as
          | {
              status?: string
              reason?: string
              retryable?: boolean
              resultRef?: { objectKind: string; objectId: string }
            }
          | null
        if (saved?.status) {
          return {
            packageId: job.reviewPackageId ?? '',
            itemIdentity: job.reviewPackage?.itemIdentity,
            status: saved.status as ReviewConfirmationView['items'][number]['status'],
            reason: saved.reason,
            retryable: saved.retryable,
            resultRef: saved.resultRef,
          }
        }
        if (job.status === AiWorkflowJobStatus.failed) {
          return {
            packageId: job.reviewPackageId ?? '',
            itemIdentity: job.reviewPackage?.itemIdentity,
            status: 'failed' as const,
            retryable: true,
            reason: job.lastErrorCode ?? undefined,
          }
        }
        if (job.status === AiWorkflowJobStatus.claimed) {
          return {
            packageId: job.reviewPackageId ?? '',
            itemIdentity: job.reviewPackage?.itemIdentity,
            status: 'running' as const,
          }
        }
        return {
          packageId: job.reviewPackageId ?? '',
          itemIdentity: job.reviewPackage?.itemIdentity,
          status: 'queued' as const,
        }
      }),
    )
    return {
      decisionCommandId,
      accepted: true,
      items,
    }
  }

  async listDepartureCollaboration(
    organizationId: string,
    userId: string,
    departureId: string,
    conversationId?: string,
  ): Promise<DepartureCollaborationView> {
    await this.departures.getById(organizationId, departureId)
    const links = await this.prisma.conversationDepartureLink.findMany({
      where: {
        organizationId,
        departureId,
        conversation: { creatorUserId: userId },
        ...(conversationId ? { conversationId } : {}),
      },
      include: { conversation: true },
      orderBy: { linkedAt: 'desc' },
    })
    const conversationIds = links.map((link) => link.conversationId)
    const packages = conversationIds.length
      ? await this.prisma.aiReviewPackage.findMany({
          where: {
            organizationId,
            conversationId: { in: conversationIds },
          },
          orderBy: { createdAt: 'asc' },
        })
      : []
    const pendingRevisions = conversationIds.length
      ? await this.prisma.aiInputBatch.findMany({
          where: { organizationId, conversationId: { in: conversationIds }, status: { in: REVISING_BATCH_STATUSES } },
          select: { userMessageEvent: { select: { payload: true } } },
        })
      : []
    const revisingIds = new Set(pendingRevisions.flatMap((batch) => {
      const payload = batch.userMessageEvent.payload
      return payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.reviewPackageId === 'string'
        ? [payload.reviewPackageId] : []
    }))
    const packageIds = packages.map((pkg) => pkg.id)
    const jobs = packageIds.length
      ? await this.prisma.aiWorkflowJob.findMany({
          where: {
            organizationId,
            type: AiWorkflowJobType.review_confirm,
            reviewPackageId: { in: packageIds },
          },
        })
      : []
    const decisionIds = [
      ...new Set(
        jobs.flatMap((job) => {
          const commandId = job.reviewPackageId
            ? decisionCommandIdFromReviewConfirmJobKey(job.jobKey, job.reviewPackageId)
            : null
          return commandId ? [commandId] : []
        }),
      ),
    ]
    const confirmations = []
    for (const decisionCommandId of decisionIds) {
      try {
        confirmations.push(
          await this.getReviewConfirmation(organizationId, userId, decisionCommandId),
        )
      } catch (error) {
        if (error instanceof ForbiddenException || error instanceof NotFoundException) {
          continue
        }
        throw error
      }
    }
    return {
      departureId,
      conversations: links.map((link) => ({
        id: link.conversation.id,
        title: link.conversation.title,
        lastActivityAt: link.conversation.lastActivityAt.toISOString(),
      })),
      items: packages.map((pkg) => ({
        ...toReviewPackageView(pkg),
        ...(pkg.status === AiReviewPackageStatus.pending && revisingIds.has(pkg.id)
          ? { confirmationBlockedReason: REVISION_PENDING_REASON } : {}),
      })),
      confirmations,
    }
  }

  private async assertNoPendingRevision(
    tx: Prisma.TransactionClient,
    organizationId: string,
    pkg: AiReviewPackage,
  ): Promise<void> {
    const baseline = pkg.baselineSnapshot
    if (baseline && typeof baseline === 'object' && !Array.isArray(baseline)
      && Array.isArray(baseline.reviewConflicts) && baseline.reviewConflicts.length > 0) {
      throw new ConflictException('该事项存在尚未处理的差异，请核对后再确认')
    }
    if (!pkg.conversationId) return
    const pending = await tx.aiInputBatch.findFirst({
      where: {
        organizationId,
        conversationId: pkg.conversationId,
        status: { in: REVISING_BATCH_STATUSES },
        userMessageEvent: { payload: { path: ['reviewPackageId'], equals: pkg.id } },
      },
      select: { id: true },
    })
    if (pending) throw new ConflictException(REVISION_PENDING_REASON)
  }

  async listRevisions(
    organizationId: string,
    userId: string,
    packageId: string,
  ): Promise<ReviewRevisionView[]> {
    await this.tasks.resolveOwnedReviewTaskId(organizationId, userId, packageId)
    const records = await this.prisma.aiReviewRecord.findMany({
      where: { packageId, organizationId, action: AiReviewRecordAction.revise },
      orderBy: { createdAt: 'asc' },
    })
    return records.map((record) => ({
      id: record.id,
      packageId: record.packageId,
      packageVersion: record.packageVersion,
      action: record.action,
      operatorUserId: record.operatorUserId,
      createdAt: record.createdAt.toISOString(),
      beforeSnapshot: record.beforeSnapshot,
      afterSnapshot: record.afterSnapshot,
    }))
  }

  async executeConfirmedItem(jobId: string): Promise<void> {
    const job = await this.prisma.aiWorkflowJob.findUnique({
      where: { id: jobId },
      include: { reviewPackage: true, idempotencyRecord: true },
    })
    if (!job || job.type !== AiWorkflowJobType.review_confirm || !job.reviewPackage) {
      throw new Error('REVIEW_CONFIRM_JOB_MISSING')
    }
    const pkg = job.reviewPackage
    const operatorUserId = job.idempotencyRecord?.operatorUserId
    if (!operatorUserId || !pkg.taskId) {
      throw new Error('REVIEW_CONFIRM_OPERATOR_MISSING')
    }
    const permissionKeys = await this.auth.getPermissionKeysForUser(operatorUserId)
    const required = requiredPermissionKeyForReviewPayloadSchema(pkg.payloadSchema)
    if (!permissionKeys.includes(required)) {
      await this.completeItem(job, pkg, 'conflict', undefined, '无权确认该事项', false)
      return
    }
    if (pkg.status === AiReviewPackageStatus.confirmed) {
      const resultRef = await this.resultRefForConfirmedPackage(job, pkg)
      if (!resultRef) {
        await this.completeItem(job, pkg, 'failed', undefined,
          '审核已确认，但正式记录引用缺失，请核对审核记录，勿重复创建', false)
        return
      }
      await this.completeItem(
        job,
        pkg,
        'succeeded',
        resultRef,
      )
      return
    }
    const snapshot = job.idempotencyRecord?.requestSnapshot as
      | { expectedPackageVersion?: number }
      | null
    const expectedPackageVersion = snapshot?.expectedPackageVersion
    if (expectedPackageVersion == null) {
      await this.completeItem(job, pkg, 'conflict', undefined, '审核包版本已变化，请刷新后重试')
      return
    }
    try {
      if (pkg.targetKind === 'departure_creation_draft') {
        await this.tasks.confirmDepartureReviewPackage(
          job.organizationId,
          operatorUserId,
          pkg.taskId,
          pkg.id,
          {
            expectedVersion: pkg.baseObjectVersion,
            expectedPackageVersion,
          },
          job.idempotencyRecord?.idempotencyKey,
        )
        await this.completeItem(job, pkg, 'succeeded')
        return
      }
      await this.confirmIndependentItem(
        job.organizationId,
        operatorUserId,
        pkg,
        expectedPackageVersion,
        job,
      )
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        await this.completeItem(job, pkg, 'conflict', undefined, error.message)
        return
      }
      throw error
    }
  }

  /**
   * 客源单、行程段资源与发团级资源在同一事务写入正式记录，不自动生成应收或应付。
   */
  private async confirmIndependentItem(
    organizationId: string,
    userId: string,
    pkg: AiReviewPackage,
    expectedPackageVersion: number,
    job: { id: string; idempotencyRecordId: string | null },
  ): Promise<void> {
    if (!pkg.taskId) {
      throw new BadRequestException('审核事项缺少任务')
    }
    if (pkg.payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA) {
      const resolution = resolveSegmentResourceReviewDraft(
        reviewCandidateValues(pkg.candidates),
        reviewCorrectionValues(pkg.userCorrections),
      )
      if (resolution.status !== 'ready') {
        throw new BadRequestException(resolution.reason)
      }
    }
    if (pkg.payloadSchema === DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA) {
      const resolution = resolveDepartureResourceReviewDraft(
        reviewCandidateValues(pkg.candidates),
        reviewCorrectionValues(pkg.userCorrections),
      )
      if (resolution.status !== 'ready') {
        throw new BadRequestException(resolution.reason)
      }
    }
    const { events } = await this.prisma.$transaction(async (tx) => {
      await lockAiCreateTask(tx, organizationId, pkg.taskId!)
      const current = await tx.aiReviewPackage.findFirst({
        where: { id: pkg.id, organizationId },
      })
      if (!current || current.status !== AiReviewPackageStatus.pending) {
        throw new ConflictException('审核事项已处置')
      }
      if (current.version !== expectedPackageVersion) {
        throw new ConflictException('审核包版本已变化，请刷新后重试')
      }
      await this.assertNoPendingRevision(tx, organizationId, current)
      const departure = await tx.departure.findFirst({
        where: { id: current.targetId, organizationId },
        select: { updatedAt: true },
      })
      if (!departure) {
        throw new ConflictException('发团不存在或已变化，请刷新后重试')
      }
      if (
        current.payloadSchema !== SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA &&
        departureObjectVersion(departure.updatedAt) !== current.baseObjectVersion
      ) {
        throw new ConflictException('发团已变化，请刷新后重试')
      }
      const claimed = await tx.aiReviewPackage.updateMany({
        where: {
          id: pkg.id,
          status: AiReviewPackageStatus.pending,
          version: expectedPackageVersion,
        },
        data: {
          status: AiReviewPackageStatus.confirmed,
          version: { increment: 1 },
        },
      })
      if (claimed.count !== 1) {
        throw new ConflictException('审核事项已处置')
      }
      const resultRef = await this.writeIndependentItemInTx(tx, organizationId, current)
      const view = toReviewPackageView(current)
      const { corrections, submissions } = reviewConfirmValues(
        view.candidates.map((candidate) => ({
          fieldKey: candidate.fieldKey,
          proposedValue: candidate.proposedValue,
          userCorrectedValue: candidate.userCorrectedValue,
          clarity: candidate.clarity,
          status: candidate.status,
          evidence: candidate.evidence,
        })),
      )
      await tx.aiReviewRecord.create({
        data: {
          organizationId,
          packageId: pkg.id,
          operatorUserId: userId,
          action: AiReviewRecordAction.confirm,
          packageVersion: expectedPackageVersion,
          originalCandidates: current.candidates as Prisma.InputJsonValue,
          userCorrections: corrections as Prisma.InputJsonValue,
          submittedValues: submissions as Prisma.InputJsonValue,
          evidence: [] as Prisma.InputJsonValue,
          objectVersion: current.baseObjectVersion,
          writeResult: AiReviewWriteResult.success,
          afterSnapshot: resultRef as Prisma.InputJsonValue,
        },
      })
      const events = await this.conversations.finalizeReviewDisposition(tx, {
        organizationId,
        taskId: pkg.taskId!,
        userId,
        reviewPackageId: pkg.id,
        inputBatchId: pkg.inputBatchId,
        disposition: 'confirmed',
      })
      await this.completeItemInTx(tx, job, current, 'succeeded', resultRef)
      return { events }
    })
    for (const event of events) {
      this.conversations.publish(event.conversationId, event)
    }
  }

  private async writeConfirmedSegmentResource(
    tx: Prisma.TransactionClient,
    organizationId: string,
    pkg: AiReviewPackage,
  ): Promise<{ objectKind: string; objectId: string }> {
    const resolution = resolveSegmentResourceReviewDraft(
      reviewCandidateValues(pkg.candidates),
      reviewCorrectionValues(pkg.userCorrections),
    )
    if (resolution.status !== 'ready') {
      throw new BadRequestException(resolution.reason)
    }
    const created = await this.segmentResources.createInTx(
      tx,
      organizationId,
      resolution.draft.itinerarySegmentId,
      {
        resourceKind: resolution.draft.resourceKind,
        supplierId: resolution.draft.supplierId,
        title: resolution.draft.title,
        amountCents: resolution.draft.amountCents,
        notes: resolution.draft.notes ?? undefined,
      },
      { expectedDepartureId: pkg.targetId },
    )
    return { objectKind: 'segment_resource', objectId: created.id }
  }

  private async writeConfirmedDepartureResource(
    tx: Prisma.TransactionClient,
    organizationId: string,
    pkg: AiReviewPackage,
  ): Promise<{ objectKind: string; objectId: string }> {
    const resolution = resolveDepartureResourceReviewDraft(
      reviewCandidateValues(pkg.candidates),
      reviewCorrectionValues(pkg.userCorrections),
    )
    if (resolution.status !== 'ready') {
      throw new BadRequestException(resolution.reason)
    }
    const created = await this.departureResources.createInTx(
      tx,
      organizationId,
      pkg.targetId,
      {
        resourceKind: resolution.draft.resourceKind,
        supplierId: resolution.draft.supplierId,
        title: resolution.draft.title,
        amountCents: resolution.draft.amountCents,
        notes: resolution.draft.notes ?? undefined,
      },
    )
    return { objectKind: 'departure_resource', objectId: created.id }
  }

  private async writeConfirmedSourceOrderReceivables(
    tx: Prisma.TransactionClient,
    organizationId: string,
    pkg: AiReviewPackage,
  ): Promise<{ objectKind: string; objectId: string; scheduleIds: string[]; generation: string }> {
    const sourceOrderId = sourceOrderIdFromBaseline(pkg.baselineSnapshot)
    if (!sourceOrderId) {
      throw new BadRequestException('应收审核缺少正式客源')
    }
    // 先锁客源再 preview：否则 READ COMMITTED 下校验可能仍过，生成却按新约定落账。
    await tx.$queryRaw`
      SELECT id
      FROM source_orders
      WHERE id = ${sourceOrderId}
      FOR UPDATE
    `
    const preview = await this.generation.previewInitialReceivables(organizationId, sourceOrderId, tx)
    const baseline = receivableConventionFromBaseline(pkg.baselineSnapshot)
    if (!baseline || receivableConventionChanged(baseline, preview.order)) {
      throw new ConflictException('正式来源或已有账款已变化，请刷新后重试')
    }
    const liveStatus = historyStatusFromClassification(preview.classification)
    const previewStatus = receivableHistoryStatusFromCandidates(pkg.candidates)
    if (previewStatus && liveStatus !== previewStatus) {
      throw new ConflictException('正式来源或已有账款已变化，请刷新后重试')
    }
    if (preview.classification.status === 'anomaly') {
      throw new ConflictException(preview.classification.message)
    }
    const result = await this.generation.generateReceivableSchedules(
      organizationId,
      sourceOrderId,
      (departure, action) => this.finance.assertAllowsNewObligation(departure, action),
      { client: tx, strategy: 'initial_only' },
    )
    const scheduleIds =
      result.generation === 'already_present'
        ? (result.existingScheduleIds ?? [])
        : result.schedules.map((schedule) => schedule.id)
    return {
      objectKind: 'source_order_receivables',
      objectId: sourceOrderId,
      scheduleIds,
      generation: result.generation,
    }
  }

  async failConfirmedItem(jobId: string, reason: string, retryable = true): Promise<void> {
    const job = await this.prisma.aiWorkflowJob.findUnique({
      where: { id: jobId },
      include: { reviewPackage: true },
    })
    if (!job?.reviewPackage) {
      return
    }
    await this.completeItem(job, job.reviewPackage, 'failed', undefined, reason, retryable)
  }

  private async resultRefForConfirmedPackage(
    job: { idempotencyRecord?: { resultJson?: unknown } | null },
    pkg: AiReviewPackage,
  ): Promise<{ objectKind: string; objectId: string } | null> {
    const expectedKind = pkg.payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA
      ? 'segment_resource'
      : pkg.payloadSchema === DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA
        ? 'departure_resource'
      : pkg.payloadSchema === SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA
        ? 'source_order'
      : pkg.payloadSchema === SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA
        ? 'source_order_receivables'
      : null
    const fromResultJson = parseStoredResultRef(job.idempotencyRecord?.resultJson)
    if (fromResultJson && (!expectedKind || fromResultJson.objectKind === expectedKind)) {
      return fromResultJson
    }
    const record = await this.prisma.aiReviewRecord.findFirst({
      where: { packageId: pkg.id, writeResult: AiReviewWriteResult.success },
      orderBy: { createdAt: 'desc' },
      select: { afterSnapshot: true },
    })
    const fromSnapshot = parseStoredResultRef(record?.afterSnapshot)
    if (fromSnapshot && (!expectedKind || fromSnapshot.objectKind === expectedKind)) {
      return fromSnapshot
    }
    if (expectedKind) return null
    return { objectKind: pkg.targetKind, objectId: pkg.targetId }
  }

  private async writeIndependentItemInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    pkg: AiReviewPackage,
  ): Promise<{ objectKind: string; objectId: string }> {
    if (pkg.payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA) {
      return this.writeConfirmedSegmentResource(tx, organizationId, pkg)
    }
    if (pkg.payloadSchema === DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA) {
      return this.writeConfirmedDepartureResource(tx, organizationId, pkg)
    }
    if (pkg.payloadSchema === SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA) {
      return this.writeConfirmedSourceOrderReceivables(tx, organizationId, pkg)
    }
    if (pkg.payloadSchema !== SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA) {
      return { objectKind: pkg.targetKind, objectId: pkg.targetId }
    }
    const view = toReviewPackageView(pkg)
    const { dto, guests } = sourceOrderWriteFromReviewValues(valuesFromReviewPackage(view))
    const created = await this.sourceOrders.createWithSelectedGuests(
      organizationId,
      pkg.targetId,
      dto,
      guests,
      tx,
    )
    return { objectKind: 'source_order', objectId: created.id }
  }

  private async completeItem(
    job: { id: string; idempotencyRecordId: string | null },
    pkg: AiReviewPackage,
    status: 'succeeded' | 'failed' | 'conflict',
    resultRef?: { objectKind: string; objectId: string },
    reason?: string,
    retryable = status === 'failed',
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.completeItemInTx(tx, job, pkg, status, resultRef, reason, retryable)
    })
  }

  private async completeItemInTx(
    tx: Prisma.TransactionClient,
    job: { id: string; idempotencyRecordId: string | null },
    pkg: AiReviewPackage,
    status: 'succeeded' | 'failed' | 'conflict',
    resultRef?: { objectKind: string; objectId: string },
    reason?: string,
    retryable = status === 'failed',
  ): Promise<void> {
    await tx.aiWorkflowJob.update({
      where: { id: job.id },
      data: {
        status:
          status === 'succeeded' ? AiWorkflowJobStatus.succeeded : AiWorkflowJobStatus.failed,
        lastErrorCode: status === 'succeeded' ? null : reason,
        leaseExpiresAt: null,
        claimedAt: null,
        claimedBy: null,
      },
    })
    if (job.idempotencyRecordId) {
      await tx.aiCreateIdempotencyRecord.update({
        where: { id: job.idempotencyRecordId },
        data: {
          completedAt: new Date(),
          resultJson: {
            status,
            packageId: pkg.id,
            resultRef,
            reason,
            retryable,
          } as Prisma.InputJsonValue,
        },
      })
    }
  }
}

function reviewCandidateValues(
  raw: unknown,
): Array<{ fieldKey: string; proposedValue: string | number }> {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const candidate = item as { fieldKey?: unknown; proposedValue?: unknown }
    if (typeof candidate.fieldKey !== 'string') {
      return []
    }
    if (typeof candidate.proposedValue !== 'string' && typeof candidate.proposedValue !== 'number') {
      return []
    }
    return [{ fieldKey: candidate.fieldKey, proposedValue: candidate.proposedValue }]
  })
}

function reviewCorrectionValues(
  raw: unknown,
): Partial<Record<string, string | number | null>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined
  }
  return raw as Partial<Record<string, string | number | null>>
}

function parseStoredResultRef(raw: unknown): { objectKind: string; objectId: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const record = raw as Record<string, unknown>
  const nested = record.resultRef
  const candidate =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : record
  if (typeof candidate.objectKind !== 'string' || typeof candidate.objectId !== 'string') {
    return null
  }
  if (!candidate.objectKind || !candidate.objectId) {
    return null
  }
  return { objectKind: candidate.objectKind, objectId: candidate.objectId }
}

function sourceOrderIdFromBaseline(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const sourceOrderId = (raw as { sourceOrderId?: unknown }).sourceOrderId
  return typeof sourceOrderId === 'string' && sourceOrderId ? sourceOrderId : null
}

function receivableConventionFromBaseline(raw: unknown): {
  sourceOrderId: string
  collectionMode: string
  depositCents: number
  balanceCents: number
  netReceivableCents: number
  partnerId: string
} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const snapshot = raw as Record<string, unknown>
  if (
    typeof snapshot.sourceOrderId !== 'string' ||
    typeof snapshot.collectionMode !== 'string' ||
    typeof snapshot.depositCents !== 'number' ||
    typeof snapshot.balanceCents !== 'number' ||
    typeof snapshot.netReceivableCents !== 'number' ||
    typeof snapshot.partnerId !== 'string'
  ) {
    return null
  }
  return {
    sourceOrderId: snapshot.sourceOrderId,
    collectionMode: snapshot.collectionMode,
    depositCents: snapshot.depositCents,
    balanceCents: snapshot.balanceCents,
    netReceivableCents: snapshot.netReceivableCents,
    partnerId: snapshot.partnerId,
  }
}

function receivableConventionChanged(
  baseline: NonNullable<ReturnType<typeof receivableConventionFromBaseline>>,
  order: {
    id: string
    collectionMode: string
    depositCents: number
    balanceCents: number
    netReceivableCents: number
    partnerId: string
  },
): boolean {
  return (
    baseline.sourceOrderId !== order.id ||
    baseline.collectionMode !== order.collectionMode ||
    baseline.depositCents !== order.depositCents ||
    baseline.balanceCents !== order.balanceCents ||
    baseline.netReceivableCents !== order.netReceivableCents ||
    baseline.partnerId !== order.partnerId
  )
}

function receivableHistoryStatusFromCandidates(raw: unknown): string | null {
  if (!Array.isArray(raw)) {
    return null
  }
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as { fieldKey?: unknown; proposedValue?: unknown }
    if (candidate.fieldKey === 'historyStatus' && typeof candidate.proposedValue === 'string') {
      return candidate.proposedValue
    }
  }
  return null
}

