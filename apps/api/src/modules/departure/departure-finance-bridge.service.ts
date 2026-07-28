import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
  shouldCancelSourceOrderScheduleOnConventionSync,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  PaymentScheduleCloseDisposition,
  PaymentScheduleDirection,
  type FareAdjustmentDirection,
  type FareAdjustmentKind,
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

type SourceOrderWithRelations = SourceOrder & {
  partner: Partner
  departure: {
    id: string
    organizationId: string
    status: string
    startDate: Date
    endDate: Date
  }
  fareAdjustments?: Array<{
    id: string
    kind: FareAdjustmentKind
    direction: FareAdjustmentDirection
    amountCents: number
    customName: string | null
    sortOrder: number
  }>
}

export interface SourceOrderFinanceMeta {
  hasSchedule: boolean
  receivableStatus: SourceOrderReceivableStatus
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
  /** 约定应收路径尚有缺失（如旧规则只建了尾款、未建客户补款） */
  hasIncompleteReceivablePaths: boolean
  rebateCents: number
  rebateStatus: SegmentPayableStatus
  /** 当前有效返利应付 scheduleNo；无有效返利时为 null */
  rebateScheduleNo: string | null
}

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

interface PayableSpec {
  amountCents: number
  title: string
  counterpartyType: CounterpartyType
  counterpartyId?: string
  counterpartyName?: string
}

@Injectable()
export class DepartureFinanceBridgeService {
  private readonly logger = new Logger(DepartureFinanceBridgeService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentScheduleService: PaymentScheduleService,
    @Inject(forwardRef(() => VerificationService))
    private readonly verificationService: VerificationService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

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
    // Concurrent generate callers wait on FOR UPDATE; default 2s/5s is too tight under CI load.
    const { order, schedules } = await this.prisma.$transaction(
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
        this.ensureDepartureAllowsNewObligation(lockedOrder.departure)

        const existingSchedules = await this.loadReceivableSchedules(
          organizationId,
          sourceOrderId,
          tx,
        )
        const activeExisting = existingSchedules.filter((schedule) => schedule.cancelledAt == null)
        const dueDate = computeReceivableDueDate(formatDateOnly(lockedOrder.departure.startDate))
        const expectedPaths = this.buildReceivablePaths(lockedOrder).filter(
          (path) => path.amountCents > 0,
        )
        const activeByType = new Map(
          activeExisting.map((schedule) => [schedule.sourceType, schedule]),
        )
        const missingPaths = expectedPaths.filter((path) => !activeByType.has(path.sourceType))

        // 有效路径齐全 → 拒绝；有效路径为空但曾有过应收（含已关闭）→ 拒绝；仅缺路径 → 补建。
        if (activeExisting.length > 0 && missingPaths.length === 0) {
          throw new ConflictException('当前客源单已生成应收，不能再次生成')
        }
        if (activeExisting.length === 0 && existingSchedules.length > 0) {
          throw new ConflictException('当前客源单已生成应收，不能再次生成')
        }

        const createdSchedules: PaymentScheduleSummary[] = []
        const pathsToCreate =
          activeExisting.length === 0 ? expectedPaths : missingPaths

        for (const path of pathsToCreate) {
          const created = await this.paymentScheduleService.create(
            organizationId,
            PaymentScheduleDirection.receivable,
            {
              departureId: lockedOrder.departureId,
              title: path.title,
              amountCents: path.amountCents,
              dueDate,
              counterpartyType: path.counterpartyType,
              counterpartyId: path.counterpartyId,
              counterpartyName: path.counterpartyName,
              sourceType: path.sourceType,
              sourceId: sourceOrderId,
            },
            tx,
          )
          createdSchedules.push(created)
        }

        return { order: lockedOrder, schedules: createdSchedules }
      },
      { maxWait: 20_000, timeout: 20_000 },
    )

    const financeMeta = await this.evaluateFinanceMeta(organizationId, sourceOrderId, order)

    return {
      schedules,
      sourceOrder: toSourceOrderSummary(order, financeMeta),
      sourceAmountMismatch: financeMeta.hasSourceAmountMismatch,
    }
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

  async syncSourceOrderSchedules(
    organizationId: string,
    order: SourceOrderWithRelations,
  ): Promise<SourceOrderFinanceMeta> {
    const allSchedules = await this.loadReceivableSchedules(organizationId, order.id)
    const rebateSchedules = await this.loadRebateSchedules(organizationId, order.id)
    if (allSchedules.length === 0 && rebateSchedules.length === 0) {
      return this.evaluateFinanceMeta(organizationId, order.id, order)
    }

    const activeSchedules = allSchedules.filter((schedule) => schedule.cancelledAt == null)
    const activeRebates = rebateSchedules.filter((schedule) => schedule.cancelledAt == null)
    const schedulesForTouch = [...activeSchedules, ...activeRebates]

    const touchResults = await Promise.all(
      schedulesForTouch.map(async (schedule) => {
        const [settledAmountCents, hasVerificationHistory] = await Promise.all([
          this.verificationService.getSettledAmountCents(schedule.id),
          this.verificationService.hasVerificationHistory(schedule.id),
        ])
        return {
          schedule,
          touched: isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory),
        }
      }),
    )
    const anyTouched = touchResults.some((item) => item.touched)
    const hasLegacyGuestCollection = touchResults.some(
      (item) =>
        item.schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    )

    if (anyTouched || hasLegacyGuestCollection) {
      // 任一节点已 finance-touch，或仍存在 pre-split legacy 游客代收：
      // 锁定约定同步（不改金额、不增删路径，避免误取消 legacy）。
      // 按实收结算产生的补款/返利若尚未 touch，约定变更时关闭，待再次按实收结算。
      return this.evaluateFinanceMeta(organizationId, order.id, order)
    }

    // 未核销：按约定全量同步——改金额、关闭多余/零金额、补建缺失。
    const expectedPaths = this.buildReceivablePaths(order)
    const expectedByType = new Map(expectedPaths.map((path) => [path.sourceType, path]))
    const dueDate = computeReceivableDueDate(formatDateOnly(order.departure.startDate))
    const remainingActiveSourceTypes = new Set<string>()

    for (const { schedule } of touchResults) {
      if (schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_REBATE) {
        await this.cancelScheduleForConventionSync(schedule.id)
        continue
      }

      const expected = expectedByType.get(schedule.sourceType as PaymentScheduleSourceType)
      if (
        shouldCancelSourceOrderScheduleOnConventionSync({
          scheduleSourceType: schedule.sourceType,
          expectedAmountCents: expected?.amountCents,
        })
      ) {
        await this.cancelScheduleForConventionSync(schedule.id)
        continue
      }
      if (!expected || expected.amountCents <= 0) {
        // 非约定管理类型（如 legacy）：保留，不参与补建去重。
        continue
      }

      remainingActiveSourceTypes.add(schedule.sourceType)
      if (schedule.amountCents === expected.amountCents && schedule.title === expected.title) {
        continue
      }
      await this.paymentScheduleService.update(
        organizationId,
        PaymentScheduleDirection.receivable,
        schedule.id,
        { amountCents: expected.amountCents, title: expected.title },
      )
    }

    for (const path of expectedPaths) {
      if (path.amountCents <= 0 || remainingActiveSourceTypes.has(path.sourceType)) {
        continue
      }
      await this.paymentScheduleService.create(
        organizationId,
        PaymentScheduleDirection.receivable,
        {
          departureId: order.departureId,
          title: path.title,
          amountCents: path.amountCents,
          dueDate,
          counterpartyType: path.counterpartyType,
          counterpartyId: path.counterpartyId,
          counterpartyName: path.counterpartyName,
          sourceType: path.sourceType,
          sourceId: order.id,
        },
      )
      remainingActiveSourceTypes.add(path.sourceType)
    }

    return this.evaluateFinanceMeta(organizationId, order.id, order)
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

  /**
   * Generate a resource payable by anchor sourceType (segment ∪ departure).
   */
  async generateResourcePayable(
    organizationId: string,
    params: { sourceType: string; sourceId: string },
  ): Promise<{
    schedule: PaymentScheduleSummary
    sourceAmountMismatch: boolean
  }> {
    if (params.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE) {
      return this.generatePayable(organizationId, params.sourceId)
    }
    if (params.sourceType === PaymentScheduleSourceType.DEPARTURE_RESOURCE) {
      return this.generateDepartureResourcePayable(organizationId, params.sourceId)
    }
    throw new BadRequestException('仅资源可生成应付')
  }

  async generatePayable(
    organizationId: string,
    resourceId: string,
  ): Promise<{
    schedule: PaymentScheduleSummary
    sourceAmountMismatch: boolean
  }> {
    const { resource, schedule } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM segment_resources
          WHERE id = ${resourceId}
          FOR UPDATE
        `

        const lockedResource = await this.loadSegmentResourceOrThrow(
          organizationId,
          resourceId,
          tx,
        )
        this.ensureDepartureAllowsNewObligation(lockedResource.segment.departure, '生成应付')

        if (lockedResource.amountCents <= 0) {
          throw new BadRequestException('资源金额须大于 0 才能生成应付')
        }

        const existingTrace = await this.findAnyPayableSchedule(
          organizationId,
          resourceId,
          PaymentScheduleSourceType.SEGMENT_RESOURCE,
          tx,
        )
        if (existingTrace) {
          throw new ConflictException('当前资源已生成应付，不能再次生成')
        }

        const spec = this.buildPayableSpec(lockedResource)
        const dueDate = formatDateOnly(lockedResource.segment.departure.endDate)
        const createdSchedule = await this.paymentScheduleService.create(
          organizationId,
          PaymentScheduleDirection.payable,
          {
            departureId: lockedResource.segment.departure.id,
            title: spec.title,
            amountCents: spec.amountCents,
            dueDate,
            counterpartyType: spec.counterpartyType,
            counterpartyId: spec.counterpartyId,
            counterpartyName: spec.counterpartyName,
            sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
            sourceId: resourceId,
          },
          tx,
        )

        return { resource: lockedResource, schedule: createdSchedule }
      },
      { maxWait: 20_000, timeout: 20_000 },
    )

    const financeMeta = await this.evaluateResourceFinanceMeta(
      organizationId,
      resourceId,
      resource,
    )

    return {
      schedule,
      sourceAmountMismatch: financeMeta.hasSourceAmountMismatch,
    }
  }

  async syncSegmentResourceSchedule(
    organizationId: string,
    resource: SegmentResourceWithRelations,
  ): Promise<SegmentResourceFinanceMeta> {
    const schedule = await this.findActivePayableSchedule(
      organizationId,
      resource.id,
      PaymentScheduleSourceType.SEGMENT_RESOURCE,
    )
    if (!schedule) {
      return this.evaluateResourceFinanceMeta(organizationId, resource.id, resource)
    }

    const spec = this.buildPayableSpec(resource)
    await this.syncUntouchedPayableSchedule(organizationId, schedule, spec)

    return this.evaluateResourceFinanceMeta(organizationId, resource.id, resource)
  }

  async generateDepartureResourcePayable(
    organizationId: string,
    resourceId: string,
  ): Promise<{
    schedule: PaymentScheduleSummary
    sourceAmountMismatch: boolean
  }> {
    const { resource, schedule } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM departure_resources
          WHERE id = ${resourceId}
          FOR UPDATE
        `

        const lockedResource = await this.loadDepartureResourceOrThrow(
          organizationId,
          resourceId,
          tx,
        )
        this.ensureDepartureAllowsNewObligation(lockedResource.departure, '生成应付')

        if (lockedResource.amountCents <= 0) {
          throw new BadRequestException('资源金额须大于 0 才能生成应付')
        }

        const existingTrace = await this.findAnyPayableSchedule(
          organizationId,
          resourceId,
          PaymentScheduleSourceType.DEPARTURE_RESOURCE,
          tx,
        )
        if (existingTrace) {
          throw new ConflictException('当前资源已生成应付，不能再次生成')
        }

        const spec = this.buildPayableSpec(lockedResource)
        const dueDate = formatDateOnly(lockedResource.departure.endDate)
        const createdSchedule = await this.paymentScheduleService.create(
          organizationId,
          PaymentScheduleDirection.payable,
          {
            departureId: lockedResource.departure.id,
            title: spec.title,
            amountCents: spec.amountCents,
            dueDate,
            counterpartyType: spec.counterpartyType,
            counterpartyId: spec.counterpartyId,
            counterpartyName: spec.counterpartyName,
            sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
            sourceId: resourceId,
          },
          tx,
        )

        return { resource: lockedResource, schedule: createdSchedule }
      },
      { maxWait: 20_000, timeout: 20_000 },
    )

    const financeMeta = await this.evaluateDepartureResourceFinanceMeta(
      organizationId,
      resourceId,
      resource,
    )

    return {
      schedule,
      sourceAmountMismatch: financeMeta.hasSourceAmountMismatch,
    }
  }

  async syncDepartureResourceSchedule(
    organizationId: string,
    resource: DepartureResourceWithRelations,
  ): Promise<SegmentResourceFinanceMeta> {
    const schedule = await this.findActivePayableSchedule(
      organizationId,
      resource.id,
      PaymentScheduleSourceType.DEPARTURE_RESOURCE,
    )
    if (!schedule) {
      return this.evaluateDepartureResourceFinanceMeta(organizationId, resource.id, resource)
    }

    const spec = this.buildPayableSpec(resource)
    await this.syncUntouchedPayableSchedule(organizationId, schedule, spec)

    return this.evaluateDepartureResourceFinanceMeta(organizationId, resource.id, resource)
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

  private async syncUntouchedPayableSchedule(
    organizationId: string,
    schedule: PaymentSchedule,
    spec: PayableSpec,
  ): Promise<void> {
    const [settledAmountCents, hasVerificationHistory] = await Promise.all([
      this.verificationService.getSettledAmountCents(schedule.id),
      this.verificationService.hasVerificationHistory(schedule.id),
    ])
    const touched = isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)
    if (touched) {
      return
    }

    const updates: {
      amountCents?: number
      counterpartyType?: CounterpartyType
      counterpartyId?: string
      counterpartyName?: string | null
    } = {}

    if (schedule.amountCents !== spec.amountCents) {
      updates.amountCents = spec.amountCents
    }
    if (schedule.counterpartyType !== spec.counterpartyType) {
      updates.counterpartyType = spec.counterpartyType
    }
    if (schedule.counterpartyId !== (spec.counterpartyId ?? null)) {
      updates.counterpartyId = spec.counterpartyId
      updates.counterpartyName = spec.counterpartyName ?? null
    }

    if (Object.keys(updates).length > 0) {
      await this.paymentScheduleService.update(
        organizationId,
        PaymentScheduleDirection.payable,
        schedule.id,
        updates,
      )
    }
  }

  private buildPayableSpec(
    resource:
      | SegmentResourceWithRelations
      | DepartureResourceWithRelations,
  ): PayableSpec {
    const isPartnerCounterparty = resource.counterpartyType === CounterpartyType.partner
    const counterpartyName = isPartnerCounterparty
      ? resource.partner?.name
      : resource.supplier?.name

    const title =
      resource.title.trim() ||
      `${this.resourceKindLabel(resource.resourceKind)}·${counterpartyName ?? '未命名'}`

    if (isPartnerCounterparty) {
      return {
        amountCents: resource.amountCents,
        title,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: resource.partnerId ?? undefined,
        counterpartyName: resource.partner?.name,
      }
    }

    return {
      amountCents: resource.amountCents,
      title,
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: resource.supplierId ?? undefined,
      counterpartyName: resource.supplier?.name,
    }
  }

  private resourceKindLabel(resourceKind: string): string {
    const labels: Record<string, string> = {
      transport: '用车',
      hotel: '酒店',
      guide: '导游',
      ticket: '门票',
      meal: '用餐',
      insurance: '保险',
      outsource: '拼出',
      other: '其他',
    }
    return labels[resourceKind] ?? resourceKind
  }

  private async findActivePayableSchedule(
    organizationId: string,
    resourceId: string,
    sourceType: string,
  ): Promise<PaymentSchedule | null> {
    return this.prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType,
        direction: PaymentScheduleDirection.payable,
        cancelledAt: null,
        voidedAt: null,
      },
    })
  }

  private async findAnyPayableSchedule(
    organizationId: string,
    resourceId: string,
    sourceType: string = PaymentScheduleSourceType.SEGMENT_RESOURCE,
    client: DbClient = this.prisma,
  ): Promise<PaymentSchedule | null> {
    return client.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType,
        direction: PaymentScheduleDirection.payable,
        voidedAt: null,
      },
    })
  }

  private async loadSegmentResourceOrThrow(
    organizationId: string,
    resourceId: string,
    client: DbClient = this.prisma,
  ): Promise<SegmentResourceWithRelations> {
    const resource = await client.segmentResource.findFirst({
      where: {
        id: resourceId,
        segment: { departure: { organizationId } },
      },
      include: {
        partner: true,
        supplier: true,
        segment: {
          select: {
            id: true,
            endDate: true,
            departure: {
              select: {
                id: true,
                organizationId: true,
                status: true,
                endDate: true,
              },
            },
          },
        },
      },
    })

    if (!resource) {
      throw new NotFoundException('段内资源不存在')
    }

    return resource
  }

  private async loadDepartureResourceOrThrow(
    organizationId: string,
    resourceId: string,
    client: DbClient = this.prisma,
  ): Promise<DepartureResourceWithRelations> {
    const resource = await client.departureResource.findFirst({
      where: {
        id: resourceId,
        departure: { organizationId },
      },
      include: {
        partner: true,
        supplier: true,
        departure: {
          select: {
            id: true,
            organizationId: true,
            status: true,
            endDate: true,
          },
        },
      },
    })

    if (!resource) {
      throw new NotFoundException('发团级资源不存在')
    }

    return resource
  }

  private buildReceivablePaths(order: SourceOrderWithRelations) {
    return buildSourceOrderReceivablePaths({
      sourceOrderId: order.id,
      partnerId: order.partnerId,
      partnerName: order.partner.name,
      displayName: order.displayName,
      collectionMode: order.collectionMode,
      depositCents: order.depositCents,
      balanceCents: order.balanceCents,
      netReceivableCents: order.netReceivableCents,
    })
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

  /** 约定变更同步：关闭不再适用且未 finance-touch 的节点（不走用户关闭 API）。 */
  private async cancelScheduleForConventionSync(scheduleId: string): Promise<void> {
    await this.prisma.paymentSchedule.update({
      where: { id: scheduleId },
      data: {
        cancelledAt: new Date(),
        closeDisposition: PaymentScheduleCloseDisposition.other,
        cancelReason: '约定变更同步：路径不再适用',
      },
    })
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
    return client.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: sourceOrderId,
        direction: PaymentScheduleDirection.receivable,
      },
    })
  }

  private async loadRebateSchedules(
    organizationId: string,
    sourceOrderId: string,
    client: DbClient = this.prisma,
  ): Promise<PaymentSchedule[]> {
    return client.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: sourceOrderId,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
        direction: PaymentScheduleDirection.payable,
      },
    })
  }

  private async loadSourceOrderOrThrow(
    organizationId: string,
    sourceOrderId: string,
    client: DbClient = this.prisma,
  ): Promise<SourceOrderWithRelations> {
    const order = await client.sourceOrder.findFirst({
      where: {
        id: sourceOrderId,
        departure: { organizationId },
      },
      include: {
        partner: true,
        departure: {
          select: {
            id: true,
            organizationId: true,
            status: true,
            startDate: true,
            endDate: true,
          },
        },
        fareAdjustments: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    })

    if (!order) {
      throw new NotFoundException('客源单不存在')
    }

    return order
  }

  private ensureDepartureAllowsNewObligation(
    departure: { status: string },
    action = '生成应收',
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
