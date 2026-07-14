import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  DepartureStatus,
  DirectoryProfileStatus,
  PaymentScheduleDirection,
  VerificationStatus as PrismaVerificationStatus,
  type PaymentSchedule,
  type Prisma,
  type SegmentResource,
} from '@prisma/client'
import {
  deriveScheduleState,
  isFinanceTouched,
  PaymentScheduleSourceType,
  PaymentScheduleStatus,
  SegmentPayableStatus,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  formatDateOnly,
  getShanghaiTodayString,
} from '../departure/departure-date.utils'

type TxClient = Prisma.TransactionClient

/**
 * Segment Resource finance state owned by Finance (ADR-0004 / #49).
 * Paid/unpaid use effective verification allocation only — never unallocated outflows.
 */
export interface SegmentResourceFinanceState {
  hasSchedule: boolean
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
export interface SourceOrderPathFinanceState {
  pathType:
    | typeof PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT
    | typeof PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION
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
  partnerCollectedCents: number
  guestCollectCents: number
}

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

  async listPartnerOptions(organizationId: string) {
    return this.prisma.partner.findMany({
      where: { organizationId, status: DirectoryProfileStatus.active },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async listSupplierOptions(organizationId: string) {
    return this.prisma.supplier.findMany({
      where: { organizationId, status: DirectoryProfileStatus.active },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async listSourceOrderOptions(organizationId: string, departureId: string) {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
      select: { id: true },
    })
    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

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
        partnerCollectedCents: true,
        guestCollectCents: true,
        discountCents: true,
      },
    })
    if (!order) {
      throw new BadRequestException('关联客源单不存在，无法调整约定金额')
    }

    let partnerCollectedCents = order.partnerCollectedCents
    let guestCollectCents = order.guestCollectCents

    if (params.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT) {
      partnerCollectedCents = params.amountCents
    } else if (params.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION) {
      guestCollectCents = params.amountCents
    } else {
      throw new BadRequestException('仅客源应收路径可调整约定金额')
    }

    const netReceivableCents = partnerCollectedCents + guestCollectCents

    await tx.sourceOrder.update({
      where: { id: order.id },
      data: {
        partnerCollectedCents,
        guestCollectCents,
        netReceivableCents,
        // Keep gross − discount = net after path-level agreed-amount correction.
        grossReceivableCents: netReceivableCents + order.discountCents,
      },
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

  /**
   * Source Order receivable-path finance states (ADR-0004 / #97).
   * Returns one entry per present business path (partnerCollected > 0 / guestCollect > 0).
   * Operations Sheet consumes this — it must not re-derive verification rules.
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
          in: [
            PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
            PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          ],
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
      const amounts = amountMap.get(sourceOrderId) ?? {
        partnerCollectedCents: 0,
        guestCollectCents: 0,
      }
      const paths: SourceOrderPathFinanceState[] = []

      if (amounts.partnerCollectedCents > 0) {
        const key = `${sourceOrderId}::${PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT}`
        const schedule = scheduleByKey.get(key) ?? null
        paths.push(
          this.toPathFinanceState(
            PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
            amounts.partnerCollectedCents,
            schedule,
            schedule ? (settledMap.get(schedule.id) ?? 0) : 0,
            schedule ? (historyMap.get(schedule.id) ?? false) : false,
          ),
        )
      }

      if (amounts.guestCollectCents > 0) {
        const key = `${sourceOrderId}::${PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION}`
        const schedule = scheduleByKey.get(key) ?? null
        paths.push(
          this.toPathFinanceState(
            PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
            amounts.guestCollectCents,
            schedule,
            schedule ? (settledMap.get(schedule.id) ?? 0) : 0,
            schedule ? (historyMap.get(schedule.id) ?? false) : false,
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
      select: { id: true, partnerCollectedCents: true, guestCollectCents: true },
    })
    return new Map(
      rows.map((row) => [
        row.id,
        {
          partnerCollectedCents: row.partnerCollectedCents,
          guestCollectCents: row.guestCollectCents,
        },
      ]),
    )
  }

  private toPathFinanceState(
    pathType:
      | typeof PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT
      | typeof PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
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
