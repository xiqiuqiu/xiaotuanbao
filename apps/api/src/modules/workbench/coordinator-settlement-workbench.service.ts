import { Injectable } from '@nestjs/common'
import type {
  PendingPayableSegmentResourceItem,
  WorkbenchCoordinatorPayablePendingItem,
  WorkbenchCoordinatorReceivablePendingItem,
  WorkbenchModule,
} from '@xiaotuanbao/shared'
import { SegmentResourcePayableGapService } from '../departure/segment-resource-payable-gap.service'
import {
  SourceOrderReceivableGapService,
  type PendingReceivableSourceOrderRow,
} from '../departure/source-order-receivable-gap.service'

type PendingPayableItem = PendingPayableSegmentResourceItem & {
  segmentName: string
  resourceKind: string
}

export interface CoordinatorSettlementSnapshot {
  payableRows: PendingPayableItem[]
  pendingRows: PendingReceivableSourceOrderRow[]
  pendingCountByDepartureId: ReadonlyMap<string, number>
}

@Injectable()
export class CoordinatorSettlementWorkbenchService {
  constructor(
    private readonly segmentResourcePayableGapService: SegmentResourcePayableGapService,
    private readonly sourceOrderReceivableGapService: SourceOrderReceivableGapService,
  ) {}

  async loadSnapshot(organizationId: string): Promise<CoordinatorSettlementSnapshot> {
    const [payableRows, pendingRows] = await Promise.all([
      this.segmentResourcePayableGapService.findPendingRows(organizationId),
      this.sourceOrderReceivableGapService.findPendingRows(organizationId),
    ])
    const pendingCountByDepartureId = new Map<string, number>()
    for (const row of pendingRows) {
      pendingCountByDepartureId.set(
        row.departureId,
        (pendingCountByDepartureId.get(row.departureId) ?? 0) + 1,
      )
    }

    return { payableRows, pendingRows, pendingCountByDepartureId }
  }

  buildModule(snapshot: CoordinatorSettlementSnapshot): WorkbenchModule {
    const payableItems: WorkbenchCoordinatorPayablePendingItem[] = snapshot.payableRows
      .slice(0, 5)
      .map((row) => ({
        kind: 'coordinator-payable-pending',
        id: row.id,
        title: row.title,
        href: row.href,
        departureName: row.departureName,
        segmentName: row.segmentName,
        resourceKind: row.resourceKind,
      }))
    const pendingItems: WorkbenchCoordinatorReceivablePendingItem[] = snapshot.pendingRows
      .slice(0, 5)
      .map((row) => ({
        kind: 'coordinator-receivable-pending',
        id: row.id,
        title: row.displayName,
        href: `/departure/${row.departure.id}?tab=sourceOrders`,
        departureName: row.departure.name,
      }))

    return {
      key: 'coordinator-settlement',
      title: '待提交账款',
      metrics: [
        {
          key: 'pending-receivables',
          label: '待提交应收',
          value: snapshot.pendingRows.length,
          suffix: '个客源单',
          href: '/source-orders?receivableGeneration=not_generated',
        },
      ],
      items: [...payableItems, ...pendingItems],
    }
  }
}
