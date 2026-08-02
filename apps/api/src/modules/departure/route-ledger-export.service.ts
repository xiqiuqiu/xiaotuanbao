import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureService } from './departure.service'
import type { ListRouteLedgerQueryDto } from './dto/departure.dto'
import { renderRouteLedgerExportExcel } from './route-ledger-export-exceljs.renderer'
import {
  buildRouteLedgerExportSnapshot,
  listRouteLedgerDeparturesInOrder,
  type RouteLedgerExportResourceInput,
} from './route-ledger-export.snapshot'
import type { RouteLedgerExportExcelFile } from './route-ledger-export.types'

@Injectable()
export class RouteLedgerExportService {
  constructor(
    private readonly departureService: DepartureService,
    private readonly prisma: PrismaService,
  ) {}

  async buildWorkbook(
    organizationId: string,
    query: ListRouteLedgerQueryDto,
    exportedByUserId: string,
  ): Promise<RouteLedgerExportExcelFile> {
    const ledger = await this.departureService.getRouteLedger(organizationId, query)
    const departureIds = listRouteLedgerDeparturesInOrder(ledger).map((item) => item.departure.departureId)

    const exporter = await this.prisma.user.findFirst({
      where: { id: exportedByUserId, organizationId, deletedAt: null },
      select: { name: true },
    })

    const resources = await this.loadArrangementResources(organizationId, departureIds)
    const exportedAt = new Date().toISOString()
    const snapshot = buildRouteLedgerExportSnapshot({
      ledger,
      resources,
      routeName: ledger.routeName ?? undefined,
      startDateFrom: ledger.startDateFrom ?? undefined,
      startDateTo: ledger.startDateTo ?? undefined,
      exportedAt,
      exportedByName: exporter?.name ?? '',
    })

    return renderRouteLedgerExportExcel(snapshot)
  }

  private async loadArrangementResources(
    organizationId: string,
    departureIds: string[],
  ): Promise<RouteLedgerExportResourceInput[]> {
    if (departureIds.length === 0) {
      return []
    }

    const departures = await this.prisma.departure.findMany({
      where: { organizationId, id: { in: departureIds } },
      select: {
        id: true,
        departureResources: {
          select: {
            id: true,
            resourceKind: true,
            title: true,
            amountCents: true,
            notes: true,
            createdAt: true,
            partner: { select: { name: true } },
            supplier: { select: { name: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        itinerarySegments: {
          select: {
            name: true,
            sortOrder: true,
            resources: {
              select: {
                id: true,
                resourceKind: true,
                title: true,
                amountCents: true,
                notes: true,
                createdAt: true,
                partner: { select: { name: true } },
                supplier: { select: { name: true } },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    const rows: RouteLedgerExportResourceInput[] = []
    for (const departure of departures) {
      for (const segment of departure.itinerarySegments) {
        const segOrder = String(segment.sortOrder).padStart(4, '0')
        for (const resource of segment.resources) {
          rows.push({
            departureId: departure.id,
            segmentName: segment.name,
            resourceKind: resource.resourceKind,
            title: resource.title,
            supplierName: resource.partner?.name ?? resource.supplier?.name ?? '',
            amountCents: resource.amountCents,
            notes: resource.notes,
            sortKey: `${departure.id}:s${segOrder}:${resource.createdAt.toISOString()}:${resource.id}`,
          })
        }
      }
      for (const resource of departure.departureResources) {
        rows.push({
          departureId: departure.id,
          segmentName: '发团级',
          resourceKind: resource.resourceKind,
          title: resource.title,
          supplierName: resource.partner?.name ?? resource.supplier?.name ?? '',
          amountCents: resource.amountCents,
          notes: resource.notes,
          sortKey: `${departure.id}:d:${resource.createdAt.toISOString()}:${resource.id}`,
        })
      }
    }
    return rows
  }
}
