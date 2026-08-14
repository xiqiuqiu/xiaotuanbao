import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2'
import { createCopilotNodeHandler } from '@copilotkit/runtime/v2/node'
import { MastraAgent } from '@ag-ui/mastra'
import { getAssistRequestContext, runWithAssistRequestContext } from './assist-request-context'
import { fetchTaskContext } from './get-task-context.client'
import {
  handleHeadlessRun,
  loadDeterministicAgentAdapterFromEnv,
  type HeadlessExecutor,
} from './headless-execution'
import { json, readBearer, readHeader, statusForCollaborationError } from './http'
import { createAiCreateMastra, AI_CREATE_AGENT_ID } from './mastra-agent'
import { createMastraHeadlessExecutor } from './mastra-headless.executor'
import { mapAgentFetchError, mapModelError } from './map-agent-error'

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

const AI_CREATE_TOOLS = ['getTaskContext', 'searchRouteTemplates', 'submitReviewPackage'] as const
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
  const headlessExecutor =
    config.headlessExecutor ??
    loadDeterministicAgentAdapterFromEnv() ??
    createMastraHeadlessExecutor({
      async readUserText() {
        const context = getAssistRequestContext()
        const output = await fetchTaskContext(
          {
            apiBaseUrl: config.apiBaseUrl,
            serviceSecret: config.serviceSecret,
            delegationToken: context.delegationToken,
          },
          { taskId: context.taskId, runId: context.runId },
        )
        return output.currentUserMessage?.trim() ?? ''
      },
      generate: (userText) => mastra.getAgent(AI_CREATE_AGENT_ID).generate(userText),
    })

  return createServer((request, response) => {
    void handleRequest({ ...config, headlessExecutor }, copilotNode, request, response)
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
