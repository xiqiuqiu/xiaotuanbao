import { Injectable, NotFoundException } from '@nestjs/common'
import type { OrganizationSummary } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  getShanghaiTodayString,
  getShanghaiYearMonthString,
} from '../departure/departure-date.utils'
import { buildNumberingExamples } from './organization-numbering.utils'

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(organizationId: string): Promise<OrganizationSummary> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    })

    if (!organization) {
      throw new NotFoundException('Organization 不存在')
    }

    const periodMonth = getShanghaiYearMonthString()
    const periodDay = getShanghaiTodayString().replace(/-/g, '')

    return {
      id: organization.id,
      name: organization.name,
      businessPrefix: organization.businessPrefix,
      numberingExamples: buildNumberingExamples(
        organization.businessPrefix,
        periodMonth,
        periodDay,
      ),
    }
  }
}
