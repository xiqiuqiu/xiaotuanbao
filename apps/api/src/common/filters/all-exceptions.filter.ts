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

    if (exception instanceof HttpException) {
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
        const rawMessage = (exceptionResponse as { message?: string | string[] }).message
        message = Array.isArray(rawMessage) ? rawMessage.join('; ') : rawMessage ?? message
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

    const body: ApiResponse<null> = {
      code,
      message,
      data: null,
    }

    response.status(status).json(body)
  }
}
