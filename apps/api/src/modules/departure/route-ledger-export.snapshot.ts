import type { RouteLedgerDepartureGroup, RouteLedgerResult } from '@xiaotuanbao/shared'
import { formatRouteLedgerReportTitle } from './route-ledger-export-title'
import {
  buildRouteLedgerExportFilename,
  buildRouteLedgerSheetName,
} from './route-ledger-export.naming'
import type {
  RouteLedgerExportCostRow,
  RouteLedgerExportOutsourceRow,
  RouteLedgerExportSheet,
  RouteLedgerExportSnapshot,
} from './route-ledger-export.types'

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
  routeName?: string
  startDateFrom?: string
  startDateTo?: string
  exportedAt: string
  exportedByName: string
}): RouteLedgerExportSnapshot {
  const sheets: RouteLedgerExportSheet[] = listRouteLedgerDeparturesInOrder(input.ledger).map(
    ({ startDate, routeName, departure }) => {
      const sourceOrders = departure.sourceOrders.map((order, index) => ({
        seq: index + 1,
        partnerName: order.partnerName,
        guestRepresentativeName: order.guestRepresentativeName ?? '',
        guestRepresentativePhone: order.guestRepresentativePhone ?? '',
        adultGuestCount: order.adultGuestCount,
        childGuestCount: order.childGuestCount,
        adultUnitPriceCents: order.adultUnitPriceCents,
        childUnitPriceCents: order.childUnitPriceCents,
        grossReceivableCents: order.grossReceivableCents,
        guestCollectCents: order.guestCollectCents,
        partnerCollectedCents: order.partnerCollectedCents,
        netReceivableCents: order.netReceivableCents,
        notes: order.notes ?? '',
      }))

      const totals = departure.totals
      const costRows: RouteLedgerExportCostRow[] = departure.costResources.map((row) => ({
        seq: row.seq,
        segmentLabel: row.segmentLabel,
        resourceKindLabel: row.resourceKindLabel,
        title: row.title,
        supplierName: row.supplierName,
        amountCents: row.amountCents,
        notes: row.notes,
      }))

      const outsourceRows: RouteLedgerExportOutsourceRow[] = departure.outsource.items.map(
        (item, index) => ({
          seq: index + 1,
          supplierName: item.supplierName,
          title: item.title,
          amountCents: item.amountCents,
          notes: null,
        }),
      )

      return {
        sheetName: buildRouteLedgerSheetName(startDate, departure.departureNo),
        title: formatRouteLedgerReportTitle(startDate, routeName, departure.departureNo),
        sourceOrders,
        sourceOrderTotals: {
          orderCount: totals.orderCount,
          adultGuestCount: departure.sourceOrders.reduce((s, o) => s + o.adultGuestCount, 0),
          childGuestCount: departure.sourceOrders.reduce((s, o) => s + o.childGuestCount, 0),
          grossReceivableCents: totals.grossReceivableCents,
          guestCollectCents: totals.guestCollectCents,
          partnerCollectedCents: totals.partnerCollectedCents,
          netReceivableCents: totals.netReceivableCents,
        },
        costRows,
        outsourceRows,
        outsourceTotalAmountCents: departure.outsource.totalAmountCents,
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
