import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2'
import { createCopilotNodeHandler } from '@copilotkit/runtime/v2/node'
import { MastraAgent } from '@ag-ui/mastra'
import { runWithAssistRequestContext } from './assist-request-context'
import { fetchTaskContext } from './get-task-context.client'
import { createAiCreateMastra } from './mastra-agent'
import { mapAgentFetchError, mapModelError } from './map-agent-error'

export interface AgentServerConfig {
  port: number
  apiBaseUrl: string
  serviceSecret: string
  allowedOrigins: string[]
  model?: string
  modelApiKey?: string
  modelBaseUrl?: string
}

const AI_CREATE_TOOLS = [
  'getTaskContext',
  'searchRouteTemplates',
  'getMaterialParseResult',
  'submitReviewPackage',
] as const
const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Ai-Task-Id, X-Ai-Run-Id'

export function createAgentServer(config: AgentServerConfig) {
  const mastra = createAiCreateMastra(config)
  const runtime = new CopilotRuntime({
    agents: MastraAgent.getLocalAgents({
      mastra,
      resourceId: 'ai-create-readonly-assist',
    }),
  })
  const copilotFetch = createCopilotRuntimeHandler({
    runtime,
    basePath: '/copilotkit',
  })
  const copilotNode = createCopilotNodeHandler(copilotFetch)

  return createServer((request, response) => {
    void handleRequest(config, copilotNode, request, response)
  })
}

export function listAgentTools(): readonly string[] {
  return AI_CREATE_TOOLS
}

async function handleRequest(
  config: AgentServerConfig,
  copilotNode: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const origin = request.headers.origin
  if (origin && config.allowedOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
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

  if (url.pathname === '/copilotkit' || url.pathname.startsWith('/copilotkit/')) {
    await handleCopilotkit(config, copilotNode, request, response, url)
    return
  }

  json(response, 404, { message: 'not found' })
}

function isCopilotkitInfoDiscovery(method: string | undefined, pathname: string): boolean {
  return (
    (method === 'GET' || method === 'HEAD') &&
    (pathname === '/copilotkit/info' || pathname === '/copilotkit/info/')
  )
}

async function handleCopilotkit(
  config: AgentServerConfig,
  copilotNode: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  if (isCopilotkitInfoDiscovery(request.method, url.pathname)) {
    await invokeCopilotNode(response, () => copilotNode(request, response))
    return
  }

  const delegationToken = readBearer(request)
  if (!delegationToken) {
    json(response, 401, { data: AiCollaborationError.fromCode('DELEGATION_INVALID').toJSON() })
    return
  }

  const taskId = readHeader(request, 'x-ai-task-id')
  const runId = readHeader(request, 'x-ai-run-id')
  if (!taskId || !runId) {
    json(response, 400, { data: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON() })
    return
  }

  try {
    await fetchTaskContext(
      {
        apiBaseUrl: config.apiBaseUrl,
        serviceSecret: config.serviceSecret,
        delegationToken,
      },
      { taskId, runId },
    )
  } catch (error) {
    const mapped = error instanceof AiCollaborationError ? error : mapAgentFetchError(error)
    json(response, statusForCollaborationError(mapped), { data: mapped.toJSON() })
    return
  }

  await invokeCopilotNode(response, () =>
    runWithAssistRequestContext({ delegationToken, taskId, runId }, async () => {
      await copilotNode(request, response)
    }),
  )
}

function statusForCollaborationError(error: AiCollaborationError): number {
  if (error.code === 'DELEGATION_INVALID') {
    return 401
  }
  if (error.code === 'VERSION_CONFLICT' || error.code === 'REVIEW_PENDING') {
    return 409
  }
  if (error.code === 'PERMISSION_DENIED' || error.code === 'SERVICE_IDENTITY_INVALID') {
    return 403
  }
  return error.retryable ? 503 : 400
}

async function invokeCopilotNode(response: ServerResponse, run: () => Promise<void>) {
  try {
    await run()
  } catch (error) {
    if (response.headersSent) {
      if (!response.writableEnded && !response.destroyed) {
        response.destroy()
      }
      return
    }
    const mapped = error instanceof AiCollaborationError ? error : mapModelError(error)
    json(response, mapped.retryable ? 503 : 400, { data: mapped.toJSON() })
  }
}

function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function readBearer(request: IncomingMessage): string {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function readHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name]
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? ''
  }
  return value?.trim() ?? ''
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
    model: process.env.AI_MODEL ?? 'deepseek/deepseek-chat',
    modelApiKey: process.env.DEEPSEEK_API_KEY ?? '',
    modelBaseUrl: process.env.AI_MODEL_BASE_URL ?? 'https://api.deepseek.com',
  }
}
