import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { isPlatformAdmin?: boolean }
    }>()

    if (!request.user?.isPlatformAdmin) {
      throw new ForbiddenException('无权访问')
    }

    return true
  }
}
