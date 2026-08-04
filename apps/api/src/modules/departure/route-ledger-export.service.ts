import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureService } from './departure.service'
import type { ListRouteLedgerQueryDto } from './dto/departure.dto'
import { renderRouteLedgerExportExcel } from './route-ledger-export-exceljs.renderer'
import { buildRouteLedgerExportSnapshot } from './route-ledger-export.snapshot'
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

    const exporter = await this.prisma.user.findFirst({
      where: { id: exportedByUserId, organizationId, deletedAt: null },
      select: { name: true },
    })

    const exportedAt = new Date().toISOString()
    const snapshot = buildRouteLedgerExportSnapshot({
      ledger,
      routeName: ledger.routeName ?? undefined,
      startDateFrom: ledger.startDateFrom ?? undefined,
      startDateTo: ledger.startDateTo ?? undefined,
      exportedAt,
      exportedByName: exporter?.name ?? '',
    })

    return renderRouteLedgerExportExcel(snapshot)
  }
}
