import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  isFinanceTouched,
  isSourceOrderGuestCollectionSourceType,
  PaymentScheduleSourceType,
  computeReceivableDueDate,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  PaymentScheduleCloseDisposition,
  PaymentScheduleDirection,
  type PaymentSchedule,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly } from '../departure/departure-date.utils'
import {
  assertGuestNodesReadyForSettlement,
  buildActualCollectionSettlementPaths,
  buildObsoleteSettlementPathCloseData,
} from '../departure/source-order-actual-collection-settlement'
import type { PaymentScheduleService } from './payment-schedule.service'
import { VerificationService } from './verification.service'
import {
  loadReceivableSchedules,
  loadSourceOrderOrThrow,
  type SourceOrderWithRelations,
} from './departure-finance-schedule-loaders'

function paymentScheduleServiceToken() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./payment-schedule.service')
    .PaymentScheduleService as typeof import('./payment-schedule.service').PaymentScheduleService
}

/**
 * Finance-owned actual-collection settlement (ADR-0004).
 * Public seam is DepartureFinanceFacade; this class is the deep implementation.
 */
@Injectable()
export class DepartureFinanceActualCollectionService {
  private readonly logger = new Logger(DepartureFinanceActualCollectionService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(paymentScheduleServiceToken))
    private readonly paymentScheduleService: PaymentScheduleService,
    @Inject(forwardRef(() => VerificationService))
    private readonly verificationService: VerificationService,
  ) {}

  /**
   * 游客代收应收核销变更后：齐账则自动落补款/返利；未齐账则不作提前落账。
   * 核销成功路径调用；失败不回滚核销（吞掉预期「未齐」与已 touch 冲突并打日志）。
   * @returns 本次落账后金额 > 0 的返利应付摘要；未生成或跳过时为 null。
   */
  async syncActualCollectionSettlementAfterGuestVerification(
    organizationId: string,
    paymentScheduleId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<PaymentScheduleSummary | null> {
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id: paymentScheduleId, organizationId },
      select: {
        sourceId: true,
        sourceType: true,
        direction: true,
        cancelledAt: true,
        voidedAt: true,
      },
    })
    if (
      !schedule ||
      schedule.cancelledAt != null ||
      schedule.voidedAt != null ||
      schedule.direction !== PaymentScheduleDirection.receivable ||
      !schedule.sourceId ||
      !isSourceOrderGuestCollectionSourceType(schedule.sourceType)
    ) {
      return null
    }

    try {
      const result = await this.executeActualCollectionSettlement(
        organizationId,
        schedule.sourceId,
        assertAllowsNewObligation,
      )
      if (!result.rebateScheduleId || result.rebateCents <= 0) {
        return null
      }
      return this.paymentScheduleService.getById(
        organizationId,
        PaymentScheduleDirection.payable,
        result.rebateScheduleId,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (
        message.includes('尚未结清') ||
        message.includes('全部客户结算') ||
        message.includes('请先提交游客代收') ||
        message.includes('已有有效核销') ||
        message.includes('已结清') ||
        message.includes('已关闭')
      ) {
        this.logger.debug(
          `skip auto actual-collection settlement for schedule ${paymentScheduleId}: ${message}`,
        )
        return null
      }
      this.logger.warn(
        `auto actual-collection settlement failed for schedule ${paymentScheduleId}: ${message}`,
      )
      return null
    }
  }

  async settleByActualCollection(
    organizationId: string,
    sourceOrderId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<{
    order: SourceOrderWithRelations
    schedules: PaymentScheduleSummary[]
    actualGuestCollectedCents: number
    customerTopUpCents: number
    rebateCents: number
  }> {
    const {
      order,
      scheduleRefs,
      actualGuestCollectedCents,
      customerTopUpCents,
      rebateCents,
    } = await this.executeActualCollectionSettlement(
      organizationId,
      sourceOrderId,
      assertAllowsNewObligation,
    )

    const schedules = await Promise.all(
      scheduleRefs.map((ref) =>
        this.paymentScheduleService.getById(organizationId, ref.direction, ref.id),
      ),
    )

    return {
      order,
      schedules,
      actualGuestCollectedCents,
      customerTopUpCents,
      rebateCents,
    }
  }

  private async executeActualCollectionSettlement(
    organizationId: string,
    sourceOrderId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<{
    order: SourceOrderWithRelations
    scheduleRefs: Array<{ id: string; direction: PaymentScheduleDirection }>
    actualGuestCollectedCents: number
    customerTopUpCents: number
    rebateCents: number
    rebateScheduleId: string | null
  }> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM source_orders
          WHERE id = ${sourceOrderId}
          FOR UPDATE
        `

        const lockedOrder = await loadSourceOrderOrThrow(tx, organizationId, sourceOrderId)
        assertAllowsNewObligation(lockedOrder.departure, '按实收结算')

        if (lockedOrder.collectionMode === 'partner_settled') {
          throw new BadRequestException('全部客户结算无需按实收结算')
        }

        const guestSchedules = (
          await loadReceivableSchedules(tx, organizationId, sourceOrderId)
        ).filter(
          (schedule) =>
            schedule.cancelledAt == null &&
            schedule.voidedAt == null &&
            isSourceOrderGuestCollectionSourceType(schedule.sourceType),
        )

        if (guestSchedules.length === 0) {
          throw new BadRequestException('请先提交游客代收应收，再按实收结算')
        }

        const guestNodes = await Promise.all(
          guestSchedules.map(async (schedule) => ({
            amountCents: schedule.amountCents,
            settledAmountCents: await this.verificationService.getSettledAmountCents(
              schedule.id,
              tx,
            ),
          })),
        )

        try {
          assertGuestNodesReadyForSettlement({ guestNodes })
        } catch (error) {
          const message = error instanceof Error ? error.message : '无法按实收结算'
          throw new BadRequestException(message)
        }

        const actualCollected = guestNodes.reduce(
          (sum, node) => sum + node.settledAmountCents,
          0,
        )

        const existingTopUp = await tx.paymentSchedule.findFirst({
          where: {
            organizationId,
            sourceId: sourceOrderId,
            sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
            direction: PaymentScheduleDirection.receivable,
            cancelledAt: null,
            voidedAt: null,
          },
        })
        const existingRebate = await tx.paymentSchedule.findFirst({
          where: {
            organizationId,
            sourceId: sourceOrderId,
            sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
            direction: PaymentScheduleDirection.payable,
            cancelledAt: null,
            voidedAt: null,
          },
        })

        await this.assertSettlementNodesNotTouched([existingTopUp, existingRebate], tx)

        const expectedPaths = buildActualCollectionSettlementPaths({
          sourceOrderId: lockedOrder.id,
          partnerId: lockedOrder.partnerId,
          partnerName: lockedOrder.partner.name,
          netReceivableCents: lockedOrder.netReceivableCents,
          actualGuestCollectedCents: actualCollected,
        })
        const expectedTopUp = expectedPaths.find(
          (path) =>
            path.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        )
        const expectedRebate = expectedPaths.find(
          (path) => path.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
        )

        const receivableDueDate = computeReceivableDueDate(
          formatDateOnly(lockedOrder.departure.startDate),
        )
        const payableDueDate = formatDateOnly(lockedOrder.departure.endDate)
        const scheduleRefs: Array<{
          id: string
          direction: PaymentScheduleDirection
        }> = []

        const topUpRef = await this.upsertSettlementSchedule({
          organizationId,
          existing: existingTopUp,
          expected: expectedTopUp
            ? {
                direction: PaymentScheduleDirection.receivable,
                sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
                amountCents: expectedTopUp.amountCents,
                title: expectedTopUp.title,
                counterpartyType: CounterpartyType.partner,
                counterpartyId: expectedTopUp.counterpartyId,
                counterpartyName: expectedTopUp.counterpartyName,
                dueDate: receivableDueDate,
              }
            : null,
          departureId: lockedOrder.departureId,
          sourceOrderId,
          tx,
        })
        if (topUpRef) {
          scheduleRefs.push(topUpRef)
        }

        const rebateRef = await this.upsertSettlementSchedule({
          organizationId,
          existing: existingRebate,
          expected: expectedRebate
            ? {
                direction: PaymentScheduleDirection.payable,
                sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
                amountCents: expectedRebate.amountCents,
                title: expectedRebate.title,
                counterpartyType: CounterpartyType.partner,
                counterpartyId: expectedRebate.counterpartyId,
                counterpartyName: expectedRebate.counterpartyName,
                dueDate: payableDueDate,
              }
            : null,
          departureId: lockedOrder.departureId,
          sourceOrderId,
          tx,
        })
        if (rebateRef) {
          scheduleRefs.push(rebateRef)
        }

        return {
          order: lockedOrder,
          scheduleRefs,
          actualGuestCollectedCents: actualCollected,
          customerTopUpCents: expectedTopUp?.amountCents ?? 0,
          rebateCents: expectedRebate?.amountCents ?? 0,
          rebateScheduleId: rebateRef?.id ?? null,
        }
      },
      { maxWait: 20_000, timeout: 20_000 },
    )
  }

  private async assertSettlementNodesNotTouched(
    schedules: Array<PaymentSchedule | null>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const schedule of schedules) {
      if (!schedule) {
        continue
      }
      const [settledAmountCents, hasVerificationHistory] = await Promise.all([
        this.verificationService.getSettledAmountCents(schedule.id, tx),
        this.verificationService.hasVerificationHistory(schedule.id, tx),
      ])
      if (isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)) {
        throw new BadRequestException(
          '客户补款或返利已有有效核销，不能静默重算；请先撤销核销或走明确调整',
        )
      }
    }
  }

  private async upsertSettlementSchedule(params: {
    organizationId: string
    existing: PaymentSchedule | null
    expected: {
      direction: PaymentScheduleDirection
      sourceType: PaymentScheduleSourceType
      amountCents: number
      title: string
      counterpartyType: CounterpartyType
      counterpartyId: string
      counterpartyName: string
      dueDate: string
    } | null
    departureId: string
    sourceOrderId: string
    tx: Prisma.TransactionClient
  }): Promise<{ id: string; direction: PaymentScheduleDirection } | null> {
    const { organizationId, existing, expected, departureId, sourceOrderId, tx } = params

    if (!expected) {
      if (existing) {
        const settledAmountCents = await this.verificationService.getSettledAmountCents(
          existing.id,
          tx,
        )
        const closeData = buildObsoleteSettlementPathCloseData({ settledAmountCents })
        await tx.paymentSchedule.update({
          where: { id: existing.id },
          data: {
            ...closeData,
            closeDisposition: PaymentScheduleCloseDisposition.other,
          },
        })
      }
      return null
    }

    if (existing) {
      if (existing.amountCents !== expected.amountCents || existing.title !== expected.title) {
        // 按实收结算重算：直接改节点，不走普通编辑回写客源约定字段。
        await tx.paymentSchedule.update({
          where: { id: existing.id },
          data: {
            amountCents: expected.amountCents,
            title: expected.title,
            counterpartyType: expected.counterpartyType,
            counterpartyId: expected.counterpartyId,
            counterpartyName: expected.counterpartyName,
          },
        })
      }
      return { id: existing.id, direction: expected.direction }
    }

    const created = await this.paymentScheduleService.create(
      organizationId,
      expected.direction,
      {
        departureId,
        title: expected.title,
        amountCents: expected.amountCents,
        dueDate: expected.dueDate,
        counterpartyType: expected.counterpartyType,
        counterpartyId: expected.counterpartyId,
        counterpartyName: expected.counterpartyName,
        sourceType: expected.sourceType,
        sourceId: sourceOrderId,
      },
      tx,
    )
    return { id: created.id, direction: expected.direction }
  }
}
