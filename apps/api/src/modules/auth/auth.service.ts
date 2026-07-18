import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { AuthUser, LoginResult, MeResult } from '@xiaotuanbao/shared'
import { OrganizationStatus, UserStatus } from '@prisma/client'
import { compare } from 'bcryptjs'
import type { JwtPayload } from '../../common/types/api-response.type'
import { normalizeUsername } from '../../common/username'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { LoginDto } from './dto/login.dto'

export interface CreatedSession {
  token: string
  session: LoginResult
}

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

  async login(dto: LoginDto): Promise<CreatedSession> {
    const username = normalizeUsername(dto.username)

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

    if (user.organization.status === OrganizationStatus.disabled) {
      throw new UnauthorizedException('组织已停用')
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

    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    }
    return {
      token: await this.jwtService.signAsync(payload),
      session: this.buildSession(user),
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

    if (user.organization.status === OrganizationStatus.disabled) {
      throw new UnauthorizedException('组织已停用')
    }

    if (user.status === UserStatus.disabled) {
      throw new UnauthorizedException('账号已停用')
    }

    return this.buildSession(user)
  }

  async getMenuKeysForUser(userId: string): Promise<string[]> {
    const user = await this.loadUserForPermissionKeys(userId)
    if (!user || user.isPlatformAdmin) {
      return []
    }

    return this.resolvePermissionKeys(user).menuKeys
  }

  /**
   * Union of menu + action keys, used by `MenuPermissionGuard` so that
   * `@RequireMenu('/departure')` and `@RequireMenu('departure:write')` (ADR-0023)
   * share one enforcement path.
   */
  async getPermissionKeysForUser(userId: string): Promise<string[]> {
    const user = await this.loadUserForPermissionKeys(userId)
    if (!user || user.isPlatformAdmin) {
      return []
    }

    const { menuKeys, actionKeys } = this.resolvePermissionKeys(user)
    return [...menuKeys, ...actionKeys]
  }

  private loadUserForPermissionKeys(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userWithRolesInclude,
    })
  }

  buildSession(user: {
    id: string
    username: string
    name: string
    organizationId: string
    isPlatformAdmin: boolean
    organization: { name: string }
    roles: Array<{
      role: {
        name: string
        permissions: Array<{ permission: { key: string } }>
      }
    }>
  }): { user: AuthUser; menuKeys: string[]; actionKeys: string[] } {
    const roles = user.isPlatformAdmin ? [] : user.roles.map((item) => item.role.name)
    const { menuKeys, actionKeys } = user.isPlatformAdmin
      ? { menuKeys: [], actionKeys: [] }
      : this.resolvePermissionKeys(user)

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        roles,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      menuKeys,
      actionKeys,
    }
  }

  /**
   * Splits a user's resolved permission keys into menu keys (menu/route filtering)
   * and action keys (button-level gating, ADR-0023). Menu keys are path-shaped
   * (`/...`); every other permission key is treated as an action key.
   */
  private resolvePermissionKeys(user: {
    roles: Array<{
      role: {
        permissions: Array<{ permission: { key: string } }>
      }
    }>
  }): { menuKeys: string[]; actionKeys: string[] } {
    const keys = new Set<string>()

    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        keys.add(rolePermission.permission.key)
      }
    }

    const menuKeys: string[] = []
    const actionKeys: string[] = []
    for (const key of keys) {
      if (key.startsWith('/')) {
        menuKeys.push(key)
      } else {
        actionKeys.push(key)
      }
    }

    return { menuKeys: menuKeys.sort(), actionKeys: actionKeys.sort() }
  }
}
