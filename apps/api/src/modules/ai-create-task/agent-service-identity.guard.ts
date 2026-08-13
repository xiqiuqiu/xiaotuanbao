import { createHash, timingSafeEqual } from 'node:crypto'
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { AiCollaborationHttpException } from '../../modules/ai-create-task/ai-collaboration.http-exception'

export const AGENT_SERVICE_KEY_HEADER = 'x-agent-service-key'

function secretsEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftHash, rightHash)
}

@Injectable()
export class AgentServiceIdentityGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('app.aiCreateAssist.agentServiceSecret') ?? ''
    const request = context.switchToHttp().getRequest<Request>()
    const provided = request.header(AGENT_SERVICE_KEY_HEADER) ?? ''

    if (!expected || !secretsEqual(provided, expected)) {
      throw AiCollaborationHttpException.fromCode('SERVICE_IDENTITY_INVALID')
    }

    return true
  }
}
