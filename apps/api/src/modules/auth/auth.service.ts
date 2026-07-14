import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { AuthUser, LoginResult, MeResult } from '@xiaotuanbao/shared'
import { UserStatus } from '@prisma/client'
import { compare } from 'bcryptjs'
import type { JwtPayload } from '../../common/types/api-response.type'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { LoginDto } from './dto/login.dto'

const userWithRolesInclude = {
  organization: true,
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} as const

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const username = dto.username.trim()

    const user = await this.prisma.user.findFirst({
      where: {
        username,
        deletedAt: null,
        organization: {
          deletedAt: null,
        },
      },
      include: userWithRolesInclude,
    })

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    if (user.status === UserStatus.disabled) {
      throw new UnauthorizedException('账号已停用')
    }

    const passwordMatched = await compare(dto.password, user.passwordHash)
    if (!passwordMatched) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    await this.prisma.$executeRaw`
      UPDATE "users"
      SET "last_login_at" = ${new Date()}
      WHERE "id" = ${user.id}
    `

    const session = this.buildSession(user)
    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    }
    const accessToken = await this.jwtService.signAsync(payload)

    return {
      accessToken,
      ...session,
    }
  }

  async me(userId: string): Promise<MeResult> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        organization: {
          deletedAt: null,
        },
      },
      include: userWithRolesInclude,
    })

    if (!user) {
      throw new UnauthorizedException('用户不存在或已失效')
    }

    if (user.status === UserStatus.disabled) {
      throw new UnauthorizedException('账号已停用')
    }

    return this.buildSession(user)
  }

  async getMenuKeysForUser(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userWithRolesInclude,
    })

    if (!user) {
      return []
    }

    return this.resolveMenuKeys(user)
  }

  buildSession(user: {
    id: string
    username: string
    name: string
    organizationId: string
    organization: { name: string }
    roles: Array<{
      role: {
        name: string
        permissions: Array<{ permission: { key: string } }>
      }
    }>
  }): { user: AuthUser; menuKeys: string[] } {
    const roles = user.roles.map((item) => item.role.name)
    const menuKeys = this.resolveMenuKeys(user)

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        roles,
      },
      menuKeys,
    }
  }

  private resolveMenuKeys(user: {
    roles: Array<{
      role: {
        permissions: Array<{ permission: { key: string } }>
      }
    }>
  }): string[] {
    const keys = new Set<string>()

    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        keys.add(rolePermission.permission.key)
      }
    }

    return [...keys].sort()
  }
}
