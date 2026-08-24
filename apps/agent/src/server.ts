import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2'
import { createCopilotNodeHandler } from '@copilotkit/runtime/v2/node'
import { MastraAgent } from '@ag-ui/mastra'
import { requestContextSchema } from '@xiaotuanbao/ai-contracts'
import {
  handleHeadlessRun,
  loadDeterministicAgentAdapterFromEnv,
  type HeadlessExecutor,
} from './headless-execution'
import { json } from './http'
import {
  createAiCreateDiscoveryMastra,
  createAiCreateMastra,
  AI_CREATE_AGENT_ID,
} from './mastra-agent'
import { createMastraHeadlessExecutor } from './mastra-headless.executor'
import { mapModelError } from './map-agent-error'
import { getAssistRequestContext } from './assist-request-context'
import { AI_CREATE_CAPABILITY_DEFINITIONS } from './agent-definition'

export {
  createDeterministicAgentAdapter,
  loadDeterministicAgentAdapterFromEnv,
  type HeadlessExecutor,
} from './headless-execution'

export interface AgentServerConfig {
  port: number
  apiBaseUrl: string
  serviceSecret: string
  allowedOrigins: string[]
  model?: string
  modelApiKey?: string
  modelBaseUrl?: string
  headlessExecutor?: HeadlessExecutor
}

const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Ai-Task-Id, X-Ai-Run-Id'

export function createAgentServer(config: AgentServerConfig) {
  const mastra = createAiCreateDiscoveryMastra(config)
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
  const headlessExecutor =
    config.headlessExecutor ??
    loadDeterministicAgentAdapterFromEnv() ??
    createMastraHeadlessExecutor({
      async readUserText(request) {
        return request.userText.trim()
      },
      generate: (userText) => {
        const { delegationToken: _delegationToken, ...requestContext } = getAssistRequestContext()
        const trusted = requestContextSchema.parse(requestContext)
        const attemptMastra = createAiCreateMastra(config, trusted)
        return attemptMastra.getAgent(AI_CREATE_AGENT_ID).generate(userText)
      },
    })

  return createServer((request, response) => {
    void handleRequest({ ...config, headlessExecutor }, copilotNode, request, response)
  })
}

export function listAgentTools(): readonly string[] {
  return AI_CREATE_CAPABILITY_DEFINITIONS.map((definition) => definition.toolName)
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
    await handleCopilotkit(copilotNode, request, response, url)
    return
  }

  if (url.pathname === '/v1/headless-runs') {
    await handleHeadlessRun(config, request, response)
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
  copilotNode: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  if (isCopilotkitInfoDiscovery(request.method, url.pathname)) {
    await invokeCopilotNode(response, () => copilotNode(request, response))
    return
  }

  json(response, 404, { message: 'not found' })
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
    const mapped = mapModelError(error)
    json(response, mapped.retryable ? 503 : 400, { data: mapped.toJSON() })
  }
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
