import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import type { LoginResult, MeResult } from '@xiaotuanbao/shared'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './jwt-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: { user: { userId: string } }): Promise<MeResult> {
    return this.authService.me(request.user.userId)
  }
}
