import type { ConfigService } from '@nestjs/config'

export function isAiCreateAssistEnabledForUser(
  configService: ConfigService,
  userId: string,
): boolean {
  const enabled = configService.get<boolean>('app.aiCreateAssist.enabled') === true
  if (!enabled) return false
  const allowlist = configService.get<string[]>('app.aiCreateAssist.userIds') ?? []
  return allowlist.length === 0 || allowlist.includes(userId)
}
