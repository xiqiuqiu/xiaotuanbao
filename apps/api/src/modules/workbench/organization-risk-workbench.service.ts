import { Injectable } from '@nestjs/common'
import { DepartureStatus, TransactionDirection } from '@prisma/client'
import type {
  WorkbenchModule,
  WorkbenchOrganizationRiskCode,
  WorkbenchOrganizationRiskItem,
  WorkbenchOrganizationRiskSeverity,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AccountGenerationGapService } from '../departure/account-generation-gap.service'
import { DepartureDataGapService } from '../departure/departure-data-gap.service'
import { formatDateOnly, parseDateOnly } from '../departure/departure-date.utils'
import {
  addCalendarDays,
  getDepartureOperationalDates,
} from '../departure/departure-operational-window'
import { buildOpenPayableBaseWhere } from '../finance/payable-open-balance'
import {
  buildPendingSettlementBaseWhere,
  pendingSettlementHref,
  pendingSettlementTransactionHref,
} from '../finance/pending-settlement'
import {
  buildOpenReceivableBaseWhere,
  differenceInCalendarDays,
  getReceivableFollowUpDates,
  overdueDays,
  receivableFollowUpHref,
} from '../finance/receivable-follow-up'
import { VerificationService } from '../finance/verification.service'

const RISK_LIMIT = 5

const RISK_REASON: Record<WorkbenchOrganizationRiskCode, string> = {
  closed_departure_open_finance: '发团已关闭，仍有开放账款或未核销流水',
  receivable_overdue_over_30: '应收逾期超过 30 天',
  departure_data_gap_imminent: '今天或明天出发且资料待补充',
  receivable_overdue_8_30: '应收逾期 8–30 天',
  departure_data_gap_upcoming: '未来 2–7 天出发且资料待补充',
  settlement_stale_over_7: '流水超过 7 天仍未完全核销',
  ended_departure_account_gap: '已结束发团仍有应收或应付尚未生成',
}

type RiskCandidate = WorkbenchOrganizationRiskItem & {
  sortKey: number
}

function severityRank(severity: WorkbenchOrganizationRiskSeverity): number {
  return severity === 'high' ? 0 : 1
}

function compareRisk(left: RiskCandidate, right: RiskCandidate): number {
  const severityDelta = severityRank(left.severity) - severityRank(right.severity)
  if (severityDelta !== 0) {
    return severityDelta
  }
  if (left.sortKey !== right.sortKey) {
    return right.sortKey - left.sortKey
  }
  return left.id.localeCompare(right.id)
}

function toItem(candidate: RiskCandidate): WorkbenchOrganizationRiskItem {
  const {
    sortKey: _sortKey,
    ...item
  } = candidate
  return item
}

@Injectable()
export class OrganizationRiskWorkbenchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationService: VerificationService,
    private readonly departureDataGapService: DepartureDataGapService,
    private readonly accountGenerationGapService: AccountGenerationGapService,
  ) {}

  async buildModule(organizationId: string, asOf: Date): Promise<WorkbenchModule> {
    const operationalDates = getDepartureOperationalDates(asOf)
    const receivableDates = getReceivableFollowUpDates(asOf)

    const [
      receivableCandidates,
      payableCandidates,
      transactionCandidates,
      closedDepartures,
      dataGapsByDepartureId,
      generationItems,
      operationalDepartures,
    ] = await Promise.all([
      this.prisma.paymentSchedule.findMany({
        where: buildOpenReceivableBaseWhere(organizationId),
        select: {
          id: true,
          scheduleNo: true,
          title: true,
          dueDate: true,
          amountCents: true,
          counterpartyName: true,
          departureId: true,
          departure: { select: { id: true, name: true, status: true } },
        },
      }),
      this.prisma.paymentSchedule.findMany({
        where: buildOpenPayableBaseWhere(organizationId),
        select: {
          id: true,
          amountCents: true,
          departureId: true,
          departure: { select: { id: true, name: true, status: true } },
        },
      }),
      this.prisma.financeTransaction.findMany({
        where: buildPendingSettlementBaseWhere(organizationId),
        select: {
          id: true,
          transactionNo: true,
          direction: true,
          transactionDate: true,
          amountCents: true,
          counterpartyName: true,
          departureId: true,
          departure: { select: { id: true, name: true, status: true } },
        },
      }),
      this.prisma.departure.findMany({
        where: {
          organizationId,
          status: DepartureStatus.closed,
        },
        select: { id: true, name: true, departureNo: true },
      }),
      this.departureDataGapService.findByOrganization(organizationId),
      this.accountGenerationGapService.findPendingItems(organizationId),
      this.prisma.departure.findMany({
        where: {
          organizationId,
          status: { not: DepartureStatus.closed },
          startDate: {
            gte: parseDateOnly(operationalDates.today),
            lte: parseDateOnly(operationalDates.nextSevenDaysEnd),
          },
        },
        select: {
          id: true,
          name: true,
          departureNo: true,
          startDate: true,
          endDate: true,
        },
      }),
    ])

    const scheduleIds = [
      ...receivableCandidates.map((row) => row.id),
      ...payableCandidates.map((row) => row.id),
    ]
    const settledMap = await this.verificationService.batchGetSettledAmounts(scheduleIds)
    const allocatedMap = await this.verificationService.batchGetAllocatedAmounts(
      transactionCandidates.map((row) => row.id),
    )

    const openReceivables = receivableCandidates
      .map((row) => {
        const dueDate = formatDateOnly(row.dueDate)
        const unsettledAmountCents = Math.max(
          row.amountCents - (settledMap.get(row.id) ?? 0),
          0,
        )
        return {
          ...row,
          dueDate,
          unsettledAmountCents,
          overdueDays: overdueDays(dueDate, receivableDates.today),
        }
      })
      .filter((row) => row.unsettledAmountCents > 0)

    const openPayables = payableCandidates
      .map((row) => ({
        ...row,
        unpaidAmountCents: Math.max(row.amountCents - (settledMap.get(row.id) ?? 0), 0),
      }))
      .filter((row) => row.unpaidAmountCents > 0)

    const pendingSettlements = transactionCandidates
      .map((row) => {
        const transactionDate = formatDateOnly(row.transactionDate)
        const unallocatedAmountCents = Math.max(
          row.amountCents - (allocatedMap.get(row.id) ?? 0),
          0,
        )
        return {
          ...row,
          transactionDate,
          unallocatedAmountCents,
          unsettledDays: differenceInCalendarDays(operationalDates.today, transactionDate),
          direction:
            row.direction === TransactionDirection.inflow
              ? ('inflow' as const)
              : ('outflow' as const),
        }
      })
      .filter((row) => row.unallocatedAmountCents > 0)

    const overdueReceivables = openReceivables.filter((row) => row.overdueDays != null)
    const overdueAmount = overdueReceivables.reduce(
      (sum, row) => sum + row.unsettledAmountCents,
      0,
    )
    const incomeRows = pendingSettlements.filter((row) => row.direction === 'inflow')
    const expenseRows = pendingSettlements.filter((row) => row.direction === 'outflow')
    const pendingSettlementAmount = pendingSettlements.reduce(
      (sum, row) => sum + row.unallocatedAmountCents,
      0,
    )

    const risks: RiskCandidate[] = []

    const closedDepartureIds = new Set(closedDepartures.map((row) => row.id))
    const openAmountByClosedDeparture = new Map<string, number>()
    for (const row of openReceivables) {
      if (!closedDepartureIds.has(row.departureId)) {
        continue
      }
      openAmountByClosedDeparture.set(
        row.departureId,
        (openAmountByClosedDeparture.get(row.departureId) ?? 0) + row.unsettledAmountCents,
      )
    }
    for (const row of openPayables) {
      if (!closedDepartureIds.has(row.departureId)) {
        continue
      }
      openAmountByClosedDeparture.set(
        row.departureId,
        (openAmountByClosedDeparture.get(row.departureId) ?? 0) + row.unpaidAmountCents,
      )
    }
    for (const row of pendingSettlements) {
      if (!row.departureId || !closedDepartureIds.has(row.departureId)) {
        continue
      }
      openAmountByClosedDeparture.set(
        row.departureId,
        (openAmountByClosedDeparture.get(row.departureId) ?? 0) + row.unallocatedAmountCents,
      )
    }
    for (const departure of closedDepartures) {
      const amountCents = openAmountByClosedDeparture.get(departure.id)
      if (amountCents == null || amountCents <= 0) {
        continue
      }
      risks.push({
        kind: 'organization-risk',
        id: `closed_departure_open_finance:${departure.id}`,
        title: departure.name,
        description: departure.departureNo,
        href: `/departure/${departure.id}`,
        code: 'closed_departure_open_finance',
        severity: 'high',
        reason: RISK_REASON.closed_departure_open_finance,
        amountCents,
        sortKey: amountCents,
      })
    }

    for (const row of openReceivables) {
      if (row.overdueDays == null) {
        continue
      }
      if (row.overdueDays > 30) {
        risks.push({
          kind: 'organization-risk',
          id: `receivable_overdue_over_30:${row.id}`,
          title: row.title,
          description: row.scheduleNo,
          href: `/finance/receivable?scheduleNo=${encodeURIComponent(row.scheduleNo)}`,
          code: 'receivable_overdue_over_30',
          severity: 'high',
          reason: RISK_REASON.receivable_overdue_over_30,
          amountCents: row.unsettledAmountCents,
          overdueDays: row.overdueDays,
          sortKey: row.overdueDays * 1_000_000_000 + row.unsettledAmountCents,
        })
      } else if (row.overdueDays >= 8) {
        risks.push({
          kind: 'organization-risk',
          id: `receivable_overdue_8_30:${row.id}`,
          title: row.title,
          description: row.scheduleNo,
          href: `/finance/receivable?scheduleNo=${encodeURIComponent(row.scheduleNo)}`,
          code: 'receivable_overdue_8_30',
          severity: 'attention',
          reason: RISK_REASON.receivable_overdue_8_30,
          amountCents: row.unsettledAmountCents,
          overdueDays: row.overdueDays,
          sortKey: row.overdueDays * 1_000_000_000 + row.unsettledAmountCents,
        })
      }
    }

    for (const departure of operationalDepartures) {
      const dataGaps = dataGapsByDepartureId.get(departure.id) ?? []
      if (dataGaps.length === 0) {
        continue
      }
      const startDate = formatDateOnly(departure.startDate)
      const daysUntilStart = differenceInCalendarDays(startDate, operationalDates.today)
      if (daysUntilStart < 0 || daysUntilStart > 7) {
        continue
      }
      const imminent = daysUntilStart <= 1
      const code: WorkbenchOrganizationRiskCode = imminent
        ? 'departure_data_gap_imminent'
        : 'departure_data_gap_upcoming'
      const reason = imminent
        ? daysUntilStart === 0
          ? '今天出发且资料待补充'
          : '明天出发且资料待补充'
        : RISK_REASON.departure_data_gap_upcoming
      risks.push({
        kind: 'organization-risk',
        id: `${code}:${departure.id}`,
        title: departure.name,
        description: dataGaps.map((gap) => gap.label).join('、'),
        href: `/departure/${departure.id}`,
        code,
        severity: imminent ? 'high' : 'attention',
        reason,
        daysUntilStart,
        sortKey: (10 - daysUntilStart) * 1_000_000_000 + dataGaps.length,
      })
    }

    for (const row of pendingSettlements) {
      if (row.unsettledDays <= 7) {
        continue
      }
      risks.push({
        kind: 'organization-risk',
        id: `settlement_stale_over_7:${row.id}`,
        title: row.counterpartyName?.trim() || row.transactionNo,
        description: row.transactionNo,
        href: pendingSettlementTransactionHref(row.transactionNo),
        code: 'settlement_stale_over_7',
        severity: 'attention',
        reason: RISK_REASON.settlement_stale_over_7,
        amountCents: row.unallocatedAmountCents,
        unsettledDays: row.unsettledDays,
        sortKey: row.unsettledDays * 1_000_000_000 + row.unallocatedAmountCents,
      })
    }

    const endedDepartureIds = new Set(
      (
        await this.prisma.departure.findMany({
          where: {
            organizationId,
            endDate: { lt: parseDateOnly(operationalDates.today) },
            status: { not: DepartureStatus.closed },
            id: { in: [...new Set(generationItems.map((item) => item.departureId))] },
          },
          select: { id: true },
        })
      ).map((row) => row.id),
    )
    const endedGapAmountByDeparture = new Map<string, {
      name: string
      departureNo: string
      amountCents: number
    }>()
    for (const item of generationItems) {
      if (!endedDepartureIds.has(item.departureId)) {
        continue
      }
      const current = endedGapAmountByDeparture.get(item.departureId)
      if (current) {
        current.amountCents += item.estimatedAmountCents
      } else {
        endedGapAmountByDeparture.set(item.departureId, {
          name: item.departureName,
          departureNo: item.departureNo,
          amountCents: item.estimatedAmountCents,
        })
      }
    }
    for (const [departureId, aggregate] of endedGapAmountByDeparture) {
      risks.push({
        kind: 'organization-risk',
        id: `ended_departure_account_gap:${departureId}`,
        title: aggregate.name,
        description: aggregate.departureNo,
        href: `/departure/${departureId}`,
        code: 'ended_departure_account_gap',
        severity: 'attention',
        reason: RISK_REASON.ended_departure_account_gap,
        amountCents: aggregate.amountCents,
        sortKey: aggregate.amountCents,
      })
    }

    const sorted = [...risks].sort(compareRisk)
    const highRiskCount = sorted.filter((item) => item.severity === 'high').length
    const attentionCount = sorted.length - highRiskCount
    const topItems = sorted.slice(0, RISK_LIMIT).map(toItem)
    const countByCode = (code: WorkbenchOrganizationRiskCode) =>
      sorted.filter((item) => item.code === code).length
    const dataGapCount =
      countByCode('departure_data_gap_imminent') + countByCode('departure_data_gap_upcoming')
    const staleSettlementEnd = addCalendarDays(operationalDates.today, -8)
    const categoryMetrics = [
      {
        key: 'risk-receivable-over-30',
        label: '逾期应收超过 30 天',
        value: countByCode('receivable_overdue_over_30'),
        suffix: '项',
        href: receivableFollowUpHref('aging_over_30'),
      },
      {
        key: 'risk-receivable-8-30',
        label: '应收逾期 8–30 天',
        value: countByCode('receivable_overdue_8_30'),
        suffix: '项',
        href: receivableFollowUpHref('aging_8_30'),
      },
      {
        key: 'risk-departure-data-gap',
        label: '近期发团资料待补充',
        value: dataGapCount,
        suffix: '项',
        href: `/departure?startDateFrom=${operationalDates.today}&startDateTo=${operationalDates.nextSevenDaysEnd}&departureDataGap=any&excludeClosed=1`,
      },
      {
        key: 'risk-settlement-stale',
        label: '流水超过 7 天未核销',
        value: countByCode('settlement_stale_over_7'),
        suffix: '项',
        href: `${pendingSettlementHref()}&dateEnd=${staleSettlementEnd}`,
      },
    ].filter((metric) => (metric.value ?? 0) > 0)

    return {
      key: 'organization-risk',
      title: '经营风险摘要',
      total: sorted.length,
      metrics: [
        {
          key: 'overdue-receivables',
          label: '逾期应收',
          value: overdueAmount,
          secondaryValue: overdueReceivables.length,
          secondarySuffix: '个节点',
          href: receivableFollowUpHref('overdue'),
        },
        {
          key: 'pending-settlement',
          label: '待核销资金',
          value: pendingSettlementAmount,
          secondaryValue: pendingSettlements.length,
          secondarySuffix: `笔（收入 ${incomeRows.length} · 支出 ${expenseRows.length}）`,
          href: pendingSettlementHref(),
        },
        {
          key: 'high-risk',
          label: '高风险',
          value: highRiskCount,
          suffix: '项',
        },
        {
          key: 'attention',
          label: '需关注',
          value: attentionCount,
          suffix: '项',
        },
        ...categoryMetrics,
      ],
      items: topItems,
    }
  }
}
