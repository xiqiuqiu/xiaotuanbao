import { Injectable, NotFoundException } from '@nestjs/common'
import type { DepartureOperationsSheetSnapshot } from '@xiaotuanbao/shared'
import {
  DepartureOperationsSheetDataStage,
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
} from '../finance/departure-finance-facade.service'
import { deriveDepartureProgress, formatDateOnly } from './departure-date.utils'

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
    const financeStates = await this.departureFinanceFacade.getSegmentResourceFinanceStates(
      organizationId,
      allResources.map((resource) => resource.id),
      new Map(allResources.map((resource) => [resource.id, resource.amountCents])),
    )

    // #97 will wire Source Order receivable progress; until then receivables stay `—`.
    const dataStage = deriveDataStage({
      resourceStates: [...financeStates.values()],
      sourceOrderCount: departure.sourceOrders.length,
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
        return {
          id: order.id,
          partnerName: order.partner.name,
          displayName: order.displayName,
          adultGuestCount: order.adultGuestCount,
          childGuestCount: order.childGuestCount,
          guestCount: order.guestCount,
          agreedReceivableCents: order.netReceivableCents,
          // #97: receivable progress not wired; null renders as `—`
          receivedCents: null,
          unreceivedCents: null,
          settlementNotes: order.settlementNotes,
          notes: order.notes,
          guestRepresentative: guest
            ? {
                name: guest.name,
                phone: guest.phone,
              }
            : null,
        }
      }),
      segments: departure.itinerarySegments.map((segment) => {
        const resources = segment.resources
          .map((resource) => {
            const counterpartyName =
              resource.partner?.name ?? resource.supplier?.name ?? ''
            const finance =
              financeStates.get(resource.id) ??
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
  sourceOrderCount: number
}): DepartureOperationsSheetDataStage {
  const resourceCount = input.resourceStates.length
  const generatedResourceCount = input.resourceStates.filter((state) => state.hasSchedule).length

  if (generatedResourceCount === 0) {
    return DepartureOperationsSheetDataStage.NOT_STARTED
  }

  // Source Order receivable progress lands in #97; until then any source order
  // keeps the sheet from reaching fully-active when resources are all generated.
  const allResourcesGenerated = generatedResourceCount === resourceCount
  if (allResourcesGenerated && input.sourceOrderCount === 0) {
    return DepartureOperationsSheetDataStage.ACTIVE
  }

  if (allResourcesGenerated && input.sourceOrderCount > 0) {
    return DepartureOperationsSheetDataStage.PARTIAL
  }

  return DepartureOperationsSheetDataStage.PARTIAL
}
