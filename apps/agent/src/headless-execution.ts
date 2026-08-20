import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  AiCollaborationError,
  headlessExecutionIdentitySchema,
  headlessExecutionRequestSchema,
  headlessExecutionResultSchema,
  type HeadlessExecutionIdentity,
  type HeadlessExecutionRequest,
  type HeadlessExecutionResult,
} from '@xiaotuanbao/ai-contracts'
import { runWithAssistRequestContext } from './assist-request-context'
import { fetchTaskContext } from './get-task-context.client'
import { json, readBearer, readHeader, statusForCollaborationError } from './http'
import { mapAgentFetchError, mapModelError } from './map-agent-error'

const AGENT_SERVICE_KEY_HEADER = 'x-agent-service-key'
const AI_OP_DELEGATION_TYP = 'ai-op-delegation'

export type HeadlessExecutor = (
  request: HeadlessExecutionRequest,
) => Promise<HeadlessExecutionResult>

export interface HeadlessRunConfig {
  apiBaseUrl: string
  serviceSecret: string
  headlessExecutor?: HeadlessExecutor
}

export function createDeterministicAgentAdapter(
  outcome: HeadlessExecutionResult,
): HeadlessExecutor {
  const scripted = headlessExecutionResultSchema.parse(outcome)
  return async () => scripted
}

export function loadDeterministicAgentAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HeadlessExecutor | undefined {
  if (env.AGENT_HEADLESS_ADAPTER !== 'deterministic') {
    return undefined
  }
  const raw = env.AGENT_HEADLESS_OUTCOME?.trim() ?? ''
  if (!raw) {
    return createDeterministicAgentAdapter({
      kind: 'failed',
      error: AiCollaborationError.fromCode('AGENT_UNAVAILABLE').toJSON(),
    })
  }
  return createDeterministicAgentAdapter(headlessExecutionResultSchema.parse(JSON.parse(raw)))
}

export async function handleHeadlessRun(
  config: HeadlessRunConfig,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'POST') {
    json(response, 404, { message: 'not found' })
    return
  }

  if (!serviceKeyMatches(request, config.serviceSecret)) {
    json(response, 403, { data: AiCollaborationError.fromCode('SERVICE_IDENTITY_INVALID').toJSON() })
    return
  }

  const delegationToken = readBearer(request)
  if (!delegationToken) {
    json(response, 401, { data: AiCollaborationError.fromCode('DELEGATION_INVALID').toJSON() })
    return
  }

  const payload = decodeJwtPayload(delegationToken)
  if (!payload || !isAiOperationDelegation(payload)) {
    json(response, 401, { data: AiCollaborationError.fromCode('DELEGATION_INVALID').toJSON() })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(request)
  } catch {
    json(response, 400, { data: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON() })
    return
  }

  const parsedRequest = headlessExecutionRequestSchema.safeParse(body)
  if (!parsedRequest.success) {
    json(response, 400, { data: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON() })
    return
  }

  const bound = boundIdentitiesFromDelegation(payload)
  if (
    !bound ||
    !identitiesMatch(headlessExecutionIdentitySchema.parse(parsedRequest.data), bound.identity)
  ) {
    json(response, 401, { data: AiCollaborationError.fromCode('DELEGATION_INVALID').toJSON() })
    return
  }

  try {
    await fetchTaskContext(
      {
        apiBaseUrl: config.apiBaseUrl,
        serviceSecret: config.serviceSecret,
        delegationToken,
      },
      { taskId: parsedRequest.data.taskId, runId: bound.runId },
    )
  } catch (error) {
    const mapped = error instanceof AiCollaborationError ? error : mapAgentFetchError(error)
    json(response, statusForCollaborationError(mapped), { data: mapped.toJSON() })
    return
  }

  const executor = config.headlessExecutor
  if (!executor) {
    json(response, 200, {
      data: {
        kind: 'failed',
        error: AiCollaborationError.fromCode('AGENT_UNAVAILABLE').toJSON(),
      },
    })
    return
  }

  const userText = parsedRequest.data.userText

  try {
    const result = await runWithAssistRequestContext(
      {
        delegationToken,
        taskId: parsedRequest.data.taskId,
        runId: bound.runId,
        conversationId: parsedRequest.data.conversationId,
        inputBatchId: parsedRequest.data.inputBatchId,
        attemptId: parsedRequest.data.attemptId,
        contextManifestId: parsedRequest.data.contextManifestId,
      },
      () => executor({ ...parsedRequest.data, userText }),
    )
    const parsedResult = headlessExecutionResultSchema.safeParse(result)
    if (!parsedResult.success) {
      json(response, 200, {
        data: {
          kind: 'failed',
          error: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON(),
        },
      })
      return
    }
    json(response, 200, { data: parsedResult.data })
  } catch (error) {
    const mapped = error instanceof AiCollaborationError ? error : mapModelError(error)
    json(response, 200, { data: { kind: 'failed', error: mapped.toJSON() } })
  }
}

function boundIdentitiesFromDelegation(
  payload: Record<string, unknown>,
): { identity: HeadlessExecutionIdentity; runId: string } | null {
  const runId = stringClaim(payload.runId)
  const parsed = headlessExecutionIdentitySchema.safeParse({
    taskId: stringClaim(payload.taskId),
    conversationId: stringClaim(payload.conversationId),
    inputBatchId: stringClaim(payload.inputBatchId),
    attemptId: stringClaim(payload.attemptId),
    contextManifestId: stringClaim(payload.contextManifestId),
  })
  if (!parsed.success || !runId) {
    return null
  }
  return { identity: parsed.data, runId }
}

function identitiesMatch(
  left: HeadlessExecutionIdentity,
  right: HeadlessExecutionIdentity,
): boolean {
  return (
    left.taskId === right.taskId &&
    left.conversationId === right.conversationId &&
    left.inputBatchId === right.inputBatchId &&
    left.attemptId === right.attemptId &&
    left.contextManifestId === right.contextManifestId
  )
}

function isAiOperationDelegation(payload: Record<string, unknown>): boolean {
  if (payload.typ !== AI_OP_DELEGATION_TYP) {
    return false
  }
  const { aud } = payload
  return aud === AI_OP_DELEGATION_TYP || (Array.isArray(aud) && aud.includes(AI_OP_DELEGATION_TYP))
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function stringClaim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function serviceKeyMatches(request: IncomingMessage, expected: string): boolean {
  const provided = readHeader(request, AGENT_SERVICE_KEY_HEADER)
  if (!expected) {
    return false
  }
  const leftHash = createHash('sha256').update(provided).digest()
  const rightHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(leftHash, rightHash)
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    return {}
  }
  return JSON.parse(raw) as unknown
}
