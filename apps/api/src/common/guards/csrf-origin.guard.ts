import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>

  constructor(
    configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.allowedOrigins = new Set(
      configService.getOrThrow<string[]>('app.authAllowedOrigins'),
    )
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ])) {
      return true
    }

    const request = context.switchToHttp().getRequest<Request>()
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true
    }

    const origin = request.headers.origin
    if (!origin || !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException('请求来源不受信任')
    }
    return true
  }
}
