import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common'
import type {
  GenerateReceivablesResult,
  PaymentScheduleSummary,
  SettleByActualCollectionResult,
  SourceOrderSummary,
} from '@xiaotuanbao/shared'
import {
  isFinanceTouched,
  isSourceOrderGuestCollectionSourceType,
  PaymentScheduleSourceType,
  SegmentPayableStatus,
  SourceOrderReceivableStatus,
  deriveScheduleState,
  deriveSourceOrderReceivableStatus,
  computeReceivableDueDate,
  PaymentScheduleStatus,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  PaymentScheduleCloseDisposition,
  PaymentScheduleDirection,
  type Partner,
  type PaymentSchedule,
  type Prisma,
  type DepartureResource,
  type SegmentResource,
  type SourceOrder,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  DepartureFinanceFacade,
  type SegmentResourceFinanceState,
} from '../finance/departure-finance-facade.service'
import {
  loadReceivableSchedules as loadReceivableSchedulesShared,
  loadRebateSchedules as loadRebateSchedulesShared,
  loadSourceOrderOrThrow as loadSourceOrderOrThrowShared,
  type SourceOrderFinanceMeta,
  type SourceOrderWithRelations,
} from '../finance/departure-finance-schedule-loaders'
import { PaymentScheduleService } from '../finance/payment-schedule.service'
import { VerificationService } from '../finance/verification.service'
import { formatDateOnly, getShanghaiTodayString } from './departure-date.utils'
import {
  assertGuestNodesReadyForSettlement,
  buildActualCollectionSettlementPaths,
  buildObsoleteSettlementPathCloseData,
} from './source-order-actual-collection-settlement'
import { buildSourceOrderReceivablePaths } from './source-order-receivable-paths'
import {
  resolveSourceOrderAmountChange,
  type SourceOrderAmountInput,
  type SourceOrderStoredAmounts,
} from './source-order.utils'

/** @deprecated Prefer SegmentResourceFinanceState from DepartureFinanceFacade (#49). */
export type SegmentResourceFinanceMeta = SegmentResourceFinanceState

export type { SourceOrderFinanceMeta, SourceOrderWithRelations }

type SegmentResourceWithRelations = SegmentResource & {
  partner: Partner | null
  supplier: Supplier | null
  segment: {
    id: string
    endDate: Date | null
    departure: { id: string; organizationId: string; status: string; endDate: Date }
  }
}

type DepartureResourceWithRelations = DepartureResource & {
  partner: Partner | null
  supplier: Supplier | null
  departure: { id: string; organizationId: string; status: string; endDate: Date }
}

type DbClient = PrismaService | Prisma.TransactionClient

@Injectable()
export class DepartureFinanceBridgeService {
  private readonly logger = new Logger(DepartureFinanceBridgeService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentScheduleService: PaymentScheduleService,
    @Inject(forwardRef(() => VerificationService))
    private readonly verificationService: VerificationService,
    @Inject(forwardRef(() => DepartureFinanceFacade))
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  /** @deprecated Prefer DepartureFinanceFacade.generateReceivables (ADR-0004). */
  async generateReceivables(
    organizationId: string,
    sourceOrderId: string,
    toSourceOrderSummary: (
      order: SourceOrder & {
        partner: Partner
        fareAdjustments?: SourceOrderWithRelations['fareAdjustments']
      },
      meta: SourceOrderFinanceMeta,
    ) => SourceOrderSummary,
  ): Promise<GenerateReceivablesResult> {
    return this.departureFinanceFacade.generateReceivables(
      organizationId,
      sourceOrderId,
      toSourceOrderSummary,
    )
  }

  /**
   * 游客代收应收核销变更后：齐账则自动落补款/返利；未齐账则不作提前落账。
   * 核销成功路径调用；失败不回滚核销（吞掉预期「未齐」与已 touch 冲突并打日志）。
   * @returns 本次落账后金额 > 0 的返利应付摘要；未生成或跳过时为 null。
   */
  async syncActualCollectionSettlementAfterGuestVerification(
    organizationId: string,
    paymentScheduleId: string,
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
        message.includes('请先生成游客代收') ||
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
    toSourceOrderSummary: (
      order: SourceOrder & {
        partner: Partner
        fareAdjustments?: SourceOrderWithRelations['fareAdjustments']
      },
      meta: SourceOrderFinanceMeta,
    ) => SourceOrderSummary,
  ): Promise<SettleByActualCollectionResult> {
    const {
      order,
      scheduleRefs,
      actualGuestCollectedCents,
      customerTopUpCents,
      rebateCents,
    } = await this.executeActualCollectionSettlement(organizationId, sourceOrderId)

    const schedules = await Promise.all(
      scheduleRefs.map((ref) =>
        this.paymentScheduleService.getById(organizationId, ref.direction, ref.id),
      ),
    )
    const financeMeta = await this.evaluateFinanceMeta(organizationId, sourceOrderId, order)

    return {
      schedules,
      sourceOrder: toSourceOrderSummary(order, financeMeta),
      actualGuestCollectedCents,
      customerTopUpCents,
      rebateCents,
    }
  }

  private async executeActualCollectionSettlement(
    organizationId: string,
    sourceOrderId: string,
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

        const lockedOrder = await this.loadSourceOrderOrThrow(
          organizationId,
          sourceOrderId,
          tx,
        )
        this.ensureDepartureAllowsNewObligation(lockedOrder.departure, '按实收结算')

        if (lockedOrder.collectionMode === 'partner_settled') {
          throw new BadRequestException('全部客户结算无需按实收结算')
        }

        const guestSchedules = (
          await this.loadReceivableSchedules(organizationId, sourceOrderId, tx)
        ).filter(
          (schedule) =>
            schedule.cancelledAt == null &&
            schedule.voidedAt == null &&
            isSourceOrderGuestCollectionSourceType(schedule.sourceType),
        )

        if (guestSchedules.length === 0) {
          throw new BadRequestException('请先生成游客代收应收，再按实收结算')
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

  /** @deprecated Prefer DepartureFinanceFacade.syncSourceOrderSchedules (ADR-0004). */
  async syncSourceOrderSchedules(
    organizationId: string,
    order: SourceOrderWithRelations,
  ): Promise<SourceOrderFinanceMeta> {
    return this.departureFinanceFacade.syncSourceOrderSchedules(organizationId, order)
  }

  async evaluateFinanceMeta(
    organizationId: string,
    sourceOrderId: string,
    order?: Pick<
      SourceOrder,
      | 'collectionMode'
      | 'depositCents'
      | 'balanceCents'
      | 'netReceivableCents'
      | 'partnerCollectedCents'
      | 'guestCollectCents'
    >,
  ): Promise<SourceOrderFinanceMeta> {
    const amounts =
      order ??
      (await this.prisma.sourceOrder.findFirstOrThrow({
        where: { id: sourceOrderId },
        select: {
          collectionMode: true,
          depositCents: true,
          balanceCents: true,
          netReceivableCents: true,
          partnerCollectedCents: true,
          guestCollectCents: true,
        },
      }))

    const schedules = await this.loadReceivableSchedules(organizationId, sourceOrderId)
    const rebateSchedules = await this.loadRebateSchedules(organizationId, sourceOrderId)
    if (schedules.length === 0 && rebateSchedules.length === 0) {
      return {
        hasSchedule: false,
        receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: false,
        hasIncompleteReceivablePaths: false,
        rebateCents: 0,
        rebateStatus: SegmentPayableStatus.NOT_GENERATED,
        rebateScheduleNo: null,
      }
    }

    const activeSchedules = schedules.filter((schedule) => schedule.cancelledAt == null)
    const activeRebates = rebateSchedules.filter((schedule) => schedule.cancelledAt == null)
    if (activeSchedules.length === 0 && activeRebates.length === 0) {
      return {
        hasSchedule: true,
        receivableStatus: SourceOrderReceivableStatus.CLOSED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: true,
        hasIncompleteReceivablePaths: false,
        rebateCents: 0,
        rebateStatus:
          rebateSchedules.length > 0
            ? SegmentPayableStatus.CLOSED
            : SegmentPayableStatus.NOT_GENERATED,
        rebateScheduleNo: null,
      }
    }

    const touchCandidates = [...activeSchedules, ...activeRebates]
    const settledMap = await this.verificationService.batchGetSettledAmounts(
      touchCandidates.map((schedule) => schedule.id),
    )
    const historyMap = await this.verificationService.batchHasVerificationHistory(
      touchCandidates.map((schedule) => schedule.id),
    )

    let hasSourceAmountMismatch = false
    let amountFieldsLocked = false
    for (const schedule of activeRebates) {
      const settledAmountCents = settledMap.get(schedule.id) ?? 0
      if (
        isFinanceTouched(schedule, settledAmountCents, historyMap.get(schedule.id) ?? false)
      ) {
        amountFieldsLocked = true
      }
    }

    const scheduleStates = activeSchedules.map((schedule) => {
      const settledAmountCents = settledMap.get(schedule.id) ?? 0
      const touched = isFinanceTouched(
        schedule,
        settledAmountCents,
        historyMap.get(schedule.id) ?? false,
      )
      if (touched) {
        amountFieldsLocked = true
        const expectedAmount = this.getExpectedAmountForSchedule(schedule.sourceType, amounts)
        if (expectedAmount > 0 && schedule.amountCents !== expectedAmount) {
          hasSourceAmountMismatch = true
        }
      }

      return {
        amountCents: schedule.amountCents,
        settledAmountCents,
        status: deriveScheduleState({
          amountCents: schedule.amountCents,
          settledAmountCents,
          dueDate: formatDateOnly(schedule.dueDate),
          cancelledAt: schedule.cancelledAt,
          businessDate: getShanghaiTodayString(),
          direction: schedule.direction,
        }),
      }
    })

    let receivableStatus = SourceOrderReceivableStatus.PENDING
    if (scheduleStates.length === 0) {
      // 仅剩返利应付、无应收时仍视为已生成财务痕迹。
      receivableStatus = SourceOrderReceivableStatus.PENDING
    } else {
      receivableStatus = deriveSourceOrderReceivableStatus(scheduleStates)
      if (receivableStatus === SourceOrderReceivableStatus.COLLECTED) {
        amountFieldsLocked = true
      }
    }

    const { rebateCents, rebateStatus, rebateScheduleNo } = deriveSourceOrderRebateMeta(
      activeRebates,
      rebateSchedules.length > 0,
      settledMap,
    )

    const expectedPaths = buildSourceOrderReceivablePaths({
      sourceOrderId,
      partnerId: 'partner',
      partnerName: '',
      displayName: '',
      collectionMode: amounts.collectionMode,
      depositCents: amounts.depositCents,
      balanceCents: amounts.balanceCents,
      netReceivableCents: amounts.netReceivableCents,
    }).filter((path) => path.amountCents > 0)
    const activeSourceTypes = new Set(activeSchedules.map((schedule) => schedule.sourceType))
    const hasIncompleteReceivablePaths = expectedPaths.some(
      (path) => !activeSourceTypes.has(path.sourceType),
    )

    return {
      hasSchedule: true,
      receivableStatus,
      hasSourceAmountMismatch,
      amountFieldsLocked,
      hasIncompleteReceivablePaths,
      rebateCents,
      rebateStatus,
      rebateScheduleNo,
    }
  }

  async assertAmountFieldsEditable(
    organizationId: string,
    sourceOrderId: string,
    order: SourceOrderStoredAmounts,
    nextAmounts: SourceOrderAmountInput,
  ): Promise<void> {
    const { amountOutcomeChanged } = resolveSourceOrderAmountChange(order, nextAmounts)
    if (!amountOutcomeChanged) {
      return
    }

    const meta = await this.evaluateFinanceMeta(organizationId, sourceOrderId)
    if (meta.amountFieldsLocked) {
      throw new BadRequestException('当前客源单已发生收款，不允许修改金额')
    }
  }

  /** @deprecated Prefer DepartureFinanceFacade.generateResourcePayable (ADR-0004). */
  async generateResourcePayable(
    organizationId: string,
    params: { sourceType: string; sourceId: string },
  ): Promise<{
    schedule: PaymentScheduleSummary
    sourceAmountMismatch: boolean
  }> {
    return this.departureFinanceFacade.generateResourcePayable(organizationId, params)
  }

  /** @deprecated Prefer DepartureFinanceFacade.syncSegmentResourceSchedule (ADR-0004). */
  async syncSegmentResourceSchedule(
    organizationId: string,
    resource: SegmentResourceWithRelations,
  ): Promise<SegmentResourceFinanceMeta> {
    return this.departureFinanceFacade.syncSegmentResourceSchedule(organizationId, resource)
  }

  /** @deprecated Prefer DepartureFinanceFacade.syncDepartureResourceSchedule (ADR-0004). */
  async syncDepartureResourceSchedule(
    organizationId: string,
    resource: DepartureResourceWithRelations,
  ): Promise<SegmentResourceFinanceMeta> {
    return this.departureFinanceFacade.syncDepartureResourceSchedule(organizationId, resource)
  }

  async evaluateResourceFinanceMeta(
    organizationId: string,
    resourceId: string,
    resource?: Pick<SegmentResource, 'amountCents' | 'resourceKind' | 'partnerId' | 'supplierId'>,
  ): Promise<SegmentResourceFinanceMeta> {
    return this.departureFinanceFacade.getSegmentResourceFinanceState(
      organizationId,
      resourceId,
      resource,
    )
  }

  async evaluateDepartureResourceFinanceMeta(
    organizationId: string,
    resourceId: string,
    resource?: Pick<DepartureResource, 'amountCents'>,
  ): Promise<SegmentResourceFinanceMeta> {
    return this.departureFinanceFacade.getDepartureResourceFinanceState(
      organizationId,
      resourceId,
      resource,
    )
  }

  async assertResourceAmountEditable(
    organizationId: string,
    resourceId: string,
    currentAmountCents: number,
    nextAmountCents: number,
  ): Promise<void> {
    if (currentAmountCents === nextAmountCents) {
      return
    }

    const meta = await this.evaluateResourceFinanceMeta(organizationId, resourceId)
    if (meta.amountFieldsLocked) {
      throw new BadRequestException('当前资源已发生付款，不允许修改金额')
    }
  }

  async assertDepartureResourceAmountEditable(
    organizationId: string,
    resourceId: string,
    currentAmountCents: number,
    nextAmountCents: number,
  ): Promise<void> {
    if (currentAmountCents === nextAmountCents) {
      return
    }

    const meta = await this.evaluateDepartureResourceFinanceMeta(organizationId, resourceId)
    if (meta.amountFieldsLocked) {
      throw new BadRequestException('当前资源已发生付款，不允许修改金额')
    }
  }

  private getExpectedAmountForSchedule(
    sourceType: string,
    order: Pick<
      SourceOrder,
      | 'collectionMode'
      | 'depositCents'
      | 'balanceCents'
      | 'netReceivableCents'
      | 'partnerCollectedCents'
      | 'guestCollectCents'
    > &
      Partial<Pick<SourceOrderWithRelations, 'partner' | 'displayName' | 'id' | 'partnerId'>>,
  ): number {
    // evaluateFinanceMeta 可能只带金额字段；用路径构建需要的最小元数据兜底。
    const paths = buildSourceOrderReceivablePaths({
      sourceOrderId: order.id ?? 'source-order',
      partnerId: order.partnerId ?? 'partner',
      partnerName: order.partner?.name ?? '',
      displayName: order.displayName ?? '',
      collectionMode: order.collectionMode,
      depositCents: order.depositCents,
      balanceCents: order.balanceCents,
      netReceivableCents: order.netReceivableCents,
    })
    return paths.find((path) => path.sourceType === sourceType)?.amountCents ?? 0
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

  private async loadReceivableSchedules(
    organizationId: string,
    sourceOrderId: string,
    client: DbClient = this.prisma,
  ): Promise<PaymentSchedule[]> {
    return loadReceivableSchedulesShared(client, organizationId, sourceOrderId)
  }

  private async loadRebateSchedules(
    organizationId: string,
    sourceOrderId: string,
    client: DbClient = this.prisma,
  ): Promise<PaymentSchedule[]> {
    return loadRebateSchedulesShared(client, organizationId, sourceOrderId)
  }

  private async loadSourceOrderOrThrow(
    organizationId: string,
    sourceOrderId: string,
    client: DbClient = this.prisma,
  ): Promise<SourceOrderWithRelations> {
    return loadSourceOrderOrThrowShared(client, organizationId, sourceOrderId)
  }

  private ensureDepartureAllowsNewObligation(
    departure: { status: string },
    action = '提交应收',
  ) {
    this.departureFinanceFacade.assertAllowsNewObligation(departure, action)
  }
}

function deriveSourceOrderRebateMeta(
  activeRebates: PaymentSchedule[],
  hadRebateSchedule: boolean,
  settledMap: Map<string, number>,
): {
  rebateCents: number
  rebateStatus: SegmentPayableStatus
  rebateScheduleNo: string | null
} {
  if (activeRebates.length === 0) {
    return {
      rebateCents: 0,
      rebateStatus: hadRebateSchedule
        ? SegmentPayableStatus.CLOSED
        : SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: null,
    }
  }

  let rebateCents = 0
  let anyPartial = false
  let allPaid = true

  for (const schedule of activeRebates) {
    rebateCents += schedule.amountCents
    const settledAmountCents = settledMap.get(schedule.id) ?? 0
    const status = deriveScheduleState({
      amountCents: schedule.amountCents,
      settledAmountCents,
      dueDate: formatDateOnly(schedule.dueDate),
      cancelledAt: schedule.cancelledAt,
      businessDate: getShanghaiTodayString(),
      direction: schedule.direction,
    })

    if (status !== PaymentScheduleStatus.SETTLED) {
      allPaid = false
    }
    if (settledAmountCents > 0 && settledAmountCents < schedule.amountCents) {
      anyPartial = true
    }
  }

  const rebateScheduleNo = activeRebates[0]?.scheduleNo ?? null

  if (allPaid) {
    return { rebateCents, rebateStatus: SegmentPayableStatus.PAID, rebateScheduleNo }
  }
  if (anyPartial) {
    return { rebateCents, rebateStatus: SegmentPayableStatus.PARTIAL, rebateScheduleNo }
  }
  return { rebateCents, rebateStatus: SegmentPayableStatus.PENDING, rebateScheduleNo }
}
