import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, map } from 'rxjs'
import type { ApiResponse } from '../types/api-response.type'
import { SKIP_RESPONSE_WRAP_KEY } from '../decorators/skip-response-wrap.decorator'

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | T> {
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ])) {
      return next.handle()
    }
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'success',
        data,
      })),
    )
  }
}
