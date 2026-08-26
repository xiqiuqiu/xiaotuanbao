import type { NestExpressApplication } from '@nestjs/platform-express'

export const API_BODY_LIMIT = '512kb'

export function configureHttpBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: API_BODY_LIMIT })
  app.useBodyParser('urlencoded', { extended: true, limit: API_BODY_LIMIT })
}
