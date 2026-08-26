import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'
import { MulterError } from 'multer'
import { STORED_OBJECT_MAX_UPLOAD_MB } from '../../modules/stored-object/stored-object.constants'
import type { ApiResponse } from '../types/api-response.type'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR
    let message = '服务器内部错误'
    let code = status
    let data: unknown = null

    if (isRequestBodyTooLarge(exception)) {
      status = HttpStatus.PAYLOAD_TOO_LARGE
      code = status
      message = '请求内容过大'
    } else if (exception instanceof HttpException) {
      status = exception.getStatus()
      code = status
      const exceptionResponse = exception.getResponse()

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        const payload = exceptionResponse as {
          message?: string | string[]
          data?: unknown
        }
        const rawMessage = payload.message
        message = Array.isArray(rawMessage) ? rawMessage.join('; ') : rawMessage ?? message
        if ('data' in payload) {
          data = payload.data ?? null
        }
      }
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        message = `文件过大，最大允许 ${STORED_OBJECT_MAX_UPLOAD_MB}MB`
      }
    } else if (exception instanceof MulterError) {
      status =
        exception.code === 'LIMIT_FILE_SIZE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.BAD_REQUEST
      code = status
      message =
        exception.code === 'LIMIT_FILE_SIZE'
          ? `文件过大，最大允许 ${STORED_OBJECT_MAX_UPLOAD_MB}MB`
          : '上传请求无效'
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack)
    } else {
      this.logger.error('Unknown exception', String(exception))
    }

    const body: ApiResponse<unknown> = {
      code,
      message,
      data,
    }

    response.status(status).json(body)
  }
}

function isRequestBodyTooLarge(exception: unknown): boolean {
  if (!(exception instanceof Error)) {
    return false
  }
  const candidate = exception as Error & {
    status?: number
    statusCode?: number
    type?: string
  }
  return (
    candidate.type === 'entity.too.large' ||
    candidate.status === HttpStatus.PAYLOAD_TOO_LARGE ||
    candidate.statusCode === HttpStatus.PAYLOAD_TOO_LARGE
  )
}
