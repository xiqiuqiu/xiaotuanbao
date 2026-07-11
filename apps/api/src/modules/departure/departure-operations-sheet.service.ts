import { Injectable, NotFoundException } from '@nestjs/common'
import type { DepartureOperationsSheetSnapshot } from '@xiaotuanbao/shared'
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

const RECEIVABLE_PATH_LABELS: Record<string, string> = {
  [PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT]: '客户结算',
  [PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION]: '游客代收',
}

@Injectable()
export class DepartureOperationsSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

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
    const [resourceFinanceStates, sourceOrderPathStates] = await Promise.all([
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
              partnerCollectedCents: order.partnerCollectedCents,
              guestCollectCents: order.guestCollectCents,
            },
          ]),
        ),
      ),
    ])

    const pathStates = [...sourceOrderPathStates.values()].flat()
    const dataStage = deriveDataStage({
      resourceStates: [...resourceFinanceStates.values()],
      pathStates,
    })

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
      sourceOrders: departure.sourceOrders.map((order) => {
        const guest = order.guests[0] ?? null
        const paths = sourceOrderPathStates.get(order.id) ?? []
        return {
          id: order.id,
          partnerName: order.partner.name,
          displayName: order.displayName,
          adultGuestCount: order.adultGuestCount,
          childGuestCount: order.childGuestCount,
          guestCount: order.guestCount,
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
      }),
      segments: departure.itinerarySegments.map((segment) => {
        const resources = segment.resources
          .map((resource) => {
            const counterpartyName =
              resource.partner?.name ?? resource.supplier?.name ?? ''
            const finance =
              resourceFinanceStates.get(resource.id) ??
              ({
                hasSchedule: false,
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
      }),
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
