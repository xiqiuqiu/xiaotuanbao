import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUIRE_MENU_KEY } from '../decorators/require-menu.decorator'
import { AuthService } from '../../modules/auth/auth.service'

@Injectable()
export class MenuPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const menuKey = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_MENU_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!menuKey) {
      return true
    }

    const request = context.switchToHttp().getRequest<{ user?: { userId: string } }>()
    const userId = request.user?.userId

    if (!userId) {
      throw new ForbiddenException('无权访问')
    }

    const menuKeys = await this.authService.getMenuKeysForUser(userId)
    if (!menuKeys.includes(menuKey)) {
      throw new ForbiddenException('无权访问')
    }

    return true
  }
}
