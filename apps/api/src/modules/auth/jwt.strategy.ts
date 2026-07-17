import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { OrganizationStatus, UserStatus } from '@prisma/client'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { JwtPayload } from '../../common/types/api-response.type'
import { PrismaService } from '../../database/prisma/prisma.service'
import { extractAuthCookie } from './auth-cookie'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const extractors = [extractAuthCookie]
    if (configService.get<boolean>('app.authAllowLegacyBearer', false)) {
      extractors.push(ExtractJwt.fromAuthHeaderAsBearerToken())
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors(extractors),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('app.jwtSecret'),
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        organizationId: payload.organizationId,
        status: UserStatus.enabled,
        deletedAt: null,
        organization: { deletedAt: null, status: OrganizationStatus.enabled },
      },
      select: {
        id: true,
        organizationId: true,
        isPlatformAdmin: true,
      },
    })

    if (!user) {
      throw new UnauthorizedException('用户不存在或已失效')
    }

    return {
      userId: user.id,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    }
  }
}
