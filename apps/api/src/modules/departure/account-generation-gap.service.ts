import { Injectable } from '@nestjs/common'
import { DepartureStatus } from '@prisma/client'
import type {
  AccountGenerationGapItem,
  AccountGenerationGapListResult,
} from '@xiaotuanbao/shared'
import {
  SourceOrderReceivableGapService,
  type PendingReceivableSourceOrderRow,
} from './source-order-receivable-gap.service'
import {
  SegmentResourcePayableGapService,
  type PendingPayableSegmentResourceRow,
} from './segment-resource-payable-gap.service'

@Injectable()
export class AccountGenerationGapService {
  constructor(
    private readonly sourceOrderReceivableGapService: SourceOrderReceivableGapService,
    private readonly segmentResourcePayableGapService: SegmentResourcePayableGapService,
  ) {}

  async findPendingItems(organizationId: string): Promise<AccountGenerationGapItem[]> {
    const [receivableRows, payableRows] = await Promise.all([
      this.sourceOrderReceivableGapService.findPendingRows(organizationId),
      this.segmentResourcePayableGapService.findPendingRows(organizationId),
    ])

    const items = [
      ...receivableRows.map(toReceivableItem),
      ...payableRows.map(toPayableItem),
    ]
    items.sort(compareGenerationItems)
    return items
  }

  async listPending(
    organizationId: string,
    pageInput?: number,
    pageSizeInput?: number,
    generationKind?: AccountGenerationGapItem['generationKind'],
  ): Promise<AccountGenerationGapListResult> {
    const page = Math.max(Number(pageInput) || 1, 1)
    const pageSize = Math.min(Math.max(Number(pageSizeInput) || 10, 1), 100)
    const items = (await this.findPendingItems(organizationId)).filter(
      (item) => !generationKind || item.generationKind === generationKind,
    )
    const start = (page - 1) * pageSize

    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
    }
  }

  /** 发团列表工作台下钻：有待生成账款缺口的发团 id（可按应收/应付收窄）。 */
  async findDepartureIdsWithGaps(
    organizationId: string,
    generationKind?: AccountGenerationGapItem['generationKind'] | 'any',
  ): Promise<string[]> {
    const kind = generationKind === 'any' ? undefined : generationKind
    const items = (await this.findPendingItems(organizationId)).filter(
      (item) => !kind || item.generationKind === kind,
    )
    return [...new Set(items.map((item) => item.departureId))]
  }
}

function toReceivableItem(row: PendingReceivableSourceOrderRow): AccountGenerationGapItem {
  return {
    id: `receivable:${row.id}`,
    generationKind: 'receivable',
    title: row.displayName,
    estimatedAmountCents: row.netReceivableCents,
    departureId: row.departure.id,
    departureNo: row.departure.departureNo,
    departureName: row.departure.name,
    departureClosed: row.departure.status === DepartureStatus.closed,
    href: `/departure/${row.departure.id}?tab=sourceOrders`,
  }
}

function toPayableItem(row: PendingPayableSegmentResourceRow): AccountGenerationGapItem {
  const departure = row.segment.departure
  return {
    id: `payable:${row.id}`,
    generationKind: 'payable',
    title: row.title,
    estimatedAmountCents: row.amountCents,
    departureId: departure.id,
    departureNo: departure.departureNo,
    departureName: departure.name,
    departureClosed: departure.status === DepartureStatus.closed,
    href: `/departure/${departure.id}?tab=execution&highlightSegmentResourceId=${encodeURIComponent(row.id)}`,
  }
}

function compareGenerationItems(
  left: AccountGenerationGapItem,
  right: AccountGenerationGapItem,
): number {
  if (left.estimatedAmountCents !== right.estimatedAmountCents) {
    return right.estimatedAmountCents - left.estimatedAmountCents
  }
  if (left.generationKind !== right.generationKind) {
    return left.generationKind.localeCompare(right.generationKind)
  }
  return left.title.localeCompare(right.title)
}
