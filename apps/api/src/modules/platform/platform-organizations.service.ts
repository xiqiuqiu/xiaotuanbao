import { Injectable, NotFoundException } from '@nestjs/common'
import {
  PLATFORM_ORGANIZATION_NAME,
  PLATFORM_ORGANIZATION_PREFIX,
  type PlatformOrganizationListResult,
  type PlatformOrganizationProfile,
} from '@xiaotuanbao/shared'
import type { OrganizationStatus } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'

function platformOrganizationIdentity() {
  return {
    name: process.env.SEED_PLATFORM_ORG_NAME ?? PLATFORM_ORGANIZATION_NAME,
    businessPrefix:
      process.env.SEED_PLATFORM_ORG_BUSINESS_PREFIX ?? PLATFORM_ORGANIZATION_PREFIX,
  }
}

@Injectable()
export class PlatformOrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    page?: number
    pageSize?: number
  }): Promise<PlatformOrganizationListResult> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where = this.customerOrganizationWhere()

    const [rows, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.organization.count({ where }),
    ])

    return {
      items: rows.map((row) => this.toProfile(row)),
      total,
      page,
      pageSize,
    }
  }

  async getById(id: string): Promise<PlatformOrganizationProfile> {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id,
        ...this.customerOrganizationWhere(),
      },
    })

    if (!organization) {
      throw new NotFoundException('Organization 不存在')
    }

    return this.toProfile(organization)
  }

  private customerOrganizationWhere() {
    const platform = platformOrganizationIdentity()
    return {
      deletedAt: null,
      NOT: {
        OR: [{ name: platform.name }, { businessPrefix: platform.businessPrefix }],
      },
    }
  }

  private toProfile(organization: {
    id: string
    name: string
    businessPrefix: string
    status: OrganizationStatus
    createdAt: Date
    updatedAt: Date
  }): PlatformOrganizationProfile {
    return {
      id: organization.id,
      name: organization.name,
      businessPrefix: organization.businessPrefix,
      status: organization.status,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    }
  }
}
