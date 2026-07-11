import { Injectable, NotFoundException } from '@nestjs/common'
import type { DepartureOperationsSheetSnapshot } from '@xiaotuanbao/shared'
import {
  DepartureOperationsSheetDataStage,
  RESOURCE_KIND_LABELS,
  ResourceKind,
  compareSegmentResourcesForOperationsSheet,
} from '@xiaotuanbao/shared'
import type { ResourceKind as PrismaResourceKind } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { deriveDepartureProgress, formatDateOnly } from './departure-date.utils'

@Injectable()
export class DepartureOperationsSheetService {
  constructor(private readonly prisma: PrismaService) {}

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

    // #95 ships the finance-not-started preview only. dataStage + progress amounts
    // for partial/active finance are filled by #96/#97.
    const dataStage = DepartureOperationsSheetDataStage.NOT_STARTED

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
          // #95: finance progress not wired; null renders as `—`
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
            return {
              id: resource.id,
              resourceKind: resource.resourceKind,
              resourceKindLabel: resourceKindLabel(resource.resourceKind),
              counterpartyName,
              title: resource.title,
              agreedPayableCents: resource.amountCents,
              // #95: progress fill-in is #96/#97; null → UI `—`
              paidCents: null,
              unpaidCents: null,
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
