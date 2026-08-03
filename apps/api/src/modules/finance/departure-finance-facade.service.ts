import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import {
  DepartureStatus,
  DirectoryProfileStatus,
  PaymentScheduleDirection,
  TransactionDirection,
  VerificationStatus as PrismaVerificationStatus,
  type DepartureResource,
  type Partner,
  type PaymentSchedule,
  type Prisma,
  type SegmentResource,
  type SourceOrder,
  type Supplier,
} from '@prisma/client'
import type {
  GenerateReceivablesResult,
  PaymentScheduleSummary,
  SourceOrderSummary,
} from '@xiaotuanbao/shared'
import {
  deriveScheduleState,
  isFinanceTouched,
  isResourcePayableSourceType,
  isSourceOrderReceivableSourceType,
  PaymentScheduleSourceType,
  PaymentScheduleStatus,
  SegmentPayableStatus,
  SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  formatDateOnly,
  getShanghaiTodayString,
} from '../departure/departure-date.utils'
import { reconcileUnitPricesToGross } from '../departure/source-order.utils'
import { DepartureFinanceGenerationService } from './departure-finance-generation.service'
import type {
  SourceOrderFinanceMeta,
  SourceOrderWithRelations,
} from './departure-finance-schedule-loaders'
import {
  buildDepartureFinanceObligationSummary,
  emptyDepartureFinanceObligationSummary,
  type DepartureFinanceObligationScheduleInput,
  type DepartureFinanceObligationSummary,
} from './departure-finance-obligation-summary'
import { buildSourceOrderFinanceMeta } from './source-order-finance-state'

type TxClient = Prisma.TransactionClient

/**
 * Segment Resource finance state owned by Finance (ADR-0004 / #49).
 * Paid/unpaid use effective verification allocation only — never unallocated outflows.
 */
export interface SegmentResourceFinanceState {
  hasSchedule: boolean
  paymentScheduleId: string | null
  financeTouched: boolean
  payableStatus: SegmentPayableStatus
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
  agreedAmountCents: number
  /** Null when finance has not started for this resource. */
  scheduleAmountCents: number | null
  /** Null when finance has not started — render as `—`, never numeric zero. */
  paidCents: number | null
  /** Null when finance has not started. Closed rows keep remaining unpaid. */
  unpaidCents: number | null
  /**
   * True when closed-with-remaining unpaid, or business amount ≠ schedule amount.
   * Close reason is intentionally omitted.
   */
  needsReview: boolean
}

/**
 * One Source Order receivable path finance state owned by Finance (#97).
 * Received/unreceived use effective verification allocation only — never unallocated inflows.
 */
export type SourceOrderReceivablePathType =
  | typeof PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT
  | typeof PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION
  | typeof PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION
  | typeof PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION

export interface SourceOrderPathFinanceState {
  pathType: SourceOrderReceivablePathType
  hasSchedule: boolean
  receivableStatus: SourceOrderReceivableStatus
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
  agreedAmountCents: number
  /** Null when finance has not started for this path. */
  scheduleAmountCents: number | null
  /** Null when finance has not started — render as `—`, never numeric zero. */
  receivedCents: number | null
  /** Null when finance has not started. Closed rows keep remaining unreceived. */
  unreceivedCents: number | null
  /**
   * True when closed-with-remaining unreceived, or business amount ≠ schedule amount.
   * Close reason is intentionally omitted.
   */
  needsReview: boolean
}

/**
 * Single Source Order finance-state surface (ADR-0004 step 3 / C2).
 * Paths for Operations Sheet / overview; aggregate meta for list + generation.
 */
export interface SourceOrderFinanceState {
  paths: SourceOrderPathFinanceState[]
  meta: SourceOrderFinanceMeta
}

/**
 * Departure-linked transaction still carrying unverified balance (#98).
 * Finance-owned; Operations Sheet must not recompute allocation rules.
 */
export interface DeparturePendingTransactionState {
  id: string
  direction: 'inflow' | 'outflow'
  transactionDate: Date
  counterpartyName: string
  remainingUnverifiedCents: number
  paymentChannel: string
  notes: string | null
}

export interface SourceOrderPathAmountInput {
  collectionMode: string
  depositCents: number
  balanceCents: number
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
}

function emptySourceOrderPathAmounts(): SourceOrderPathAmountInput {
  return {
    collectionMode: 'partner_settled',
    depositCents: 0,
    balanceCents: 0,
    netReceivableCents: 0,
    partnerCollectedCents: 0,
    guestCollectCents: 0,
  }
}

export interface DepartureFinanceSnapshot {
  sourceReceivableReceivedCents: number
  sourceReceivableOpenUnreceivedCents: number
  sourceReceivableClosedUnreceivedCents: number
  otherReceivableCents: number
  confirmedPayableCents: number
  paidCents: number
  /** 资源应付节点的有效核销合计，主付款进度分子（ADR-0020）。 */
  resourcePaidCents: number
  openUnpaidCents: number
  closedUnpaidCents: number
  resourcePayableCents: number
  otherPayableCents: number
  /** 已确认返利应付约定合计（SOURCE_ORDER_REBATE）。 */
  confirmedRebateCents: number
  /** 返利已付（有效核销）。 */
  rebatePaidCents: number
  /** 返利未付。 */
  rebateUnpaidCents: number
  incomeTransactionCents: number
  expenseTransactionCents: number
  unverifiedIncomeCents: number
  unverifiedExpenseCents: number
  /** 核销自外部流水（他团 + 无归属发团）到本团账款的金额。 */
  verifiedFromExternalCents: number
  verifiedToOtherDeparturesCents: number
}

export const emptyDepartureFinanceSnapshot = (): DepartureFinanceSnapshot => ({
  sourceReceivableReceivedCents: 0,
  sourceReceivableOpenUnreceivedCents: 0,
  sourceReceivableClosedUnreceivedCents: 0,
  otherReceivableCents: 0,
  confirmedPayableCents: 0,
  paidCents: 0,
  resourcePaidCents: 0,
  openUnpaidCents: 0,
  closedUnpaidCents: 0,
  resourcePayableCents: 0,
  otherPayableCents: 0,
  confirmedRebateCents: 0,
  rebatePaidCents: 0,
  rebateUnpaidCents: 0,
  incomeTransactionCents: 0,
  expenseTransactionCents: 0,
  unverifiedIncomeCents: 0,
  unverifiedExpenseCents: 0,
  verifiedFromExternalCents: 0,
  verifiedToOtherDeparturesCents: 0,
})

/**
 * One Facade read for Departure read model: signed snapshot (overview) +
 * clamped obligation summary (legacy flat fields / tags / settled gate).
 */
export interface DepartureFinanceReadBundle {
  snapshot: DepartureFinanceSnapshot
  obligationSummary: DepartureFinanceObligationSummary
}

export const emptyDepartureFinanceReadBundle = (): DepartureFinanceReadBundle => ({
  snapshot: emptyDepartureFinanceSnapshot(),
  obligationSummary: emptyDepartureFinanceObligationSummary(),
})

export type { DepartureFinanceObligationSummary }

/**
 * Authoritative Departure write gate owned by Finance (ADR-0004 / #86).
 * Archive-period mutability checks live here so callers share one judgment.
 * Snapshot, Generation, and Source Order finance-state aggregation live here;
 * Segment/Departure Resource finance-state already owned by this Facade.
 */
@Injectable()
export class DepartureFinanceFacade {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DepartureFinanceGenerationService))
    private readonly generation: DepartureFinanceGenerationService,
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
    const { order, schedules } = await this.generation.generateReceivableSchedules(
      organizationId,
      sourceOrderId,
      (departure, action) => this.assertAllowsNewObligation(departure, action),
    )
    const financeMeta = (
      await this.getSourceOrderFinanceState(organizationId, sourceOrderId, order)
    ).meta
    return {
      schedules,
      sourceOrder: toSourceOrderSummary(order, financeMeta),
      sourceAmountMismatch: financeMeta.hasSourceAmountMismatch,
    }
  }

  async syncSourceOrderSchedules(
    organizationId: string,
    order: SourceOrderWithRelations,
  ): Promise<SourceOrderFinanceMeta> {
    await this.generation.syncSourceOrderConvention(organizationId, order)
    return (await this.getSourceOrderFinanceState(organizationId, order.id, order)).meta
  }

  async generateResourcePayable(
    organizationId: string,
    params: { sourceType: string; sourceId: string },
  ): Promise<{
    schedule: PaymentScheduleSummary
    sourceAmountMismatch: boolean
  }> {
    const result = await this.generation.generateResourcePayable(
      organizationId,
      params,
      (departure, action) => this.assertAllowsNewObligation(departure, action),
    )
    if (result.resourceKind === 'segment') {
      const financeMeta = await this.getSegmentResourceFinanceState(
        organizationId,
        params.sourceId,
        result.resource as SegmentResource,
      )
      return {
        schedule: result.schedule,
        sourceAmountMismatch: financeMeta.hasSourceAmountMismatch,
      }
    }
    const financeMeta = await this.getDepartureResourceFinanceState(
      organizationId,
      params.sourceId,
      result.resource as DepartureResource,
    )
    return {
      schedule: result.schedule,
      sourceAmountMismatch: financeMeta.hasSourceAmountMismatch,
    }
  }

  async syncSegmentResourceSchedule(
    organizationId: string,
    resource: SegmentResource & {
      partner: Partner | null
      supplier: Supplier | null
      segment: {
        id: string
        endDate: Date | null
        departure: { id: string; organizationId: string; status: string; endDate: Date }
      }
    },
  ): Promise<SegmentResourceFinanceState> {
    await this.generation.syncSegmentResourceConvention(organizationId, resource)
    return this.getSegmentResourceFinanceState(organizationId, resource.id, resource)
  }

  async syncDepartureResourceSchedule(
    organizationId: string,
    resource: DepartureResource & {
      partner: Partner | null
      supplier: Supplier | null
      departure: { id: string; organizationId: string; status: string; endDate: Date }
    },
  ): Promise<SegmentResourceFinanceState> {
    await this.generation.syncDepartureResourceConvention(organizationId, resource)
    return this.getDepartureResourceFinanceState(organizationId, resource.id, resource)
  }

  /**
   * Departure finance read bundle: signed overview snapshot + clamped obligation
   * summary for legacy flat fields / completion tags / settled gate (ADR-0004 C4).
   */
  async getDepartureFinanceReadBundles(
    organizationId: string,
    departureIds: string[],
  ): Promise<Map<string, DepartureFinanceReadBundle>> {
    const uniqueIds = [...new Set(departureIds)]
    const result = new Map(
      uniqueIds.map((departureId) => [departureId, emptyDepartureFinanceReadBundle()]),
    )
    if (uniqueIds.length === 0) {
      return result
    }

    const [schedules, transactions] = await Promise.all([
      this.prisma.paymentSchedule.findMany({
        where: {
          organizationId,
          departureId: { in: uniqueIds },
          voidedAt: null,
        },
        select: {
          departureId: true,
          direction: true,
          amountCents: true,
          cancelledAt: true,
          sourceType: true,
          sourceId: true,
          // Load all normal verifications; snapshot excludes voided-txn rows below,
          // while obligationSummary keeps VerificationService.batchGetSettledAmounts
          // semantics (status=normal only, no voidedAt filter).
          verifications: {
            where: {
              status: PrismaVerificationStatus.normal,
            },
            select: {
              amountCents: true,
              transaction: { select: { departureId: true, voidedAt: true } },
            },
          },
        },
      }),
      this.prisma.financeTransaction.findMany({
        where: {
          organizationId,
          departureId: { in: uniqueIds },
          voidedAt: null,
        },
        select: {
          departureId: true,
          direction: true,
          amountCents: true,
          verifications: {
            where: { status: PrismaVerificationStatus.normal },
            select: {
              amountCents: true,
              paymentSchedule: {
                select: { departureId: true, voidedAt: true },
              },
            },
          },
        },
      }),
    ])

    const obligationSchedulesByDeparture = new Map<
      string,
      DepartureFinanceObligationScheduleInput[]
    >()
    for (const departureId of uniqueIds) {
      obligationSchedulesByDeparture.set(departureId, [])
    }

    for (const schedule of schedules) {
      const bundle = result.get(schedule.departureId)!
      const snapshot = bundle.snapshot
      const effectiveVerifications = schedule.verifications.filter(
        (verification) => verification.transaction.voidedAt == null,
      )
      const receivedOrPaidCents = effectiveVerifications.reduce(
        (sum, verification) => sum + verification.amountCents,
        0,
      )
      const legacySettledCents = schedule.verifications.reduce(
        (sum, verification) => sum + verification.amountCents,
        0,
      )
      const remainingCents = schedule.amountCents - receivedOrPaidCents
      obligationSchedulesByDeparture.get(schedule.departureId)!.push({
        direction: schedule.direction,
        amountCents: schedule.amountCents,
        cancelledAt: schedule.cancelledAt,
        settledCents: legacySettledCents,
      })

      if (schedule.direction === PaymentScheduleDirection.receivable) {
        const isSourceReceivable = isSourceOrderReceivableSourceType(schedule.sourceType)
        if (isSourceReceivable) {
          snapshot.sourceReceivableReceivedCents += receivedOrPaidCents
          if (schedule.cancelledAt) {
            snapshot.sourceReceivableClosedUnreceivedCents += remainingCents
          } else {
            snapshot.sourceReceivableOpenUnreceivedCents += remainingCents
          }
        } else {
          snapshot.otherReceivableCents += schedule.amountCents
        }
      } else {
        snapshot.confirmedPayableCents += schedule.amountCents
        snapshot.paidCents += receivedOrPaidCents
        if (schedule.cancelledAt) {
          snapshot.closedUnpaidCents += remainingCents
        } else {
          snapshot.openUnpaidCents += remainingCents
        }
        if (isResourcePayableSourceType(schedule.sourceType) && schedule.sourceId) {
          snapshot.resourcePayableCents += schedule.amountCents
          snapshot.resourcePaidCents += receivedOrPaidCents
        } else {
          snapshot.otherPayableCents += schedule.amountCents
        }
        if (schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_REBATE) {
          snapshot.confirmedRebateCents += schedule.amountCents
          snapshot.rebatePaidCents += receivedOrPaidCents
          snapshot.rebateUnpaidCents += remainingCents
        }
      }

      for (const verification of effectiveVerifications) {
        // 无归属发团的流水同样不进本团资金卡，与他团流水合并为外部核销口径。
        if (verification.transaction.departureId !== schedule.departureId) {
          snapshot.verifiedFromExternalCents += verification.amountCents
        }
      }
    }

    const clampedUnverifiedByDeparture = new Map(
      uniqueIds.map((departureId) => [
        departureId,
        { unverifiedIncomeCents: 0, unverifiedExpenseCents: 0 },
      ]),
    )

    for (const transaction of transactions) {
      if (!transaction.departureId) {
        continue
      }
      const snapshot = result.get(transaction.departureId)!.snapshot
      const allocatedForSnapshotCents = transaction.verifications.reduce(
        (sum, verification) =>
          verification.paymentSchedule.voidedAt == null
            ? sum + verification.amountCents
            : sum,
        0,
      )
      // Legacy flat fields match VerificationService: all normal verifications count,
      // then clamp unallocated with Math.max (signed remainder stays on snapshot).
      const allocatedForLegacyCents = transaction.verifications.reduce(
        (sum, verification) => sum + verification.amountCents,
        0,
      )
      const unverifiedCents = transaction.amountCents - allocatedForSnapshotCents
      const clampedUnverifiedCents = Math.max(
        transaction.amountCents - allocatedForLegacyCents,
        0,
      )
      const clampedBucket = clampedUnverifiedByDeparture.get(transaction.departureId)!
      if (transaction.direction === TransactionDirection.inflow) {
        snapshot.incomeTransactionCents += transaction.amountCents
        snapshot.unverifiedIncomeCents += unverifiedCents
        clampedBucket.unverifiedIncomeCents += clampedUnverifiedCents
      } else {
        snapshot.expenseTransactionCents += transaction.amountCents
        snapshot.unverifiedExpenseCents += unverifiedCents
        clampedBucket.unverifiedExpenseCents += clampedUnverifiedCents
      }
      for (const verification of transaction.verifications) {
        if (
          verification.paymentSchedule.voidedAt == null &&
          verification.paymentSchedule.departureId !== transaction.departureId
        ) {
          snapshot.verifiedToOtherDeparturesCents += verification.amountCents
        }
      }
    }

    for (const departureId of uniqueIds) {
      const bundle = result.get(departureId)!
      bundle.obligationSummary = buildDepartureFinanceObligationSummary({
        schedules: obligationSchedulesByDeparture.get(departureId) ?? [],
        unverifiedCash: clampedUnverifiedByDeparture.get(departureId),
      })
    }

    return result
  }

  assertMutable(departure: { status: string }, action = '编辑'): void {
    if (departure.status === DepartureStatus.closed) {
      throw new ConflictException(`发团已关闭，不可${action}`)
    }
  }

  /**
   * New AR/AP obligations must not open under a settled Departure — that would
   * leave "settled with open debt". Archive is already blocked by assertMutable.
   */
  assertAllowsNewObligation(departure: { status: string }, action = '创建收付款节点'): void {
    this.assertMutable(departure, action)
    if (departure.status === DepartureStatus.settled) {
      throw new ConflictException(`发团已结清，不可${action}`)
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

  async assertAllowsNewObligationById(
    organizationId: string,
    departureId: string,
    action = '创建收付款节点',
  ): Promise<void> {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
      select: { status: true },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    this.assertAllowsNewObligation(departure, action)
  }

  /**
   * Serialize a finance write with Departure archive/state writes, then judge
   * mutability from the locked row inside the caller's transaction.
   */
  async lockMutableById(
    tx: TxClient,
    organizationId: string,
    departureId: string,
    action = '操作',
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id
      FROM departures
      WHERE id = ${departureId}
        AND organization_id = ${organizationId}
      FOR UPDATE
    `

    const departure = await tx.departure.findFirst({
      where: { id: departureId, organizationId },
      select: { status: true },
    })
    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    this.assertMutable(departure, action)
  }

  async lockAllowsNewObligationById(
    tx: TxClient,
    organizationId: string,
    departureId: string,
    action = '创建收付款节点',
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id
      FROM departures
      WHERE id = ${departureId}
        AND organization_id = ${organizationId}
      FOR UPDATE
    `

    const departure = await tx.departure.findFirst({
      where: { id: departureId, organizationId },
      select: { status: true },
    })
    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    this.assertAllowsNewObligation(departure, action)
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

  async listDepartureOptions(organizationId: string) {
    return this.prisma.departure.findMany({
      where: { organizationId },
      select: {
        id: true,
        departureNo: true,
        name: true,
        status: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async listPartnerOptions(organizationId: string, departureId?: string) {
    if (departureId) {
      await this.requireDepartureId(organizationId, departureId)
    }

    return this.prisma.partner.findMany({
      where: {
        organizationId,
        status: DirectoryProfileStatus.active,
        ...(departureId
          ? { sourceOrders: { some: { departureId } } }
          : {}),
      },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async listSupplierOptions(organizationId: string, departureId?: string) {
    if (departureId) {
      await this.requireDepartureId(organizationId, departureId)
    }

    return this.prisma.supplier.findMany({
      where: {
        organizationId,
        status: DirectoryProfileStatus.active,
        ...(departureId
          ? {
              segmentResources: {
                some: { segment: { departureId } },
              },
            }
          : {}),
      },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async listSourceOrderOptions(organizationId: string, departureId: string) {
    await this.requireDepartureId(organizationId, departureId)

    return this.prisma.sourceOrder.findMany({
      where: {
        departureId,
        departure: { organizationId },
        guestCollectCents: { gt: 0 },
      },
      select: { id: true, displayName: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  private async requireDepartureId(organizationId: string, departureId: string) {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
      select: { id: true },
    })
    if (!departure) {
      throw new NotFoundException('发团不存在')
    }
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
   * Cancelling a verification on an open schedule can make a settled
   * departure financially unsettled. Reverse the status in the same
   * transaction so no settled/open-debt state is ever committed.
   */
  async reverseSettlementOnVerificationCancel(
    tx: TxClient,
    params: {
      organizationId: string
      departureId: string
      triggerPaymentScheduleId: string
      reason: string
      operatedBy: string
      operatedAt: Date
    },
  ): Promise<DepartureStatus> {
    const departure = await tx.departure.findFirst({
      where: { id: params.departureId, organizationId: params.organizationId },
      select: { id: true, status: true },
    })
    if (!departure) {
      throw new NotFoundException('发团不存在')
    }
    if (departure.status !== DepartureStatus.settled) {
      return departure.status
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
   * Sync resource agreed amount with an explicit payable adjustment
   * inside the caller's transaction (ADR-0010 / ADR-0004).
   * Dispatches by resource payable sourceType (segment ∪ departure).
   */
  async syncResourceAmountOnPayableAdjust(
    tx: TxClient,
    params: { sourceType: string; sourceId: string; amountCents: number },
  ): Promise<void> {
    if (params.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE) {
      await this.syncSegmentResourceAmountOnPayableAdjust(tx, {
        resourceId: params.sourceId,
        amountCents: params.amountCents,
      })
      return
    }
    if (params.sourceType === PaymentScheduleSourceType.DEPARTURE_RESOURCE) {
      await this.syncDepartureResourceAmountOnPayableAdjust(tx, {
        resourceId: params.sourceId,
        amountCents: params.amountCents,
      })
      return
    }
    throw new BadRequestException('仅资源应付节点可调整约定金额')
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

  async syncDepartureResourceAmountOnPayableAdjust(
    tx: TxClient,
    params: { resourceId: string; amountCents: number },
  ): Promise<void> {
    const resource = await tx.departureResource.findFirst({
      where: { id: params.resourceId },
      select: { id: true },
    })
    if (!resource) {
      throw new BadRequestException('关联资源不存在，无法调整约定金额')
    }

    await tx.departureResource.update({
      where: { id: resource.id },
      data: { amountCents: params.amountCents },
    })
  }

  /**
   * Row-lock the resource source before voiding its payable (concurrency with regenerate).
   * Dispatches by resource payable sourceType (segment ∪ departure).
   */
  async lockResourceSourceForVoid(
    tx: TxClient,
    params: { organizationId: string; sourceType: string; sourceId: string },
  ): Promise<void> {
    if (params.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE) {
      await tx.$queryRaw`
        SELECT sr.id
        FROM segment_resources sr
        JOIN itinerary_segments segment ON segment.id = sr.segment_id
        JOIN departures departure ON departure.id = segment.departure_id
        WHERE sr.id = ${params.sourceId}
          AND departure.organization_id = ${params.organizationId}
        FOR UPDATE OF sr
      `
      return
    }
    if (params.sourceType === PaymentScheduleSourceType.DEPARTURE_RESOURCE) {
      await tx.$queryRaw`
        SELECT dr.id
        FROM departure_resources dr
        JOIN departures departure ON departure.id = dr.departure_id
        WHERE dr.id = ${params.sourceId}
          AND departure.organization_id = ${params.organizationId}
        FOR UPDATE OF dr
      `
      return
    }
    throw new BadRequestException('仅资源应付节点可作废')
  }

  /**
   * Sync one source-order receivable path amount with an explicit adjustment
   * inside the caller's transaction (ADR-0010 / ADR-0004 / #93).
   * Updates only the targeted path + netReceivable; sibling path untouched.
   */
  async syncSourceOrderPathAmountOnReceivableAdjust(
    tx: TxClient,
    params: {
      sourceOrderId: string
      sourceType: string
      amountCents: number
    },
  ): Promise<void> {
    const order = await tx.sourceOrder.findFirst({
      where: { id: params.sourceOrderId },
      select: {
        id: true,
        collectionMode: true,
        depositCents: true,
        balanceCents: true,
        partnerCollectedCents: true,
        guestCollectCents: true,
        netReceivableCents: true,
        discountCents: true,
        adultGuestCount: true,
        childGuestCount: true,
        adultUnitPriceCents: true,
        childUnitPriceCents: true,
      },
    })
    if (!order) {
      throw new BadRequestException('关联客源单不存在，无法调整约定金额')
    }

    let depositCents = order.depositCents
    let balanceCents = order.balanceCents
    let partnerCollectedCents = order.partnerCollectedCents
    let guestCollectCents = order.guestCollectCents
    let netReceivableCents = order.netReceivableCents
    let rewriteGross = false

    if (params.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT) {
      if (order.collectionMode === 'partner_settled') {
        // 全部客户结算：客户路径金额即 S；P 展示与路径一致。
        partnerCollectedCents = params.amountCents
        netReceivableCents = params.amountCents
        rewriteGross = true
      }
      // 代收场景客户补款 = max(0,S−G实收)，不是 P；调整约定金额不回写 P。
    } else if (
      params.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION
    ) {
      depositCents = params.amountCents
      guestCollectCents =
        order.collectionMode === 'guest_only' ? depositCents + balanceCents : balanceCents
    } else if (
      params.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION
    ) {
      balanceCents = params.amountCents
      guestCollectCents =
        order.collectionMode === 'guest_only' ? depositCents + balanceCents : balanceCents
      if (order.collectionMode === 'split') {
        partnerCollectedCents = depositCents
      }
    } else {
      throw new BadRequestException('仅客源应收路径可调整约定金额')
    }

    const data: {
      depositCents: number
      balanceCents: number
      partnerCollectedCents: number
      guestCollectCents: number
      netReceivableCents?: number
      grossReceivableCents?: number
      adultUnitPriceCents?: number
      childUnitPriceCents?: number
    } = {
      depositCents,
      balanceCents,
      partnerCollectedCents,
      guestCollectCents,
    }

    if (rewriteGross) {
      const grossReceivableCents = netReceivableCents + order.discountCents
      const unitPrices = reconcileUnitPricesToGross({
        adultGuestCount: order.adultGuestCount,
        childGuestCount: order.childGuestCount,
        adultUnitPriceCents: order.adultUnitPriceCents,
        childUnitPriceCents: order.childUnitPriceCents,
        grossReceivableCents,
      })
      data.netReceivableCents = netReceivableCents
      data.grossReceivableCents = grossReceivableCents
      data.adultUnitPriceCents = unitPrices.adultUnitPriceCents
      data.childUnitPriceCents = unitPrices.childUnitPriceCents
    }

    await tx.sourceOrder.update({
      where: { id: order.id },
      data,
    })
  }

  /**
   * Segment Resource finance state for one or more resources (ADR-0004 / #49).
   * Departure list/detail and Operations Sheet consume this — they must not
   * re-derive verification or finance-touched rules from raw schedules.
   */
  async getSegmentResourceFinanceStates(
    organizationId: string,
    resourceIds: string[],
    agreedAmountByResourceId?: Map<string, number>,
  ): Promise<Map<string, SegmentResourceFinanceState>> {
    const uniqueIds = [...new Set(resourceIds)]
    const result = new Map<string, SegmentResourceFinanceState>()
    if (uniqueIds.length === 0) {
      return result
    }

    const amountMap = agreedAmountByResourceId ?? (await this.loadAgreedAmounts(uniqueIds))

    const schedules = await this.prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: { in: uniqueIds },
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        direction: PaymentScheduleDirection.payable,
        voidedAt: null,
      },
    })

    const schedulesByResourceId = new Map<string, PaymentSchedule[]>()
    for (const schedule of schedules) {
      if (!schedule.sourceId) {
        continue
      }
      const list = schedulesByResourceId.get(schedule.sourceId) ?? []
      list.push(schedule)
      schedulesByResourceId.set(schedule.sourceId, list)
    }

    const scheduleByResourceId = new Map<string, PaymentSchedule>()
    for (const [resourceId, list] of schedulesByResourceId) {
      const active = list.find((schedule) => schedule.cancelledAt == null)
      if (active) {
        scheduleByResourceId.set(resourceId, active)
        continue
      }
      const latestCancelled = [...list].sort(
        (a, b) => (b.cancelledAt?.getTime() ?? 0) - (a.cancelledAt?.getTime() ?? 0),
      )[0]
      if (latestCancelled) {
        scheduleByResourceId.set(resourceId, latestCancelled)
      }
    }

    const scheduleIds = [...scheduleByResourceId.values()].map((schedule) => schedule.id)
    const [settledMap, historyMap] = await Promise.all([
      this.batchGetSettledAmounts(scheduleIds),
      this.batchHasVerificationHistory(scheduleIds),
    ])

    for (const resourceId of uniqueIds) {
      const agreedAmountCents = amountMap.get(resourceId) ?? 0
      const schedule = scheduleByResourceId.get(resourceId)
      result.set(
        resourceId,
        this.toResourceFinanceState(
          agreedAmountCents,
          schedule ?? null,
          schedule ? (settledMap.get(schedule.id) ?? 0) : 0,
          schedule ? (historyMap.get(schedule.id) ?? false) : false,
        ),
      )
    }

    return result
  }

  async getSegmentResourceFinanceState(
    organizationId: string,
    resourceId: string,
    resource?: Pick<SegmentResource, 'amountCents'>,
  ): Promise<SegmentResourceFinanceState> {
    const agreedAmountByResourceId = resource
      ? new Map([[resourceId, resource.amountCents]])
      : undefined
    const map = await this.getSegmentResourceFinanceStates(
      organizationId,
      [resourceId],
      agreedAmountByResourceId,
    )
    return (
      map.get(resourceId) ??
      this.toResourceFinanceState(resource?.amountCents ?? 0, null, 0, false)
    )
  }

  async getDepartureResourceFinanceStates(
    organizationId: string,
    resourceIds: string[],
    agreedAmountByResourceId?: Map<string, number>,
  ): Promise<Map<string, SegmentResourceFinanceState>> {
    const uniqueIds = [...new Set(resourceIds)]
    const result = new Map<string, SegmentResourceFinanceState>()
    if (uniqueIds.length === 0) {
      return result
    }

    const amountMap =
      agreedAmountByResourceId ?? (await this.loadDepartureAgreedAmounts(uniqueIds))

    const schedules = await this.prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: { in: uniqueIds },
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        direction: PaymentScheduleDirection.payable,
        voidedAt: null,
      },
    })

    const schedulesByResourceId = new Map<string, PaymentSchedule[]>()
    for (const schedule of schedules) {
      if (!schedule.sourceId) {
        continue
      }
      const list = schedulesByResourceId.get(schedule.sourceId) ?? []
      list.push(schedule)
      schedulesByResourceId.set(schedule.sourceId, list)
    }

    const scheduleByResourceId = new Map<string, PaymentSchedule>()
    for (const [resourceId, list] of schedulesByResourceId) {
      const active = list.find((schedule) => schedule.cancelledAt == null)
      if (active) {
        scheduleByResourceId.set(resourceId, active)
        continue
      }
      const latestCancelled = [...list].sort(
        (a, b) => (b.cancelledAt?.getTime() ?? 0) - (a.cancelledAt?.getTime() ?? 0),
      )[0]
      if (latestCancelled) {
        scheduleByResourceId.set(resourceId, latestCancelled)
      }
    }

    const scheduleIds = [...scheduleByResourceId.values()].map((schedule) => schedule.id)
    const [settledMap, historyMap] = await Promise.all([
      this.batchGetSettledAmounts(scheduleIds),
      this.batchHasVerificationHistory(scheduleIds),
    ])

    for (const resourceId of uniqueIds) {
      const agreedAmountCents = amountMap.get(resourceId) ?? 0
      const schedule = scheduleByResourceId.get(resourceId)
      result.set(
        resourceId,
        this.toResourceFinanceState(
          agreedAmountCents,
          schedule ?? null,
          schedule ? (settledMap.get(schedule.id) ?? 0) : 0,
          schedule ? (historyMap.get(schedule.id) ?? false) : false,
        ),
      )
    }

    return result
  }

  async getDepartureResourceFinanceState(
    organizationId: string,
    resourceId: string,
    resource?: Pick<{ amountCents: number }, 'amountCents'>,
  ): Promise<SegmentResourceFinanceState> {
    const agreedAmountByResourceId = resource
      ? new Map([[resourceId, resource.amountCents]])
      : undefined
    const map = await this.getDepartureResourceFinanceStates(
      organizationId,
      [resourceId],
      agreedAmountByResourceId,
    )
    return (
      map.get(resourceId) ??
      this.toResourceFinanceState(resource?.amountCents ?? 0, null, 0, false)
    )
  }

  /**
   * Source Order finance states — paths + aggregate meta (ADR-0004 step 3).
   * Single deep interface for list glance and generation callbacks.
   * Path-only callers should use {@link getSourceOrderPathFinanceStates}.
   */
  async getSourceOrderFinanceStates(
    organizationId: string,
    sourceOrderIds: string[],
    agreedAmountsBySourceOrderId?: Map<string, SourceOrderPathAmountInput>,
  ): Promise<Map<string, SourceOrderFinanceState>> {
    const uniqueIds = [...new Set(sourceOrderIds)]
    const result = new Map<string, SourceOrderFinanceState>()
    if (uniqueIds.length === 0) {
      return result
    }

    const amountMap =
      agreedAmountsBySourceOrderId ?? (await this.loadSourceOrderPathAmounts(uniqueIds))

    const [pathMap, receivableSchedules, rebateSchedules] = await Promise.all([
      this.getSourceOrderPathFinanceStates(organizationId, uniqueIds, amountMap),
      this.prisma.paymentSchedule.findMany({
        where: {
          organizationId,
          sourceId: { in: uniqueIds },
          direction: PaymentScheduleDirection.receivable,
        },
      }),
      this.prisma.paymentSchedule.findMany({
        where: {
          organizationId,
          sourceId: { in: uniqueIds },
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
          direction: PaymentScheduleDirection.payable,
        },
      }),
    ])

    const receivablesBySourceOrderId = new Map<string, PaymentSchedule[]>()
    for (const schedule of receivableSchedules) {
      if (!schedule.sourceId) {
        continue
      }
      const list = receivablesBySourceOrderId.get(schedule.sourceId) ?? []
      list.push(schedule)
      receivablesBySourceOrderId.set(schedule.sourceId, list)
    }

    const rebatesBySourceOrderId = new Map<string, PaymentSchedule[]>()
    for (const schedule of rebateSchedules) {
      if (!schedule.sourceId) {
        continue
      }
      const list = rebatesBySourceOrderId.get(schedule.sourceId) ?? []
      list.push(schedule)
      rebatesBySourceOrderId.set(schedule.sourceId, list)
    }

    const touchScheduleIds = [...receivableSchedules, ...rebateSchedules].map(
      (schedule) => schedule.id,
    )
    const [settledMap, historyMap] = await Promise.all([
      this.batchGetSettledAmounts(touchScheduleIds),
      this.batchHasVerificationHistory(touchScheduleIds),
    ])

    for (const sourceOrderId of uniqueIds) {
      const amounts = amountMap.get(sourceOrderId) ?? emptySourceOrderPathAmounts()
      result.set(sourceOrderId, {
        paths: pathMap.get(sourceOrderId) ?? [],
        meta: buildSourceOrderFinanceMeta({
          amounts: { ...amounts, id: sourceOrderId },
          receivableSchedules: receivablesBySourceOrderId.get(sourceOrderId) ?? [],
          rebateSchedules: rebatesBySourceOrderId.get(sourceOrderId) ?? [],
          settledMap,
          historyMap,
        }),
      })
    }

    return result
  }

  async getSourceOrderFinanceState(
    organizationId: string,
    sourceOrderId: string,
    order?: SourceOrderPathAmountInput,
  ): Promise<SourceOrderFinanceState> {
    const agreedAmounts = order ? new Map([[sourceOrderId, order]]) : undefined
    const map = await this.getSourceOrderFinanceStates(
      organizationId,
      [sourceOrderId],
      agreedAmounts,
    )
    return map.get(sourceOrderId) ?? {
      paths: [],
      meta: buildSourceOrderFinanceMeta({
        amounts: order ?? emptySourceOrderPathAmounts(),
        receivableSchedules: [],
        rebateSchedules: [],
        settledMap: new Map(),
        historyMap: new Map(),
      }),
    }
  }

  /**
   * Source Order receivable-path finance states (ADR-0004 / #97).
   * Returns one entry per present business path, plus any path with an existing schedule
   * so legacy-corrupt signed source amounts do not hide finance history.
   * Operations Sheet / overview consume this — it must not re-derive verification rules.
   */
  async getSourceOrderPathFinanceStates(
    organizationId: string,
    sourceOrderIds: string[],
    agreedAmountsBySourceOrderId?: Map<string, SourceOrderPathAmountInput>,
  ): Promise<Map<string, SourceOrderPathFinanceState[]>> {
    const uniqueIds = [...new Set(sourceOrderIds)]
    const result = new Map<string, SourceOrderPathFinanceState[]>()
    if (uniqueIds.length === 0) {
      return result
    }

    const amountMap =
      agreedAmountsBySourceOrderId ?? (await this.loadSourceOrderPathAmounts(uniqueIds))

    const schedules = await this.prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: { in: uniqueIds },
        direction: PaymentScheduleDirection.receivable,
        sourceType: {
          in: [...SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES],
        },
      },
    })

    const schedulesByKey = new Map<string, PaymentSchedule[]>()
    for (const schedule of schedules) {
      if (!schedule.sourceId) {
        continue
      }
      const key = `${schedule.sourceId}::${schedule.sourceType}`
      const list = schedulesByKey.get(key) ?? []
      list.push(schedule)
      schedulesByKey.set(key, list)
    }

    const scheduleByKey = new Map<string, PaymentSchedule>()
    for (const [key, list] of schedulesByKey) {
      const active = list.find((schedule) => schedule.cancelledAt == null)
      if (active) {
        scheduleByKey.set(key, active)
        continue
      }
      const latestCancelled = [...list].sort(
        (a, b) => (b.cancelledAt?.getTime() ?? 0) - (a.cancelledAt?.getTime() ?? 0),
      )[0]
      if (latestCancelled) {
        scheduleByKey.set(key, latestCancelled)
      }
    }

    const scheduleIds = [...scheduleByKey.values()].map((schedule) => schedule.id)
    const [settledMap, historyMap] = await Promise.all([
      this.batchGetSettledAmounts(scheduleIds),
      this.batchHasVerificationHistory(scheduleIds),
    ])

    for (const sourceOrderId of uniqueIds) {
      const amounts = amountMap.get(sourceOrderId) ?? emptySourceOrderPathAmounts()
      const paths: SourceOrderPathFinanceState[] = []
      const customerKey = `${sourceOrderId}::${PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT}`
      const depositKey = `${sourceOrderId}::${PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION}`
      const balanceKey = `${sourceOrderId}::${PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION}`
      const legacyGuestKey = `${sourceOrderId}::${PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION}`
      const customerSchedule = scheduleByKey.get(customerKey) ?? null
      const depositSchedule = scheduleByKey.get(depositKey) ?? null
      const balanceSchedule = scheduleByKey.get(balanceKey) ?? null
      const legacyGuestSchedule = scheduleByKey.get(legacyGuestKey) ?? null

      const expectCustomer =
        amounts.collectionMode === 'partner_settled' &&
        (amounts.netReceivableCents > 0 || customerSchedule != null)
      if (expectCustomer || customerSchedule) {
        const agreedAmountCents =
          amounts.collectionMode === 'partner_settled'
            ? amounts.netReceivableCents
            : amounts.partnerCollectedCents
        paths.push(
          this.toPathFinanceState(
            PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
            agreedAmountCents,
            customerSchedule,
            customerSchedule ? (settledMap.get(customerSchedule.id) ?? 0) : 0,
            customerSchedule ? (historyMap.get(customerSchedule.id) ?? false) : false,
          ),
        )
      }

      const expectDeposit =
        amounts.collectionMode === 'guest_only' &&
        (amounts.depositCents > 0 || depositSchedule != null)
      if (expectDeposit || depositSchedule) {
        paths.push(
          this.toPathFinanceState(
            PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
            amounts.depositCents,
            depositSchedule,
            depositSchedule ? (settledMap.get(depositSchedule.id) ?? 0) : 0,
            depositSchedule ? (historyMap.get(depositSchedule.id) ?? false) : false,
          ),
        )
      }

      const expectBalance =
        (amounts.collectionMode === 'guest_only' || amounts.collectionMode === 'split') &&
        (amounts.balanceCents > 0 || balanceSchedule != null)
      if (expectBalance || balanceSchedule) {
        paths.push(
          this.toPathFinanceState(
            PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
            amounts.balanceCents,
            balanceSchedule,
            balanceSchedule ? (settledMap.get(balanceSchedule.id) ?? 0) : 0,
            balanceSchedule ? (historyMap.get(balanceSchedule.id) ?? false) : false,
          ),
        )
      }

      // pre-split 单节点游客代收：只读展示，避免路径列表漏掉仍存在的 legacy 节点。
      if (legacyGuestSchedule) {
        paths.push(
          this.toPathFinanceState(
            PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
            amounts.guestCollectCents,
            legacyGuestSchedule,
            settledMap.get(legacyGuestSchedule.id) ?? 0,
            historyMap.get(legacyGuestSchedule.id) ?? false,
          ),
        )
      }

      result.set(sourceOrderId, paths)
    }

    return result
  }

  /**
   * Non-voided departure-linked transactions with remaining unverified balance (#98).
   * Remaining uses effective (normal) verification allocation only.
   */
  async getPendingTransactions(
    organizationId: string,
    departureId: string,
  ): Promise<DeparturePendingTransactionState[]> {
    const transactions = await this.prisma.financeTransaction.findMany({
      where: {
        organizationId,
        departureId,
        voidedAt: null,
      },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        direction: true,
        transactionDate: true,
        counterpartyName: true,
        amountCents: true,
        paymentChannel: true,
        notes: true,
      },
    })

    if (transactions.length === 0) {
      return []
    }

    const allocatedByTransactionId = await this.batchGetAllocatedAmountsByTransaction(
      transactions.map((transaction) => transaction.id),
    )

    const pending: DeparturePendingTransactionState[] = []
    for (const transaction of transactions) {
      const remainingUnverifiedCents = Math.max(
        transaction.amountCents - (allocatedByTransactionId.get(transaction.id) ?? 0),
        0,
      )
      if (remainingUnverifiedCents <= 0) {
        continue
      }
      pending.push({
        id: transaction.id,
        direction: transaction.direction,
        transactionDate: transaction.transactionDate,
        counterpartyName: transaction.counterpartyName?.trim() || '',
        remainingUnverifiedCents,
        paymentChannel: transaction.paymentChannel,
        notes: transaction.notes,
      })
    }

    return pending
  }

  private async loadDepartureAgreedAmounts(
    resourceIds: string[],
  ): Promise<Map<string, number>> {
    const resources = await this.prisma.departureResource.findMany({
      where: { id: { in: resourceIds } },
      select: { id: true, amountCents: true },
    })
    return new Map(resources.map((resource) => [resource.id, resource.amountCents]))
  }

  private async loadAgreedAmounts(resourceIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.segmentResource.findMany({
      where: { id: { in: resourceIds } },
      select: { id: true, amountCents: true },
    })
    return new Map(rows.map((row) => [row.id, row.amountCents]))
  }

  private async loadSourceOrderPathAmounts(
    sourceOrderIds: string[],
  ): Promise<Map<string, SourceOrderPathAmountInput>> {
    const rows = await this.prisma.sourceOrder.findMany({
      where: { id: { in: sourceOrderIds } },
      select: {
        id: true,
        collectionMode: true,
        depositCents: true,
        balanceCents: true,
        netReceivableCents: true,
        partnerCollectedCents: true,
        guestCollectCents: true,
      },
    })
    return new Map(
      rows.map((row) => [
        row.id,
        {
          collectionMode: row.collectionMode,
          depositCents: row.depositCents,
          balanceCents: row.balanceCents,
          netReceivableCents: row.netReceivableCents,
          partnerCollectedCents: row.partnerCollectedCents,
          guestCollectCents: row.guestCollectCents,
        },
      ]),
    )
  }

  private toPathFinanceState(
    pathType: SourceOrderReceivablePathType,
    agreedAmountCents: number,
    schedule: PaymentSchedule | null,
    settledAmountCents: number,
    hasVerificationHistory: boolean,
  ): SourceOrderPathFinanceState {
    if (!schedule) {
      return {
        pathType,
        hasSchedule: false,
        receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: false,
        agreedAmountCents,
        scheduleAmountCents: null,
        receivedCents: null,
        unreceivedCents: null,
        needsReview: false,
      }
    }

    const unreceivedCents = Math.max(schedule.amountCents - settledAmountCents, 0)

    if (schedule.cancelledAt != null) {
      return {
        pathType,
        hasSchedule: true,
        receivableStatus: SourceOrderReceivableStatus.CLOSED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: true,
        agreedAmountCents,
        scheduleAmountCents: schedule.amountCents,
        receivedCents: settledAmountCents,
        unreceivedCents,
        needsReview: unreceivedCents > 0,
      }
    }

    const touched = isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)
    let hasSourceAmountMismatch = false
    let amountFieldsLocked = false

    if (touched) {
      amountFieldsLocked = true
      if (agreedAmountCents > 0 && schedule.amountCents !== agreedAmountCents) {
        hasSourceAmountMismatch = true
      }
    }

    const status = deriveScheduleState({
      amountCents: schedule.amountCents,
      settledAmountCents,
      dueDate: formatDateOnly(schedule.dueDate),
      cancelledAt: schedule.cancelledAt,
      businessDate: getShanghaiTodayString(),
      direction: schedule.direction,
    })

    let receivableStatus = SourceOrderReceivableStatus.PENDING
    if (status === PaymentScheduleStatus.SETTLED) {
      receivableStatus = SourceOrderReceivableStatus.COLLECTED
      amountFieldsLocked = true
    } else if (settledAmountCents > 0 && settledAmountCents < schedule.amountCents) {
      receivableStatus = SourceOrderReceivableStatus.PARTIAL
    }

    return {
      pathType,
      hasSchedule: true,
      receivableStatus,
      hasSourceAmountMismatch,
      amountFieldsLocked,
      agreedAmountCents,
      scheduleAmountCents: schedule.amountCents,
      receivedCents: settledAmountCents,
      unreceivedCents,
      needsReview: hasSourceAmountMismatch,
    }
  }

  private toResourceFinanceState(
    agreedAmountCents: number,
    schedule: PaymentSchedule | null,
    settledAmountCents: number,
    hasVerificationHistory: boolean,
  ): SegmentResourceFinanceState {
    if (!schedule) {
      return {
        hasSchedule: false,
        paymentScheduleId: null,
        financeTouched: false,
        payableStatus: SegmentPayableStatus.NOT_GENERATED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: false,
        agreedAmountCents,
        scheduleAmountCents: null,
        paidCents: null,
        unpaidCents: null,
        needsReview: false,
      }
    }

    const unpaidCents = Math.max(schedule.amountCents - settledAmountCents, 0)

    if (schedule.cancelledAt != null) {
      return {
        hasSchedule: true,
        paymentScheduleId: schedule.id,
        financeTouched: true,
        payableStatus: SegmentPayableStatus.CLOSED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: true,
        agreedAmountCents,
        scheduleAmountCents: schedule.amountCents,
        paidCents: settledAmountCents,
        unpaidCents,
        needsReview: unpaidCents > 0,
      }
    }

    const touched = isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)
    let hasSourceAmountMismatch = false
    let amountFieldsLocked = false

    if (touched) {
      amountFieldsLocked = true
      if (agreedAmountCents > 0 && schedule.amountCents !== agreedAmountCents) {
        hasSourceAmountMismatch = true
      }
    }

    const status = deriveScheduleState({
      amountCents: schedule.amountCents,
      settledAmountCents,
      dueDate: formatDateOnly(schedule.dueDate),
      cancelledAt: schedule.cancelledAt,
      businessDate: getShanghaiTodayString(),
      direction: schedule.direction,
    })

    let payableStatus = SegmentPayableStatus.PENDING
    if (status === PaymentScheduleStatus.SETTLED) {
      payableStatus = SegmentPayableStatus.PAID
      amountFieldsLocked = true
    } else if (settledAmountCents > 0 && settledAmountCents < schedule.amountCents) {
      payableStatus = SegmentPayableStatus.PARTIAL
    }

    return {
      hasSchedule: true,
      paymentScheduleId: schedule.id,
      financeTouched: touched,
      payableStatus,
      hasSourceAmountMismatch,
      amountFieldsLocked,
      agreedAmountCents,
      scheduleAmountCents: schedule.amountCents,
      paidCents: settledAmountCents,
      unpaidCents,
      needsReview: hasSourceAmountMismatch,
    }
  }

  private async batchGetSettledAmounts(scheduleIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (scheduleIds.length === 0) {
      return map
    }

    const rows = await this.prisma.financeVerification.groupBy({
      by: ['paymentScheduleId'],
      where: {
        paymentScheduleId: { in: scheduleIds },
        status: PrismaVerificationStatus.normal,
      },
      _sum: { amountCents: true },
    })

    for (const row of rows) {
      map.set(row.paymentScheduleId, row._sum.amountCents ?? 0)
    }
    return map
  }

  private async batchGetAllocatedAmountsByTransaction(
    transactionIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (transactionIds.length === 0) {
      return map
    }

    const rows = await this.prisma.financeVerification.groupBy({
      by: ['transactionId'],
      where: {
        transactionId: { in: transactionIds },
        status: PrismaVerificationStatus.normal,
      },
      _sum: { amountCents: true },
    })

    for (const row of rows) {
      map.set(row.transactionId, row._sum.amountCents ?? 0)
    }
    return map
  }

  private async batchHasVerificationHistory(
    scheduleIds: string[],
  ): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>()
    for (const scheduleId of scheduleIds) {
      map.set(scheduleId, false)
    }
    if (scheduleIds.length === 0) {
      return map
    }

    const rows = await this.prisma.financeVerification.groupBy({
      by: ['paymentScheduleId'],
      where: { paymentScheduleId: { in: scheduleIds } },
      _count: { _all: true },
    })

    for (const row of rows) {
      map.set(row.paymentScheduleId, row._count._all > 0)
    }
    return map
  }
}
