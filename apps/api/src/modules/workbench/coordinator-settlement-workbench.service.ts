import { Injectable } from '@nestjs/common'
import type {
  WorkbenchCoordinatorReceivablePendingItem,
  WorkbenchCoordinatorSettlementReadyItem,
  WorkbenchModule,
} from '@xiaotuanbao/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly } from '../departure/departure-date.utils'
import { DepartureSettlementReadinessService } from '../departure/departure-settlement-readiness.service'
import {
  SourceOrderReceivableGapService,
  type PendingReceivableSourceOrderRow,
} from '../departure/source-order-receivable-gap.service'

type SettlementReadyRow = Prisma.DepartureGetPayload<{
  select: { id: true; name: true; endDate: true }
}>

export interface CoordinatorSettlementSnapshot {
  readyRows: SettlementReadyRow[]
  pendingRows: PendingReceivableSourceOrderRow[]
  pendingCountByDepartureId: ReadonlyMap<string, number>
}

@Injectable()
export class CoordinatorSettlementWorkbenchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureSettlementReadinessService: DepartureSettlementReadinessService,
    private readonly sourceOrderReceivableGapService: SourceOrderReceivableGapService,
  ) {}

  async loadSnapshot(organizationId: string): Promise<CoordinatorSettlementSnapshot> {
    const [readyIds, pendingRows] = await Promise.all([
      this.departureSettlementReadinessService.findReadyDepartureIds(organizationId),
      this.sourceOrderReceivableGapService.findPendingRows(organizationId),
    ])
    const readyRows = await this.prisma.departure.findMany({
      where: { organizationId, id: { in: readyIds } },
      select: { id: true, name: true, endDate: true },
      orderBy: [{ endDate: 'asc' }, { name: 'asc' }],
    })
    const pendingCountByDepartureId = new Map<string, number>()
    for (const row of pendingRows) {
      pendingCountByDepartureId.set(
        row.departureId,
        (pendingCountByDepartureId.get(row.departureId) ?? 0) + 1,
      )
    }

    return { readyRows, pendingRows, pendingCountByDepartureId }
  }

  buildModule(snapshot: CoordinatorSettlementSnapshot): WorkbenchModule {
    const readyItems: WorkbenchCoordinatorSettlementReadyItem[] = snapshot.readyRows
      .slice(0, 5)
      .map((row) => ({
        kind: 'coordinator-settlement-ready',
        id: row.id,
        title: row.name,
        href: `/departure/${row.id}`,
        endDate: formatDateOnly(row.endDate),
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
      title: '结算衔接',
      metrics: [
        {
          key: 'pending-receivables',
          label: '待生成应收',
          value: snapshot.pendingRows.length,
          suffix: '个客源单',
          href: '/source-orders?receivableGeneration=not_generated',
        },
      ],
      items: [...readyItems, ...pendingItems],
    }
  }
}
