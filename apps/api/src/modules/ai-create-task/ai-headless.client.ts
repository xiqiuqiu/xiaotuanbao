import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AiCollaborationError,
  headlessExecutionRequestSchema,
  headlessExecutionResultSchema,
  headlessRunFrameSchema,
  type HeadlessExecutionRequest,
  type HeadlessExecutionResult,
} from '@xiaotuanbao/ai-contracts'

const DEFAULT_RUN_TIMEOUT_MS = 120_000

export type HeadlessRunOptions = {
  onPublicText?: (text: string) => void
  onReasoningText?: (text: string) => void
}

@Injectable()
export class AiHeadlessClient {
  constructor(private readonly configService: ConfigService) {}

  async run(
    request: HeadlessExecutionRequest,
    delegationToken: string,
    options: HeadlessRunOptions = {},
  ): Promise<HeadlessExecutionResult> {
    const parsedRequest = headlessExecutionRequestSchema.parse(request)
    const url = this.headlessRunUrl()
    const secret = this.configService.get<string>('app.aiCreateAssist.agentServiceSecret') ?? ''
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.runTimeoutMs())
    try {
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${delegationToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson, application/json',
            'X-Agent-Service-Key': secret,
          },
          body: JSON.stringify(parsedRequest),
          signal: controller.signal,
        })
      } catch {
        return unavailable()
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('ndjson')) {
        try {
          return await readNdjsonResult(response, options, controller.signal.aborted)
        } catch {
          return {
            kind: 'failed',
            error: AiCollaborationError.fromCode(
              controller.signal.aborted ? 'AGENT_UNAVAILABLE' : 'INVALID_FORMAT',
            ).toJSON(),
          }
        }
      }

      return await readJsonResult(response, controller.signal.aborted)
    } finally {
      clearTimeout(timer)
    }
  }

  private runTimeoutMs(): number {
    const configured = this.configService.get<number>('app.aiCreateAssist.runTimeoutMs')
    if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
      return configured
    }
    return DEFAULT_RUN_TIMEOUT_MS
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

function unavailable(): HeadlessExecutionResult {
  return {
    kind: 'failed',
    error: AiCollaborationError.fromCode('AGENT_UNAVAILABLE').toJSON(),
  }
}

function invalidFormat(): HeadlessExecutionResult {
  return {
    kind: 'failed',
    error: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON(),
  }
}

async function readJsonResult(response: Response, aborted: boolean): Promise<HeadlessExecutionResult> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      kind: 'failed',
      error: AiCollaborationError.fromCode(aborted ? 'AGENT_UNAVAILABLE' : 'INVALID_FORMAT').toJSON(),
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
        error: AiCollaborationError.fromCode(
          response.status >= 500 ? 'AGENT_UNAVAILABLE' : 'INVALID_FORMAT',
        ).toJSON(),
      }
    }
    return invalidFormat()
  }
  return parsed.data
}

async function readNdjsonResult(
  response: Response,
  options: HeadlessRunOptions,
  aborted: boolean,
): Promise<HeadlessExecutionResult> {
  if (!response.body) {
    return aborted ? unavailable() : invalidFormat()
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let publicText = ''
  let completed: HeadlessExecutionResult | undefined
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
      const lines = buffer.split('\n')
      buffer = done ? '' : (lines.pop() ?? '')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }
        let parsedJson: unknown
        try {
          parsedJson = JSON.parse(trimmed) as unknown
        } catch {
          continue
        }
        const parsed = headlessRunFrameSchema.safeParse(parsedJson)
        if (!parsed.success) {
          continue
        }
        if (parsed.data.type === 'reasoning.delta') {
          options.onReasoningText?.(parsed.data.text)
        }
        if (parsed.data.type === 'message.delta') {
          publicText += parsed.data.text
          options.onPublicText?.(publicText)
        }
        if (parsed.data.type === 'run.completed') {
          completed = parsed.data.result
        }
      }
      if (done) {
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
  if (completed) {
    return completed
  }
  return aborted ? unavailable() : invalidFormat()
}
