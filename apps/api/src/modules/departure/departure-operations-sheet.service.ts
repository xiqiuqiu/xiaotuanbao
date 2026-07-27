import { Injectable, NotFoundException } from '@nestjs/common'
import type {
  DepartureOperationsSheetAnomaly,
  DepartureOperationsSheetFinanceSummary,
  DepartureOperationsSheetProgressTotals,
  DepartureOperationsSheetResourceRow,
  DepartureOperationsSheetSnapshot,
  DepartureOperationsSheetSourceOrderRow,
} from '@xiaotuanbao/shared'
import {
  DepartureOperationsSheetDataStage,
  PaymentScheduleSourceType,
  RESOURCE_KIND_LABELS,
  ResourceKind,
  SegmentPayableStatus,
  compareSegmentResourcesForOperationsSheet,
} from '@xiaotuanbao/shared'
import type { ResourceKind as PrismaResourceKind } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  DepartureFinanceFacade,
  type SegmentResourceFinanceState,
  type SourceOrderPathFinanceState,
} from '../finance/departure-finance-facade.service'
import { deriveDepartureProgress, formatDateOnly } from './departure-date.utils'
import { DepartureOperationsSheetExcelRenderer } from './departure-operations-sheet-excel.types'
import type { DepartureOperationsSheetExcelFile } from './departure-operations-sheet-excel.types'

const RECEIVABLE_PATH_LABELS: Record<string, string> = {
  [PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT]: '客户结算',
  [PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION]: '定金代收',
  [PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION]: '尾款代收',
}

@Injectable()
export class DepartureOperationsSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
    private readonly excelRenderer: DepartureOperationsSheetExcelRenderer,
  ) {}

  async buildWorkbook(
    organizationId: string,
    departureId: string,
    exportedByUserId: string,
  ): Promise<DepartureOperationsSheetExcelFile> {
    const snapshot = await this.buildSnapshot(organizationId, departureId, exportedByUserId)
    return this.excelRenderer.render(snapshot)
  }

  async buildSnapshot(
    organizationId: string,
    departureId: string,
    exportedByUserId: string,
  ): Promise<DepartureOperationsSheetSnapshot> {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
      include: {
        organization: { select: { name: true } },
        owner: { select: { name: true } },
        sourceOrders: {
          orderBy: { createdAt: 'asc' },
          include: {
            partner: { select: { name: true } },
            guests: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { name: true, phone: true },
            },
          },
        },
        itinerarySegments: {
          orderBy: { sortOrder: 'asc' },
          include: {
            resources: {
              include: {
                partner: { select: { name: true } },
                supplier: { select: { name: true } },
              },
            },
          },
        },
      },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    const exporter = await this.prisma.user.findFirst({
      where: { id: exportedByUserId, organizationId, deletedAt: null },
      select: { name: true },
    })

    const allResources = departure.itinerarySegments.flatMap((segment) => segment.resources)
    const [resourceFinanceStates, sourceOrderPathStates, pendingTransactions] =
      await Promise.all([
        this.departureFinanceFacade.getSegmentResourceFinanceStates(
          organizationId,
          allResources.map((resource) => resource.id),
          new Map(allResources.map((resource) => [resource.id, resource.amountCents])),
        ),
        this.departureFinanceFacade.getSourceOrderPathFinanceStates(
          organizationId,
          departure.sourceOrders.map((order) => order.id),
          new Map(
            departure.sourceOrders.map((order) => [
              order.id,
              {
                collectionMode: order.collectionMode,
                depositCents: order.depositCents,
                balanceCents: order.balanceCents,
                netReceivableCents: order.netReceivableCents,
                partnerCollectedCents: order.partnerCollectedCents,
                guestCollectCents: order.guestCollectCents,
              },
            ]),
          ),
        ),
        this.departureFinanceFacade.getPendingTransactions(organizationId, departureId),
      ])

    const pathStates = [...sourceOrderPathStates.values()].flat()
    const dataStage = deriveDataStage({
      resourceStates: [...resourceFinanceStates.values()],
      pathStates,
    })

    const sourceOrders: DepartureOperationsSheetSourceOrderRow[] = departure.sourceOrders.map(
      (order) => {
        const guest = order.guests[0] ?? null
        const paths = sourceOrderPathStates.get(order.id) ?? []
        return {
          id: order.id,
          partnerName: order.partner.name,
          displayName: order.displayName,
          adultGuestCount: order.adultGuestCount,
          childGuestCount: order.childGuestCount,
          guestCount: order.guestCount,
          fareAdjustmentNetCents: order.fareAdjustmentNetCents,
          agreedReceivableCents: order.netReceivableCents,
          settlementNotes: order.settlementNotes,
          notes: order.notes,
          guestRepresentative: guest
            ? {
                name: guest.name,
                phone: guest.phone,
              }
            : null,
          receivablePaths: paths.map((path) => ({
            pathType: path.pathType,
            pathLabel: RECEIVABLE_PATH_LABELS[path.pathType] ?? path.pathType,
            agreedReceivableCents: path.agreedAmountCents,
            scheduleReceivableCents: path.scheduleAmountCents,
            receivedCents: path.receivedCents,
            unreceivedCents: path.unreceivedCents,
            receivableStatus: path.receivableStatus,
            needsReview: path.needsReview,
            excludeFromProgressTotals: path.hasSourceAmountMismatch,
          })),
        }
      },
    )

    const segments = departure.itinerarySegments.map((segment) => {
      const resources = segment.resources
        .map((resource) => {
          const counterpartyName =
            resource.partner?.name ?? resource.supplier?.name ?? ''
          const finance =
            resourceFinanceStates.get(resource.id) ??
            ({
              hasSchedule: false,
              paymentScheduleId: null,
              financeTouched: false,
              payableStatus: SegmentPayableStatus.NOT_GENERATED,
              hasSourceAmountMismatch: false,
              amountFieldsLocked: false,
              agreedAmountCents: resource.amountCents,
              scheduleAmountCents: null,
              paidCents: null,
              unpaidCents: null,
              needsReview: false,
            } satisfies SegmentResourceFinanceState)

          return {
            id: resource.id,
            resourceKind: resource.resourceKind,
            resourceKindLabel: resourceKindLabel(resource.resourceKind),
            counterpartyName,
            title: resource.title,
            agreedPayableCents: resource.amountCents,
            schedulePayableCents: finance.scheduleAmountCents,
            paidCents: finance.paidCents,
            unpaidCents: finance.unpaidCents,
            payableStatus: finance.payableStatus,
            needsReview: finance.needsReview,
            excludeFromProgressTotals: finance.hasSourceAmountMismatch,
            notes: resource.notes,
          }
        })
        .sort(compareSegmentResourcesForOperationsSheet)

      return {
        id: segment.id,
        sortOrder: segment.sortOrder,
        name: segment.name,
        startDate: segment.startDate ? formatDateOnly(segment.startDate) : null,
        endDate: segment.endDate ? formatDateOnly(segment.endDate) : null,
        dayCount: segment.dayCount,
        destination: segment.destination,
        notes: segment.notes,
        resources,
      }
    })

    const pendingRows = pendingTransactions.map((transaction) => ({
      id: transaction.id,
      direction: transaction.direction,
      transactionDate: formatDateOnly(transaction.transactionDate),
      counterpartyName: transaction.counterpartyName,
      remainingUnverifiedCents: transaction.remainingUnverifiedCents,
      paymentChannel: transaction.paymentChannel,
      notes: transaction.notes,
    }))

    const pendingCollectionCents = pendingRows
      .filter((row) => row.direction === 'inflow')
      .reduce((sum, row) => sum + row.remainingUnverifiedCents, 0)
    const pendingPaymentCents = pendingRows
      .filter((row) => row.direction === 'outflow')
      .reduce((sum, row) => sum + row.remainingUnverifiedCents, 0)

    const financeSummary = buildFinanceSummary(sourceOrders, segments)
    const anomalies = buildAnomalies(sourceOrders, segments)

    return {
      organizationName: departure.organization.name,
      exportedAt: new Date().toISOString(),
      exportedByName: exporter?.name ?? '',
      dataStage,
      departure: {
        id: departure.id,
        departureNo: departure.departureNo,
        name: departure.name,
        routeName: departure.routeName,
        startDate: formatDateOnly(departure.startDate),
        endDate: formatDateOnly(departure.endDate),
        dayCount: departure.dayCount,
        ownerName: departure.owner.name,
        status: departure.status,
        departureProgress: deriveDepartureProgress(departure.startDate, departure.endDate),
        notes: departure.notes,
      },
      sourceOrders,
      segments,
      pendingTransactions: pendingRows,
      pendingSummary:
        pendingRows.length > 0
          ? { pendingCollectionCents, pendingPaymentCents }
          : null,
      financeSummary,
      anomalies,
    }
  }
}

function resourceKindLabel(kind: PrismaResourceKind): string {
  return RESOURCE_KIND_LABELS[kind as ResourceKind] ?? kind
}

function deriveDataStage(input: {
  resourceStates: SegmentResourceFinanceState[]
  pathStates: SourceOrderPathFinanceState[]
}): DepartureOperationsSheetDataStage {
  const trackableCount = input.resourceStates.length + input.pathStates.length
  const generatedCount =
    input.resourceStates.filter((state) => state.hasSchedule).length +
    input.pathStates.filter((state) => state.hasSchedule).length

  if (trackableCount === 0 || generatedCount === 0) {
    return DepartureOperationsSheetDataStage.NOT_STARTED
  }

  if (generatedCount === trackableCount) {
    return DepartureOperationsSheetDataStage.ACTIVE
  }

  return DepartureOperationsSheetDataStage.PARTIAL
}

function buildFinanceSummary(
  sourceOrders: DepartureOperationsSheetSourceOrderRow[],
  segments: Array<{ resources: DepartureOperationsSheetResourceRow[] }>,
): DepartureOperationsSheetFinanceSummary {
  return {
    receivable: sumProgressTotals(
      sourceOrders.flatMap((order) => order.receivablePaths),
      (path) =>
        path.receivableStatus !== 'not_generated' &&
        !path.excludeFromProgressTotals &&
        path.receivedCents != null &&
        path.unreceivedCents != null,
      (path) => ({
        agreedCents: path.scheduleReceivableCents ?? path.agreedReceivableCents,
        settledCents: path.receivedCents ?? 0,
        unsettledCents: path.unreceivedCents ?? 0,
      }),
    ),
    payable: sumProgressTotals(
      segments.flatMap((segment) => segment.resources),
      (resource) =>
        resource.payableStatus !== 'not_generated' &&
        !resource.excludeFromProgressTotals &&
        resource.paidCents != null &&
        resource.unpaidCents != null,
      (resource) => ({
        agreedCents: resource.schedulePayableCents ?? resource.agreedPayableCents,
        settledCents: resource.paidCents ?? 0,
        unsettledCents: resource.unpaidCents ?? 0,
      }),
    ),
  }
}

function sumProgressTotals<T>(
  rows: T[],
  include: (row: T) => boolean,
  pick: (row: T) => { agreedCents: number; settledCents: number; unsettledCents: number },
): DepartureOperationsSheetProgressTotals | null {
  const included = rows.filter(include)
  if (included.length === 0) {
    return null
  }

  return included.reduce<DepartureOperationsSheetProgressTotals>(
    (totals, row) => {
      const values = pick(row)
      return {
        agreedCents: totals.agreedCents + values.agreedCents,
        settledCents: totals.settledCents + values.settledCents,
        unsettledCents: totals.unsettledCents + values.unsettledCents,
        includedRowCount: totals.includedRowCount + 1,
      }
    },
    { agreedCents: 0, settledCents: 0, unsettledCents: 0, includedRowCount: 0 },
  )
}

function buildAnomalies(
  sourceOrders: DepartureOperationsSheetSourceOrderRow[],
  segments: Array<{ resources: DepartureOperationsSheetResourceRow[] }>,
): DepartureOperationsSheetAnomaly[] {
  const anomalies: DepartureOperationsSheetAnomaly[] = []

  for (const order of sourceOrders) {
    for (const path of order.receivablePaths) {
      const subjectLabel = `${order.partnerName} · ${path.pathLabel}`
      pushAnomalyIfNeeded(anomalies, {
        side: 'receivable',
        subjectLabel,
        agreedAmountCents: path.agreedReceivableCents,
        scheduleAmountCents: path.scheduleReceivableCents,
        settledCents: path.receivedCents ?? 0,
        remainingCents: path.unreceivedCents ?? 0,
        isClosedWithBalance:
          path.receivableStatus === 'closed' && (path.unreceivedCents ?? 0) > 0,
        isAmountMismatch: path.excludeFromProgressTotals,
      })
    }
  }

  for (const segment of segments) {
    for (const resource of segment.resources) {
      const subjectLabel = `${resource.resourceKindLabel} · ${resource.title}`
      pushAnomalyIfNeeded(anomalies, {
        side: 'payable',
        subjectLabel,
        agreedAmountCents: resource.agreedPayableCents,
        scheduleAmountCents: resource.schedulePayableCents,
        settledCents: resource.paidCents ?? 0,
        remainingCents: resource.unpaidCents ?? 0,
        isClosedWithBalance:
          resource.payableStatus === 'closed' && (resource.unpaidCents ?? 0) > 0,
        isAmountMismatch: resource.excludeFromProgressTotals,
      })
    }
  }

  return anomalies
}

function pushAnomalyIfNeeded(
  anomalies: DepartureOperationsSheetAnomaly[],
  input: {
    side: 'receivable' | 'payable'
    subjectLabel: string
    agreedAmountCents: number
    scheduleAmountCents: number | null
    settledCents: number
    remainingCents: number
    isClosedWithBalance: boolean
    isAmountMismatch: boolean
  },
): void {
  if (input.isClosedWithBalance) {
    anomalies.push({
      kind: 'closed_with_balance',
      side: input.side,
      subjectLabel: input.subjectLabel,
      agreedAmountCents: input.agreedAmountCents,
      scheduleAmountCents: input.scheduleAmountCents,
      settledCents: input.settledCents,
      remainingCents: input.remainingCents,
    })
  }

  if (input.isAmountMismatch) {
    anomalies.push({
      kind: 'amount_mismatch',
      side: input.side,
      subjectLabel: input.subjectLabel,
      agreedAmountCents: input.agreedAmountCents,
      scheduleAmountCents: input.scheduleAmountCents,
      settledCents: input.settledCents,
      remainingCents: input.remainingCents,
    })
  }
}
