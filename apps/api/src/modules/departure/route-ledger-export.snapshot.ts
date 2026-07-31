import type { RouteLedgerDepartureGroup, RouteLedgerResult } from '@xiaotuanbao/shared'
import { RESOURCE_KIND_LABELS, type ResourceKind } from '@xiaotuanbao/shared'
import { formatRouteLedgerReportTitle } from './route-ledger-export-title'
import {
  buildRouteLedgerExportFilename,
  buildRouteLedgerSheetName,
} from './route-ledger-export.naming'
import type {
  RouteLedgerExportResourceRow,
  RouteLedgerExportSheet,
  RouteLedgerExportSnapshot,
} from './route-ledger-export.types'

export type RouteLedgerExportResourceInput = {
  departureId: string
  segmentName: string
  resourceKind: string
  title: string
  supplierName: string
  amountCents: number
  notes: string | null
  /** Stable order: segment sort then resource sort */
  sortKey: string
}

function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2)
}

function formatUnitPriceYuan(cents: number): string {
  return formatYuan(cents)
}

export function listRouteLedgerDeparturesInOrder(
  ledger: RouteLedgerResult,
): Array<{ startDate: string; routeName: string; departure: RouteLedgerDepartureGroup }> {
  const list: Array<{
    startDate: string
    routeName: string
    departure: RouteLedgerDepartureGroup
  }> = []
  for (const block of ledger.dateBlocks) {
    for (const route of block.routes) {
      for (const departure of route.departures) {
        list.push({
          startDate: block.startDate,
          routeName: route.routeName,
          departure,
        })
      }
    }
  }
  return list
}

export function buildRouteLedgerExportSnapshot(input: {
  ledger: RouteLedgerResult
  resources: RouteLedgerExportResourceInput[]
  routeName?: string
  startDateFrom?: string
  startDateTo?: string
  exportedAt: string
  exportedByName: string
}): RouteLedgerExportSnapshot {
  const resourcesByDeparture = new Map<string, RouteLedgerExportResourceInput[]>()
  for (const resource of input.resources) {
    const bucket = resourcesByDeparture.get(resource.departureId) ?? []
    bucket.push(resource)
    resourcesByDeparture.set(resource.departureId, bucket)
  }

  const sheets: RouteLedgerExportSheet[] = listRouteLedgerDeparturesInOrder(input.ledger).map(
    ({ startDate, routeName, departure }) => {
      const sourceOrders = departure.sourceOrders.map((order, index) => ({
        seq: index + 1,
        partnerName: order.partnerName,
        guestRepresentativeName: order.guestRepresentativeName ?? '',
        guestRepresentativePhone: order.guestRepresentativePhone ?? '',
        adultUnitPriceYuan:
          order.adultGuestCount > 0 ? formatUnitPriceYuan(order.adultUnitPriceCents) : '—',
        childUnitPriceYuan:
          order.childGuestCount > 0 ? formatUnitPriceYuan(order.childUnitPriceCents) : '—',
        adultGuestCount: order.adultGuestCount,
        childGuestCount: order.childGuestCount,
        grossReceivableYuan: formatYuan(order.grossReceivableCents),
        guestCollectYuan: formatYuan(order.guestCollectCents),
        partnerCollectedYuan: formatYuan(order.partnerCollectedCents),
        netReceivableYuan: formatYuan(order.netReceivableCents),
        notes: order.notes ?? '',
      }))

      const totals = departure.totals
      const resourceRows: RouteLedgerExportResourceRow[] = (
        resourcesByDeparture.get(departure.departureId) ?? []
      )
        .slice()
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map((resource) => ({
          segmentName: resource.segmentName,
          resourceKindLabel:
            RESOURCE_KIND_LABELS[resource.resourceKind as ResourceKind] ?? resource.resourceKind,
          title: resource.title,
          supplierName: resource.supplierName,
          amountYuan: formatYuan(resource.amountCents),
          notes: resource.notes,
        }))

      return {
        sheetName: buildRouteLedgerSheetName(startDate, departure.departureNo),
        title: formatRouteLedgerReportTitle(startDate, routeName, departure.departureNo),
        sourceOrders,
        sourceOrderTotals: {
          adultGuestCount: departure.sourceOrders.reduce((s, o) => s + o.adultGuestCount, 0),
          childGuestCount: departure.sourceOrders.reduce((s, o) => s + o.childGuestCount, 0),
          grossReceivableYuan: formatYuan(totals.grossReceivableCents),
          guestCollectYuan: formatYuan(totals.guestCollectCents),
          partnerCollectedYuan: formatYuan(totals.partnerCollectedCents),
          netReceivableYuan: formatYuan(totals.netReceivableCents),
        },
        resources: resourceRows,
      }
    },
  )

  return {
    filename: buildRouteLedgerExportFilename({
      routeName: input.routeName,
      startDateFrom: input.startDateFrom,
      startDateTo: input.startDateTo,
      exportedAt: input.exportedAt,
    }),
    exportedAt: input.exportedAt,
    exportedByName: input.exportedByName,
    sheets,
  }
}
