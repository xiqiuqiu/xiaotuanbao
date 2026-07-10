import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DepartureStatus, type Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'

type TxClient = Prisma.TransactionClient

/**
 * Authoritative Departure write gate owned by Finance (ADR-0004 / #86).
 * Archive-period mutability checks live here so callers share one judgment.
 * Snapshot / generation surface from ADR-0004 migrates onto this facade later.
 */
@Injectable()
export class DepartureFinanceFacade {
  constructor(private readonly prisma: PrismaService) {}

  assertMutable(departure: { status: string }, action = '编辑'): void {
    if (departure.status === DepartureStatus.closed) {
      throw new ConflictException(`发团已关闭，不可${action}`)
    }
  }

  async assertMutableById(
    organizationId: string,
    departureId: string,
    action = '操作',
  ): Promise<void> {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
      select: { status: true },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    this.assertMutable(departure, action)
  }

  async getStatusById(
    organizationId: string,
    departureId: string,
  ): Promise<DepartureStatus> {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
      select: { status: true },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    return departure.status
  }

  /**
   * When reopening a schedule under a settled departure, require explicit confirm
   * and reverse settlement to pending_settlement in the caller's transaction (ADR-0013).
   */
  async reverseSettlementOnScheduleReopen(
    tx: TxClient,
    params: {
      organizationId: string
      departureId: string
      triggerPaymentScheduleId: string
      reason: string
      operatedBy: string
      operatedAt: Date
      confirmDepartureSettlementReversal?: boolean
    },
  ): Promise<DepartureStatus> {
    const departure = await tx.departure.findFirst({
      where: { id: params.departureId, organizationId: params.organizationId },
      select: { id: true, status: true },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    this.assertMutable(departure, '重新打开收付款节点')

    if (departure.status !== DepartureStatus.settled) {
      return departure.status
    }

    if (params.confirmDepartureSettlementReversal !== true) {
      throw new BadRequestException(
        '发团已结清，重新打开节点将使发团回到待结算，请确认联动影响后再操作',
      )
    }

    await tx.departure.update({
      where: { id: departure.id },
      data: { status: DepartureStatus.pending_settlement },
    })

    await tx.departureSettlementHistory.create({
      data: {
        organizationId: params.organizationId,
        departureId: departure.id,
        triggerPaymentScheduleId: params.triggerPaymentScheduleId,
        reason: params.reason,
        previousStatus: DepartureStatus.settled,
        newStatus: DepartureStatus.pending_settlement,
        operatedBy: params.operatedBy,
        operatedAt: params.operatedAt,
      },
    })

    return DepartureStatus.pending_settlement
  }

  /**
   * Sync segment-resource agreed amount with an explicit payable adjustment
   * inside the caller's transaction (ADR-0010 / ADR-0004).
   */
  async syncSegmentResourceAmountOnPayableAdjust(
    tx: TxClient,
    params: { resourceId: string; amountCents: number },
  ): Promise<void> {
    const resource = await tx.segmentResource.findFirst({
      where: { id: params.resourceId },
      select: { id: true },
    })
    if (!resource) {
      throw new BadRequestException('关联资源不存在，无法调整约定金额')
    }

    await tx.segmentResource.update({
      where: { id: resource.id },
      data: { amountCents: params.amountCents },
    })
  }
}
