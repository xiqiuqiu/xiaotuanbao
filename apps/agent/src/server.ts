import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  AiCollaborationError,
  assistStreamEventSchema,
  type AssistStreamEvent,
} from '@xiaotuanbao/ai-contracts'
import { fetchTaskContext } from './get-task-context.client'
import { mapAgentFetchError } from './map-agent-error'
import { buildReadonlyAssistReply } from './readonly-turn'

export interface AgentServerConfig {
  port: number
  apiBaseUrl: string
  serviceSecret: string
  allowedOrigins: string[]
}

const READONLY_TOOLS = ['getTaskContext'] as const

export function createAgentServer(config: AgentServerConfig) {
  return createServer((request, response) => {
    void handleRequest(config, request, response)
  })
}

export function listAgentTools(): readonly string[] {
  return READONLY_TOOLS
}

async function handleRequest(
  config: AgentServerConfig,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const origin = request.headers.origin
  if (origin && config.allowedOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', 'http://agent.local')
  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { status: 'ok', tools: listAgentTools() })
    return
  }

  if (request.method === 'POST' && (url.pathname === '/copilotkit' || url.pathname === '/v1/assist-turns')) {
    await handleAssistTurn(config, request, response)
    return
  }

  json(response, 404, { message: 'not found' })
}

async function handleAssistTurn(
  config: AgentServerConfig,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const delegationToken = readBearer(request)
  if (!delegationToken) {
    json(response, 401, { data: AiCollaborationError.fromCode('DELEGATION_INVALID').toJSON() })
    return
  }

  let body: { taskId?: string; runId?: string }
  try {
    body = JSON.parse(await readBody(request)) as { taskId?: string; runId?: string }
  } catch {
    json(response, 400, { data: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON() })
    return
  }

  if (!body.taskId || !body.runId) {
    json(response, 400, { data: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON() })
    return
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  writeEvent(response, { type: 'run.started', runStatus: 'running' })

  try {
    const context = await fetchTaskContext(
      {
        apiBaseUrl: config.apiBaseUrl,
        serviceSecret: config.serviceSecret,
        delegationToken,
      },
      { taskId: body.taskId, runId: body.runId },
    )
    const reply = buildReadonlyAssistReply(context)
    writeEvent(response, { type: 'message.delta', text: reply })
    writeEvent(response, { type: 'run.completed', runStatus: 'completed' })
  } catch (error) {
    const mapped =
      error instanceof AiCollaborationError ? error : mapAgentFetchError(error)
    writeEvent(response, {
      type: 'run.failed',
      runStatus: 'failed',
      error: mapped.toJSON(),
    })
  }

  response.end()
}

function writeEvent(response: ServerResponse, event: AssistStreamEvent) {
  const parsed = assistStreamEventSchema.parse(event)
  response.write(`data: ${JSON.stringify(parsed)}\n\n`)
}

function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function readBearer(request: IncomingMessage): string {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

export function loadAgentConfigFromEnv(): AgentServerConfig {
  return {
    port: Number(process.env.AGENT_PORT ?? 4111),
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://127.0.0.1:3000',
    serviceSecret: process.env.AGENT_SERVICE_SECRET ?? '',
    allowedOrigins: (process.env.WEB_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  }
}
