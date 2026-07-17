import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformController {
  @Get('session')
  getSession(@Req() request: { user: { isPlatformAdmin: boolean } }) {
    return {
      ok: true as const,
      isPlatformAdmin: request.user.isPlatformAdmin,
    }
  }
}
