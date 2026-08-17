import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  headlessExecutionRequestSchema,
  headlessExecutionResultSchema,
  type HeadlessExecutionResult,
} from '@xiaotuanbao/ai-contracts'

export async function startDeterministicHeadlessAgent(options: {
  getApiBaseUrl: () => string
  serviceSecret: string
  outcome: HeadlessExecutionResult
}): Promise<{
  url: string
  origin: string
  setOutcome: (outcome: HeadlessExecutionResult) => void
  holdNextCall: () => void
  release: () => void
  close: () => Promise<void>
  callCount: () => number
  lastTaskContext: () => unknown
  lastUserText: () => string | null
}> {
  let outcome = options.outcome
  let callCount = 0
  let lastContext: unknown = null
  let lastUserText: string | null = null
  let hold: Promise<void> | null = null
  let releaseHold: (() => void) | null = null

  const server = createServer((request, response) => {
    void handle(request, response)
  })

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://agent.local')
    if (request.method === 'POST' && url.pathname === '/v1/headless-runs') {
      const serviceKey = header(request, 'x-agent-service-key')
      if (serviceKey !== options.serviceSecret) {
        json(response, 403, { data: { code: 'SERVICE_IDENTITY_INVALID' } })
        return
      }
      const authorization = header(request, 'authorization')
      if (!authorization.startsWith('Bearer ')) {
        json(response, 401, { data: { code: 'DELEGATION_INVALID' } })
        return
      }
      let body: unknown
      try {
        body = JSON.parse(await readBody(request))
      } catch {
        json(response, 400, { data: { code: 'INVALID_FORMAT' } })
        return
      }
      const parsed = headlessExecutionRequestSchema.safeParse(body)
      if (!parsed.success) {
        json(response, 400, { data: { code: 'INVALID_FORMAT' } })
        return
      }

      const token = authorization.slice('Bearer '.length)
      const claims = decodeJwtPayload(token)
      const context = await fetch(`${options.getApiBaseUrl()}/api/ai-tools/v1/get-task-context`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          'X-Agent-Service-Key': options.serviceSecret,
        },
        body: JSON.stringify({
          taskId: parsed.data.taskId,
          runId: typeof claims.runId === 'string' ? claims.runId : '',
        }),
      })
      const contextBody = await context.json().catch(() => null)
      lastContext = contextBody
      lastUserText = parsed.data.userText
      if (!context.ok) {
        json(response, 200, {
          data: headlessExecutionResultSchema.parse({
            kind: 'failed',
            error: {
              code: 'DELEGATION_INVALID',
              message: 'AI 操作委托无效或已过期，请重新打开侧栏',
              retryable: false,
            },
          }),
        })
        return
      }

      callCount += 1
      if (hold) {
        await hold
      }
      json(response, 200, { data: outcome })
      return
    }

    json(response, 404, { message: 'not found' })
  }

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${address.port}/v1/headless-runs`,
    origin: `http://127.0.0.1:${address.port}`,
    setOutcome: (next) => {
      outcome = next
    },
    holdNextCall: () => {
      hold = new Promise((resolve) => {
        releaseHold = resolve
      })
    },
    release: () => {
      releaseHold?.()
      hold = null
      releaseHold = null
    },
    close: () =>
      new Promise((resolve, reject) => {
        releaseHold?.()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
    callCount: () => callCount,
    lastTaskContext: () => lastContext,
    lastUserText: () => lastUserText,
  }
}

function header(request: IncomingMessage, name: string): string {
  const value = request.headers[name]
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? ''
  }
  return value?.trim() ?? ''
}

function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length < 2) {
    return {}
  }
  try {
    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }
  return {}
}
