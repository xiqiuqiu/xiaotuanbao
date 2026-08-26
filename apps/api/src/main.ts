import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { configureHttpBodyParsers } from './common/http-body-parser'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn', 'log'],
  })

  configureHttpBodyParsers(app)

  const configService = app.get(ConfigService)
  const port = configService.get<number>('app.port', 3000)
  const allowedOrigins = configService.getOrThrow<string[]>('app.authAllowedOrigins')

  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalInterceptors(new TransformInterceptor())

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  })

  await app.listen(port)

  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap')
}

bootstrap()
