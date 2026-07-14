import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { LoginResult, MeResult } from '@xiaotuanbao/shared'
import type { Response } from 'express'
import { AuthService } from './auth.service'
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
  type AuthCookieConfig,
} from './auth-cookie'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './jwt-auth.guard'

@Controller('auth')
export class AuthController {
  private readonly cookieConfig: AuthCookieConfig

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    this.cookieConfig = {
      secure: configService.getOrThrow<boolean>('app.authCookieSecure'),
      sameSite: configService.getOrThrow<'lax' | 'strict' | 'none'>('app.authCookieSameSite'),
      maxAgeMs: configService.getOrThrow<number>('app.jwtExpiresInMs'),
      domain: configService.get<string>('app.authCookieDomain'),
    }
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResult> {
    const { token, session } = await this.authService.login(dto)
    response.cookie(AUTH_COOKIE_NAME, token, authCookieOptions(this.cookieConfig))
    return session
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions(this.cookieConfig))
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: { user: { userId: string } }): Promise<MeResult> {
    return this.authService.me(request.user.userId)
  }
}
