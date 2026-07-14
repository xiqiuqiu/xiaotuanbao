import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>

  constructor(configService: ConfigService) {
    this.allowedOrigins = new Set(
      configService.getOrThrow<string[]>('app.authAllowedOrigins'),
    )
  }

  canActivate(context: ExecutionContext): boolean {
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
