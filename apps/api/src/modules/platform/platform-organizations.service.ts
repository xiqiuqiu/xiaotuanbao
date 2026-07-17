import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  PLATFORM_ORGANIZATION_NAME,
  PLATFORM_ORGANIZATION_PREFIX,
  PRESET_ROLE_NAMES,
  type PlatformOrganizationListResult,
  type PlatformOrganizationProfile,
} from '@xiaotuanbao/shared'
import { OrganizationStatus, Prisma, UserStatus } from '@prisma/client'
import { hash } from 'bcryptjs'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { CreatePlatformOrganizationDto } from './dto/create-platform-organization.dto'
import type { UpdatePlatformOrganizationDto } from './dto/update-platform-organization.dto'

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

  async create(dto: CreatePlatformOrganizationDto): Promise<PlatformOrganizationProfile> {
    const name = dto.name.trim()
    const businessPrefix = dto.businessPrefix.trim()
    const adminUsername = dto.adminUsername.trim()
    const adminName = dto.adminName.trim()

    await this.ensureNameAvailable(name)
    await this.ensureBusinessPrefixAvailable(businessPrefix)

    const orgAdminRole = await this.prisma.role.findUnique({
      where: { name: PRESET_ROLE_NAMES.ORG_ADMIN },
    })
    if (!orgAdminRole) {
      throw new BadRequestException('企业管理员角色未配置')
    }

    const passwordHash = await hash(dto.adminPassword, 10)

    try {
      const organization = await this.prisma.organization.create({
        data: {
          name,
          businessPrefix,
          status: OrganizationStatus.enabled,
          users: {
            create: {
              username: adminUsername,
              name: adminName,
              passwordHash,
              isPlatformAdmin: false,
              status: UserStatus.enabled,
              roles: {
                create: {
                  roleId: orgAdminRole.id,
                },
              },
            },
          },
        },
      })
      return this.toProfile(organization)
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target
        const fields = Array.isArray(target) ? target.map(String) : []
        if (fields.some((field) => field.includes('business_prefix') || field === 'businessPrefix')) {
          throw new ConflictException('组织业务前缀已存在')
        }
        if (fields.some((field) => field === 'name')) {
          throw new ConflictException('组织名称已存在')
        }
        if (fields.some((field) => field.includes('username'))) {
          throw new ConflictException('用户名已存在')
        }
        throw new ConflictException('组织名称或业务前缀已存在')
      }
      throw error
    }
  }

  async updateName(
    id: string,
    dto: UpdatePlatformOrganizationDto,
  ): Promise<PlatformOrganizationProfile> {
    await this.findCustomerOrganizationOrThrow(id)

    const name = dto.name.trim()
    await this.ensureNameAvailable(name, id)

    const organization = await this.prisma.organization.update({
      where: { id },
      data: { name },
    })

    return this.toProfile(organization)
  }

  async disable(id: string): Promise<PlatformOrganizationProfile> {
    const existing = await this.findCustomerOrganizationOrThrow(id)

    if (existing.status === OrganizationStatus.disabled) {
      throw new BadRequestException('组织已处于停用状态')
    }

    const organization = await this.prisma.organization.update({
      where: { id },
      data: { status: OrganizationStatus.disabled },
    })

    return this.toProfile(organization)
  }

  async enable(id: string): Promise<PlatformOrganizationProfile> {
    const existing = await this.findCustomerOrganizationOrThrow(id)

    if (existing.status === OrganizationStatus.enabled) {
      throw new BadRequestException('组织已处于启用状态')
    }

    const organization = await this.prisma.organization.update({
      where: { id },
      data: { status: OrganizationStatus.enabled },
    })

    return this.toProfile(organization)
  }

  private async findCustomerOrganizationOrThrow(id: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id,
        ...this.customerOrganizationWhere(),
      },
    })

    if (!organization) {
      throw new NotFoundException('Organization 不存在')
    }

    return organization
  }

  private async ensureNameAvailable(name: string, excludeId?: string) {
    const existing = await this.prisma.organization.findFirst({
      where: {
        name,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
    if (existing) {
      throw new ConflictException('组织名称已存在')
    }
  }

  private async ensureBusinessPrefixAvailable(businessPrefix: string) {
    const existing = await this.prisma.organization.findFirst({
      where: { businessPrefix, deletedAt: null },
    })
    if (existing) {
      throw new ConflictException('组织业务前缀已存在')
    }
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
