import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  AcceptReviewConfirmationDto,
  DepartureCollaborationView,
  ReviewConfirmationView,
  ReviewRevisionView,
} from '@xiaotuanbao/shared'
import {
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
import { lockAiCreateTask, lockAgentConversation } from './ai-create-task.lock'
import { findInFlightReviewConfirmJob } from './review-confirm-in-flight'
import { AiCreateTaskService } from './ai-create-task.service'
import { AiConversationService } from './ai-conversation.service'
import { reviewDecisionRequestHash } from './review-package.envelope'
import { toReviewPackageView } from './review-package.mapper'
import { ensureDepartureCollaborationTaskInTx } from './ensure-departure-collaboration-task'
import {
  REVIEW_CONFIRM_BATCH_OPERATION,
  REVIEW_CONFIRM_ITEM_OPERATION,
  decisionCommandIdFromReviewConfirmJobKey,
  reviewConfirmItemKey,
  reviewConfirmJobKey,
} from './review-collaboration.constants'

@Injectable()
export class ReviewCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: AiCreateTaskService,
    private readonly conversations: AiConversationService,
    private readonly departures: DepartureService,
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
      for (const pkg of packages) {
        if (!pkg.task || pkg.task.organizationId !== organizationId) {
          throw new ForbiddenException('无权确认该事项')
        }
        if (pkg.task.ownerUserId !== userId) {
          throw new ForbiddenException('仅事项所有者可确认')
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
      items: packages.map((pkg) =>
        toReviewPackageView({
          ...pkg,
          baselineSnapshot: pkg.baselineSnapshot,
        }),
      ),
      confirmations,
    }
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
    if (pkg.status === AiReviewPackageStatus.confirmed) {
      await this.completeItem(job, pkg, 'succeeded', {
        objectKind: pkg.targetKind,
        objectId: pkg.targetId,
      })
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
      await tx.aiReviewRecord.create({
        data: {
          organizationId,
          packageId: pkg.id,
          operatorUserId: userId,
          action: AiReviewRecordAction.confirm,
          packageVersion: expectedPackageVersion,
          originalCandidates: pkg.candidates as Prisma.InputJsonValue,
          userCorrections: pkg.userCorrections as Prisma.InputJsonValue,
          submittedValues: pkg.userCorrections as Prisma.InputJsonValue,
          evidence: [] as Prisma.InputJsonValue,
          objectVersion: pkg.baseObjectVersion,
          writeResult: AiReviewWriteResult.success,
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
      await this.completeItemInTx(tx, job, pkg, 'succeeded', {
        objectKind: pkg.targetKind,
        objectId: pkg.targetId,
      })
      return { events }
    })
    for (const event of events) {
      this.conversations.publish(event.conversationId, event)
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

