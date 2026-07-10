import {
  CounterpartyType,
  DepartureStatus,
  PaymentScheduleDirection,
  PrismaClient,
  TransactionDirection,
  VerificationStatus,
} from '@prisma/client'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'

export type FinanceIntegritySeverity = 'P0' | 'P1'

export interface FinanceIntegrityRefs {
  organizationId?: string
  departureNo?: string
  scheduleNo?: string
  transactionNo?: string
  verificationNo?: string
  sourceId?: string
}

export interface FinanceIntegrityViolation {
  code: string
  severity: FinanceIntegritySeverity
  message: string
  refs: FinanceIntegrityRefs
}

function counterpartyMatches(
  left: {
    counterpartyType: CounterpartyType
    counterpartyId: string | null
    counterpartyName: string | null
  },
  right: {
    counterpartyType: CounterpartyType
    counterpartyId: string | null
    counterpartyName: string | null
  },
): boolean {
  if (left.counterpartyType !== right.counterpartyType) {
    return false
  }
  const leftId = left.counterpartyId?.trim() || null
  const rightId = right.counterpartyId?.trim() || null
  if (leftId || rightId) {
    return leftId === rightId
  }
  return (left.counterpartyName?.trim() || '') === (right.counterpartyName?.trim() || '')
}

function expectedTransactionDirection(direction: PaymentScheduleDirection): TransactionDirection {
  return direction === PaymentScheduleDirection.receivable
    ? TransactionDirection.inflow
    : TransactionDirection.outflow
}

export async function collectFinanceIntegrityViolations(
  prisma: PrismaClient,
): Promise<FinanceIntegrityViolation[]> {
  const [
    schedules,
    transactions,
    verifications,
    activities,
    departures,
    sourceOrders,
    segmentResources,
    partners,
    suppliers,
  ] = await Promise.all([
    prisma.paymentSchedule.findMany({
      select: {
        id: true,
        organizationId: true,
        departureId: true,
        direction: true,
        scheduleNo: true,
        amountCents: true,
        counterpartyType: true,
        counterpartyId: true,
        counterpartyName: true,
        sourceType: true,
        sourceId: true,
        cancelledAt: true,
      },
    }),
    prisma.financeTransaction.findMany({
      select: {
        id: true,
        organizationId: true,
        transactionNo: true,
        direction: true,
        amountCents: true,
        counterpartyType: true,
        counterpartyId: true,
        counterpartyName: true,
        departureId: true,
        voidedAt: true,
      },
    }),
    prisma.financeVerification.findMany({
      select: {
        id: true,
        organizationId: true,
        verificationNo: true,
        paymentScheduleId: true,
        transactionId: true,
        amountCents: true,
        status: true,
        cancelledAt: true,
        cancelledBy: true,
        cancelReason: true,
      },
    }),
    prisma.paymentScheduleActivity.findMany({
      select: {
        id: true,
        organizationId: true,
        paymentScheduleId: true,
      },
    }),
    prisma.departure.findMany({
      select: { id: true, organizationId: true, departureNo: true, status: true },
    }),
    prisma.sourceOrder.findMany({
      select: {
        id: true,
        departureId: true,
        departure: { select: { organizationId: true } },
      },
    }),
    prisma.segmentResource.findMany({
      select: {
        id: true,
        segment: {
          select: {
            departureId: true,
            departure: { select: { organizationId: true } },
          },
        },
      },
    }),
    prisma.partner.findMany({ select: { id: true, organizationId: true } }),
    prisma.supplier.findMany({ select: { id: true, organizationId: true } }),
  ])

  const violations: FinanceIntegrityViolation[] = []
  const add = (
    code: string,
    severity: FinanceIntegritySeverity,
    message: string,
    refs: FinanceIntegrityRefs,
  ) => violations.push({ code, severity, message, refs })

  const scheduleById = new Map(schedules.map((item) => [item.id, item]))
  const transactionById = new Map(transactions.map((item) => [item.id, item]))
  const departureById = new Map(departures.map((item) => [item.id, item]))
  const sourceOrderById = new Map(sourceOrders.map((item) => [item.id, item]))
  const resourceById = new Map(segmentResources.map((item) => [item.id, item]))
  const partnerById = new Map(partners.map((item) => [item.id, item]))
  const supplierById = new Map(suppliers.map((item) => [item.id, item]))
  const scheduleAllocated = new Map<string, number>()
  const transactionAllocated = new Map<string, number>()

  for (const verification of verifications) {
    const schedule = scheduleById.get(verification.paymentScheduleId)
    const transaction = transactionById.get(verification.transactionId)
    const refs: FinanceIntegrityRefs = {
      organizationId: verification.organizationId,
      verificationNo: verification.verificationNo,
      scheduleNo: schedule?.scheduleNo,
      transactionNo: transaction?.transactionNo,
      departureNo: schedule
        ? departureById.get(schedule.departureId)?.departureNo
        : undefined,
    }

    if (!schedule || !transaction) {
      add('VERIFICATION_BROKEN_REFERENCE', 'P0', '核销缺少节点或流水引用', refs)
      continue
    }
    if (
      verification.organizationId !== schedule.organizationId ||
      verification.organizationId !== transaction.organizationId
    ) {
      add('VERIFICATION_CROSS_ORGANIZATION', 'P0', '核销、节点与流水跨 Organization', refs)
    }
    if (verification.amountCents <= 0) {
      add('VERIFICATION_NON_POSITIVE_AMOUNT', 'P0', '核销金额不是正整数金额', refs)
    }
    if (verification.status === VerificationStatus.cancelled) {
      if (!verification.cancelledAt || !verification.cancelledBy || !verification.cancelReason?.trim()) {
        add('CANCELLED_VERIFICATION_AUDIT_INCOMPLETE', 'P1', '已撤销核销缺少审计字段', refs)
      }
      continue
    }

    scheduleAllocated.set(
      schedule.id,
      (scheduleAllocated.get(schedule.id) ?? 0) + verification.amountCents,
    )
    transactionAllocated.set(
      transaction.id,
      (transactionAllocated.get(transaction.id) ?? 0) + verification.amountCents,
    )

    if (transaction.voidedAt) {
      add('VOIDED_TRANSACTION_WITH_ACTIVE_VERIFICATION', 'P0', '已作废流水仍有有效核销', refs)
    }
    if (transaction.direction !== expectedTransactionDirection(schedule.direction)) {
      add('VERIFICATION_DIRECTION_MISMATCH', 'P0', '核销两侧收支方向不一致', refs)
    }
    if (!counterpartyMatches(schedule, transaction)) {
      add('VERIFICATION_COUNTERPARTY_MISMATCH', 'P0', '核销两侧往来对象不一致', refs)
    }
  }

  const validateCounterpartyReference = (
    item: {
      organizationId: string
      counterpartyType: CounterpartyType
      counterpartyId: string | null
    },
    refs: FinanceIntegrityRefs,
  ) => {
    if (item.counterpartyType === CounterpartyType.partner) {
      const partner = item.counterpartyId ? partnerById.get(item.counterpartyId) : undefined
      if (!partner || partner.organizationId !== item.organizationId) {
        add('COUNTERPARTY_REFERENCE_BROKEN', 'P0', 'Partner 往来对象缺失或跨 Organization', refs)
      }
    } else if (item.counterpartyType === CounterpartyType.supplier) {
      const supplier = item.counterpartyId ? supplierById.get(item.counterpartyId) : undefined
      if (!supplier || supplier.organizationId !== item.organizationId) {
        add('COUNTERPARTY_REFERENCE_BROKEN', 'P0', 'Supplier 往来对象缺失或跨 Organization', refs)
      }
    } else if (item.counterpartyId) {
      add('COUNTERPARTY_REFERENCE_BROKEN', 'P0', 'Guest/Manual 往来对象不应保存目录 ID', refs)
    }
  }

  for (const schedule of schedules) {
    const departure = departureById.get(schedule.departureId)
    const allocated = scheduleAllocated.get(schedule.id) ?? 0
    const remaining = schedule.amountCents - allocated
    const refs: FinanceIntegrityRefs = {
      organizationId: schedule.organizationId,
      departureNo: departure?.departureNo,
      scheduleNo: schedule.scheduleNo,
      sourceId: schedule.sourceId ?? undefined,
    }

    if (!departure || departure.organizationId !== schedule.organizationId) {
      add('SCHEDULE_CROSS_ORGANIZATION', 'P0', '收付款节点与发团跨 Organization 或发团缺失', refs)
    }
    if (schedule.amountCents <= 0) {
      add('SCHEDULE_NON_POSITIVE_AMOUNT', 'P0', '收付款节点约定金额不是正整数金额', refs)
    }
    if (allocated > schedule.amountCents) {
      add('SCHEDULE_OVERALLOCATED', 'P0', `节点有效核销 ${allocated} 超过约定金额 ${schedule.amountCents}`, refs)
    }
    if (remaining < 0) {
      add('SCHEDULE_NEGATIVE_REMAINING', 'P0', `节点未结清金额为 ${remaining}`, refs)
    }
    validateCounterpartyReference(schedule, refs)

    if (schedule.sourceType === 'manual') {
      if (schedule.sourceId) {
        add('MANUAL_SCHEDULE_HAS_SOURCE', 'P1', '手工节点不应保存业务来源 ID', refs)
      }
    } else if (
      schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT ||
      schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION
    ) {
      const sourceOrder = schedule.sourceId
        ? sourceOrderById.get(schedule.sourceId)
        : undefined
      if (
        !sourceOrder ||
        sourceOrder.departureId !== schedule.departureId ||
        sourceOrder.departure.organizationId !== schedule.organizationId
      ) {
        add('SCHEDULE_SOURCE_BROKEN', 'P0', '应收节点的 Source Order 来源缺失、串团或跨 Organization', refs)
      }
    } else if (schedule.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE) {
      const resource = schedule.sourceId ? resourceById.get(schedule.sourceId) : undefined
      if (
        !resource ||
        resource.segment.departureId !== schedule.departureId ||
        resource.segment.departure.organizationId !== schedule.organizationId
      ) {
        add('SCHEDULE_SOURCE_BROKEN', 'P0', '应付节点的 Segment Resource 来源缺失、串团或跨 Organization', refs)
      }
    } else {
      add('UNKNOWN_SCHEDULE_SOURCE_TYPE', 'P1', '收付款节点来源类型不在领域目录中', refs)
    }
  }

  for (const transaction of transactions) {
    const departure = transaction.departureId
      ? departureById.get(transaction.departureId)
      : undefined
    const allocated = transactionAllocated.get(transaction.id) ?? 0
    const remaining = transaction.amountCents - allocated
    const refs: FinanceIntegrityRefs = {
      organizationId: transaction.organizationId,
      departureNo: departure?.departureNo,
      transactionNo: transaction.transactionNo,
    }

    if (
      transaction.departureId &&
      (!departure || departure.organizationId !== transaction.organizationId)
    ) {
      add('TRANSACTION_CROSS_ORGANIZATION', 'P0', '流水与发团跨 Organization 或发团缺失', refs)
    }
    if (transaction.amountCents <= 0) {
      add('TRANSACTION_NON_POSITIVE_AMOUNT', 'P0', '流水金额不是正整数金额', refs)
    }
    if (allocated > transaction.amountCents) {
      add('TRANSACTION_OVERALLOCATED', 'P0', `流水有效核销 ${allocated} 超过流水金额 ${transaction.amountCents}`, refs)
    }
    if (remaining < 0) {
      add('TRANSACTION_NEGATIVE_REMAINING', 'P0', `流水未核销金额为 ${remaining}`, refs)
    }
    validateCounterpartyReference(transaction, refs)
  }

  for (const activity of activities) {
    const schedule = scheduleById.get(activity.paymentScheduleId)
    if (!schedule || schedule.organizationId !== activity.organizationId) {
      add('ACTIVITY_CROSS_ORGANIZATION', 'P1', '节点 Activity 缺少节点或跨 Organization', {
        organizationId: activity.organizationId,
        scheduleNo: schedule?.scheduleNo,
      })
    }
  }

  for (const departure of departures) {
    if (departure.status !== DepartureStatus.settled) {
      continue
    }
    const departureSchedules = schedules.filter((item) => item.departureId === departure.id)
    if (departureSchedules.length === 0) {
      add('SETTLED_DEPARTURE_WITHOUT_SCHEDULE', 'P1', '已结清发团没有任何收付款节点', {
        organizationId: departure.organizationId,
        departureNo: departure.departureNo,
      })
      continue
    }
    for (const schedule of departureSchedules) {
      const allocated = scheduleAllocated.get(schedule.id) ?? 0
      if (!schedule.cancelledAt && allocated < schedule.amountCents) {
        add('SETTLED_DEPARTURE_WITH_OPEN_SCHEDULE', 'P1', '已结清发团仍有开放未结清节点', {
          organizationId: departure.organizationId,
          departureNo: departure.departureNo,
          scheduleNo: schedule.scheduleNo,
        })
      }
    }
  }

  const detectDuplicates = <T>(
    items: T[],
    keyOf: (item: T) => string | null,
    violationOf: (items: T[]) => FinanceIntegrityViolation,
  ) => {
    const groups = new Map<string, T[]>()
    for (const item of items) {
      const key = keyOf(item)
      if (!key) continue
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    for (const group of groups.values()) {
      if (group.length > 1) violations.push(violationOf(group))
    }
  }

  detectDuplicates(
    schedules,
    (item) => `${item.organizationId}|${item.scheduleNo}`,
    (items) => ({
      code: 'DUPLICATE_SCHEDULE_NO',
      severity: 'P0',
      message: `节点业务编号重复 ${items.length} 次`,
      refs: { organizationId: items[0].organizationId, scheduleNo: items[0].scheduleNo },
    }),
  )
  detectDuplicates(
    transactions,
    (item) => `${item.organizationId}|${item.transactionNo}`,
    (items) => ({
      code: 'DUPLICATE_TRANSACTION_NO',
      severity: 'P0',
      message: `流水业务编号重复 ${items.length} 次`,
      refs: { organizationId: items[0].organizationId, transactionNo: items[0].transactionNo },
    }),
  )
  detectDuplicates(
    verifications,
    (item) => `${item.organizationId}|${item.verificationNo}`,
    (items) => ({
      code: 'DUPLICATE_VERIFICATION_NO',
      severity: 'P0',
      message: `核销业务编号重复 ${items.length} 次`,
      refs: { organizationId: items[0].organizationId, verificationNo: items[0].verificationNo },
    }),
  )
  detectDuplicates(
    schedules,
    (item) =>
      item.sourceId
        ? `${item.organizationId}|${item.direction}|${item.sourceType}|${item.sourceId}`
        : null,
    (items) => ({
      code: 'DUPLICATE_SCHEDULE_SOURCE',
      severity: 'P0',
      message: `同一业务来源重复生成 ${items.length} 条节点`,
      refs: {
        organizationId: items[0].organizationId,
        scheduleNo: items.map((item) => item.scheduleNo).join(','),
        sourceId: items[0].sourceId ?? undefined,
      },
    }),
  )

  return violations.sort((left, right) => {
    const leftKey = `${left.severity}|${left.code}|${JSON.stringify(left.refs)}`
    const rightKey = `${right.severity}|${right.code}|${JSON.stringify(right.refs)}`
    return leftKey.localeCompare(rightKey)
  })
}

export function formatFinanceIntegrityReport(
  violations: FinanceIntegrityViolation[],
): string {
  if (violations.length === 0) {
    return '✅ finance-integrity-check: 0 violations'
  }

  const lines = violations.map((item) => {
    const refs = Object.entries(item.refs)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ')
    return `[${item.severity}] ${item.code} | ${refs} | ${item.message}`
  })
  const p0 = violations.filter((item) => item.severity === 'P0').length
  const p1 = violations.length - p0
  return [`❌ finance-integrity-check: ${violations.length} violations (P0=${p0}, P1=${p1})`, ...lines].join('\n')
}

async function main(): Promise<number> {
  const prisma = new PrismaClient()
  try {
    const violations = await collectFinanceIntegrityViolations(prisma)
    console.log(formatFinanceIntegrityReport(violations))
    return violations.length === 0 ? 0 : 1
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  void main().then((exitCode) => {
    process.exitCode = exitCode
  })
}
