import { Injectable, NotFoundException } from '@nestjs/common'
import type { OrganizationSummary } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'

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

    return {
      id: organization.id,
      name: organization.name,
    }
  }
}
