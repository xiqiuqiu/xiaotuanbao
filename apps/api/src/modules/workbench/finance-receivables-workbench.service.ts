import { Injectable } from '@nestjs/common'
import { DepartureStatus } from '@prisma/client'
import type {
  WorkbenchFinanceReceivableAgingBucket,
  WorkbenchFinanceReceivableItem,
  WorkbenchModule,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly } from '../departure/departure-date.utils'
import { VerificationService } from '../finance/verification.service'
import {
  agingBucketForOverdueDays,
  buildOpenReceivableBaseWhere,
  getReceivableFollowUpDates,
  overdueDays,
  receivableFollowUpHref,
  type ReceivableAgingBucketKey,
} from '../finance/receivable-follow-up'

const AGING_BUCKET_META: readonly {
  key: ReceivableAgingBucketKey
  label: string
}[] = [
  { key: 'aging_1_7', label: '1–7 天' },
  { key: 'aging_8_30', label: '8–30 天' },
  { key: 'aging_over_30', label: '30 天以上' },
]

const FOLLOW_UP_LIMIT = 8

type OpenReceivableRow = {
  id: string
  scheduleNo: string
  title: string
  dueDate: string
  unsettledAmountCents: number
  counterpartyName: string | null
  departureClosed: boolean
  overdueDays: number | null
}

function compareFollowUp(left: OpenReceivableRow, right: OpenReceivableRow): number {
  const leftOverdue = left.overdueDays != null
  const rightOverdue = right.overdueDays != null
  if (leftOverdue !== rightOverdue) {
    return leftOverdue ? -1 : 1
  }
  if (leftOverdue && rightOverdue) {
    if (left.overdueDays !== right.overdueDays) {
      return (right.overdueDays ?? 0) - (left.overdueDays ?? 0)
    }
    if (left.unsettledAmountCents !== right.unsettledAmountCents) {
      return right.unsettledAmountCents - left.unsettledAmountCents
    }
    return left.scheduleNo.localeCompare(right.scheduleNo)
  }
  if (left.dueDate !== right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate)
  }
  if (left.unsettledAmountCents !== right.unsettledAmountCents) {
    return right.unsettledAmountCents - left.unsettledAmountCents
  }
  return left.scheduleNo.localeCompare(right.scheduleNo)
}

function toItem(row: OpenReceivableRow): WorkbenchFinanceReceivableItem {
  return {
    kind: 'finance-receivable',
    id: row.id,
    title: row.title,
    description: row.scheduleNo,
    href: `/finance/receivable?scheduleNo=${encodeURIComponent(row.scheduleNo)}`,
    dueDate: row.dueDate,
    unsettledAmountCents: row.unsettledAmountCents,
    overdueDays: row.overdueDays,
    departureClosed: row.departureClosed,
    counterpartyName: row.counterpartyName,
  }
}

@Injectable()
export class FinanceReceivablesWorkbenchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationService: VerificationService,
  ) {}

  async buildModule(organizationId: string, asOf: Date): Promise<WorkbenchModule> {
    const dates = getReceivableFollowUpDates(asOf)
    const candidates = await this.prisma.paymentSchedule.findMany({
      where: buildOpenReceivableBaseWhere(organizationId),
      select: {
        id: true,
        scheduleNo: true,
        title: true,
        dueDate: true,
        amountCents: true,
        counterpartyName: true,
        departure: { select: { status: true } },
      },
    })

    const settledMap = await this.verificationService.batchGetSettledAmounts(
      candidates.map((row) => row.id),
    )

    const openRows: OpenReceivableRow[] = candidates
      .map((row) => {
        const dueDate = formatDateOnly(row.dueDate)
        const unsettledAmountCents = Math.max(
          row.amountCents - (settledMap.get(row.id) ?? 0),
          0,
        )
        return {
          id: row.id,
          scheduleNo: row.scheduleNo,
          title: row.title,
          dueDate,
          unsettledAmountCents,
          counterpartyName: row.counterpartyName,
          departureClosed: row.departure.status === DepartureStatus.closed,
          overdueDays: overdueDays(dueDate, dates.today),
        }
      })
      .filter((row) => row.unsettledAmountCents > 0)

    const overdueRows = openRows.filter((row) => row.overdueDays != null)
    const dueWithin7Rows = openRows.filter(
      (row) =>
        row.overdueDays == null
        && row.dueDate >= dates.today
        && row.dueDate <= dates.dueWithin7End,
    )

    const overdueAmount = overdueRows.reduce((sum, row) => sum + row.unsettledAmountCents, 0)
    const dueWithin7Amount = dueWithin7Rows.reduce(
      (sum, row) => sum + row.unsettledAmountCents,
      0,
    )

    const followUpQueue = [...overdueRows, ...dueWithin7Rows]
      .sort(compareFollowUp)
      .slice(0, FOLLOW_UP_LIMIT)
      .map(toItem)

    const agingTotals = new Map<ReceivableAgingBucketKey, { count: number; amount: number }>([
      ['aging_1_7', { count: 0, amount: 0 }],
      ['aging_8_30', { count: 0, amount: 0 }],
      ['aging_over_30', { count: 0, amount: 0 }],
    ])
    for (const row of overdueRows) {
      const bucketKey = agingBucketForOverdueDays(row.overdueDays!)
      if (!bucketKey) {
        continue
      }
      const bucket = agingTotals.get(bucketKey)!
      bucket.count += 1
      bucket.amount += row.unsettledAmountCents
    }

    const buckets: WorkbenchFinanceReceivableAgingBucket[] = AGING_BUCKET_META.map(
      ({ key, label }) => {
        const totals = agingTotals.get(key)!
        return {
          key,
          label,
          scheduleCount: totals.count,
          unsettledAmountCents: totals.amount,
          href: receivableFollowUpHref(key),
        }
      },
    )

    return {
      key: 'finance-receivables',
      title: '应收跟进',
      description: '优先跟进逾期应收，并关注未来 7 天到期节点；账龄按未结节点分布。',
      total: overdueRows.length + dueWithin7Rows.length,
      href: receivableFollowUpHref('follow_up'),
      metrics: [
        {
          key: 'overdue-receivables',
          label: '逾期应收',
          value: overdueAmount,
          secondaryValue: overdueRows.length,
          secondarySuffix: '个节点',
          href: receivableFollowUpHref('overdue'),
        },
        {
          key: 'due-within-7-days',
          label: '未来 7 天到期应收',
          value: dueWithin7Amount,
          secondaryValue: dueWithin7Rows.length,
          secondarySuffix: '个节点',
          href: receivableFollowUpHref('due_within_7_days'),
        },
      ],
      items: followUpQueue,
      buckets,
    }
  }
}
