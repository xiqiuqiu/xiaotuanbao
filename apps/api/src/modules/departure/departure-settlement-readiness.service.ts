import { Injectable } from '@nestjs/common'
import { DepartureStatus } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureReadModelService } from './departure-read-model.service'

@Injectable()
export class DepartureSettlementReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureReadModelService: DepartureReadModelService,
  ) {}

  async findReadyDepartureIds(organizationId: string): Promise<string[]> {
    const candidates = await this.prisma.departure.findMany({
      where: { organizationId, status: DepartureStatus.pending_settlement },
      select: { id: true },
    })
    const ids = candidates.map(({ id }) => id)
    const readModels = await this.departureReadModelService.batchGetForDepartures(
      organizationId,
      ids,
      { includeOverviewStats: false },
    )

    return ids.filter((id) => readModels.get(id)?.isFinanciallySettled === true)
  }
}
