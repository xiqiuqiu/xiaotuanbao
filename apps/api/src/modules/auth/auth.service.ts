import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { LoginResult } from '@xiaotuanbao/shared'
import { compare } from 'bcryptjs'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { JwtPayload } from '../../common/types/api-response.type'
import type { LoginDto } from './dto/login.dto'

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
      include: {
        organization: true,
      },
    })

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const passwordMatched = await compare(dto.password, user.passwordHash)
    if (!passwordMatched) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    }

    const accessToken = await this.jwtService.signAsync(payload)

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
    }
  }
}
