import { Body, Controller, Post } from '@nestjs/common'
import type { LoginResult } from '@xiaotuanbao/shared'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto)
  }
}
