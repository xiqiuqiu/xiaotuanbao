import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AiCollaborationError,
  headlessExecutionIdentitySchema,
  headlessExecutionResultSchema,
  type HeadlessExecutionIdentity,
  type HeadlessExecutionResult,
} from '@xiaotuanbao/ai-contracts'

@Injectable()
export class AiHeadlessClient {
  constructor(private readonly configService: ConfigService) {}

  async run(
    identity: HeadlessExecutionIdentity,
    delegationToken: string,
  ): Promise<HeadlessExecutionResult> {
    const parsedIdentity = headlessExecutionIdentitySchema.parse(identity)
    const url = this.headlessRunUrl()
    const secret = this.configService.get<string>('app.aiCreateAssist.agentServiceSecret') ?? ''
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${delegationToken}`,
          'Content-Type': 'application/json',
          'X-Agent-Service-Key': secret,
        },
        body: JSON.stringify(parsedIdentity),
      })
    } catch {
      return {
        kind: 'failed',
        error: AiCollaborationError.fromCode('AGENT_UNAVAILABLE').toJSON(),
      }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        kind: 'failed',
        error: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON(),
      }
    }

    const data =
      payload && typeof payload === 'object' && 'data' in payload
        ? (payload as { data: unknown }).data
        : payload
    const parsed = headlessExecutionResultSchema.safeParse(data)
    if (!parsed.success) {
      if (!response.ok) {
        return {
          kind: 'failed',
          error: AiCollaborationError.fromCode('AGENT_UNAVAILABLE').toJSON(),
        }
      }
      return {
        kind: 'failed',
        error: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON(),
      }
    }
    return parsed.data
  }

  private headlessRunUrl(): string {
    const internal = this.configService.get<string>('app.aiCreateAssist.agentInternalUrl')?.trim()
    if (internal) {
      return `${internal.replace(/\/$/, '')}/v1/headless-runs`
    }
    const runtime = this.configService.get<string>('app.aiCreateAssist.agentRuntimeUrl') ?? ''
    if (runtime.startsWith('http://') || runtime.startsWith('https://')) {
      return runtime.replace(/\/copilotkit\/?$/, '') + '/v1/headless-runs'
    }
    return 'http://127.0.0.1:4111/v1/headless-runs'
  }
}
