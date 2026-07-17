import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { EmployeeListResult, EmployeeSummary } from '@xiaotuanbao/shared'
import { Prisma, UserStatus } from '@prisma/client'
import { hash } from 'bcryptjs'
import { normalizeUsername } from '../../common/username'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from './dto/employee.dto'

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: ListEmployeesQueryDto): Promise<EmployeeListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)
    const search = query.search?.trim()

    const where = {
      organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.roleId
        ? {
            roles: {
              some: {
                roleId: query.roleId,
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { username: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [items, total, enabled, disabled, createdToday] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count({
        where: { organizationId, deletedAt: null, status: UserStatus.enabled },
      }),
      this.prisma.user.count({
        where: { organizationId, deletedAt: null, status: UserStatus.disabled },
      }),
      this.prisma.user.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: startOfToday },
        },
      }),
    ])

    return {
      items: items.map((user) => this.toEmployeeSummary(user)),
      total,
      page,
      pageSize,
      stats: {
        total: enabled + disabled,
        enabled,
        disabled,
        createdToday,
      },
    }
  }

  async listOptions(organizationId: string): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: UserStatus.enabled,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  }

  async create(organizationId: string, dto: CreateEmployeeDto): Promise<EmployeeSummary> {
    const username = normalizeUsername(dto.username)
    await this.ensureUsernameAvailable(username)

    await this.ensureRoleExists(dto.roleId)

    const passwordHash = await hash(dto.password, 10)
    try {
      const user = await this.prisma.user.create({
        data: {
          organizationId,
          username,
          name: dto.name.trim(),
          remark: dto.remark?.trim() || null,
          status: dto.status,
          passwordHash,
          roles: {
            create: {
              roleId: dto.roleId,
            },
          },
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      })

      return this.toEmployeeSummary(user)
    } catch (error) {
      this.rethrowUsernameConflict(error)
    }
  }

  async update(
    organizationId: string,
    userId: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeSummary> {
    const user = await this.findEmployeeOrThrow(organizationId, userId)
    const username = normalizeUsername(dto.username)
    await this.ensureUsernameAvailable(username, user.id)

    await this.ensureRoleExists(dto.roleId)

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId: user.id } })
        return tx.user.update({
          where: { id: user.id },
          data: {
            username,
            name: dto.name.trim(),
            remark: dto.remark?.trim() || null,
            status: dto.status,
            roles: {
              create: {
                roleId: dto.roleId,
              },
            },
          },
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        })
      })

      return this.toEmployeeSummary(updated)
    } catch (error) {
      this.rethrowUsernameConflict(error)
    }
  }

  async disable(organizationId: string, userId: string): Promise<EmployeeSummary> {
    const user = await this.findEmployeeOrThrow(organizationId, userId)

    if (user.status === UserStatus.disabled) {
      throw new BadRequestException('员工已处于停用状态')
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.disabled },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    return this.toEmployeeSummary(updated)
  }

  private async findEmployeeOrThrow(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
    })

    if (!user) {
      throw new NotFoundException('员工不存在')
    }

    return user
  }

  private async ensureRoleExists(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } })
    if (!role) {
      throw new BadRequestException('Role 不存在')
    }
  }

  private async ensureUsernameAvailable(username: string, excludeUserId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        username,
        deletedAt: null,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
    })

    if (existing) {
      throw new ConflictException('用户名已存在')
    }
  }

  private rethrowUsernameConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target
      const fields = Array.isArray(target) ? target.map(String) : []
      if (fields.some((field) => field.includes('username'))) {
        throw new ConflictException('用户名已存在')
      }
    }
    throw error
  }

  private toEmployeeSummary(user: {
    id: string
    username: string
    name: string
    remark: string | null
    status: UserStatus
    lastLoginAt: Date | null
    createdAt: Date
    updatedAt: Date
    roles: Array<{ role: { name: string } }>
  }): EmployeeSummary {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      remark: user.remark,
      status: user.status,
      roles: user.roles.map((item) => item.role.name),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }
  }
}
