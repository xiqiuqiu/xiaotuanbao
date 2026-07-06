import { Injectable } from '@nestjs/common'
import type { RoleSummary } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<RoleSummary[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      menuKeys: role.permissions.map((item) => item.permission.key).sort(),
    }))
  }
}
