import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  AiCollaborationError,
  headlessExecutionIdentitySchema,
  headlessExecutionRequestSchema,
  headlessExecutionResultSchema,
  headlessRunFrameSchema,
  type HeadlessExecutionIdentity,
  type HeadlessExecutionRequest,
  type HeadlessExecutionResult,
  type HeadlessRunFrame,
  requestContextSchema,
  type RequestContext,
} from '@xiaotuanbao/ai-contracts'
import { runWithAssistRequestContext } from './assist-request-context'
import { fetchTaskContext } from './get-task-context.client'
import { json, readBearer, readHeader, statusForCollaborationError } from './http'
import { mapAgentFetchError, mapModelError } from './map-agent-error'

const AGENT_SERVICE_KEY_HEADER = 'x-agent-service-key'
const AI_OP_DELEGATION_TYP = 'ai-op-delegation'
const NDJSON_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8'
const HEADLESS_HEARTBEAT_MS = 10_000

export type HeadlessExecutor = (
  request: HeadlessExecutionRequest,
  options?: { signal?: AbortSignal },
) => Promise<HeadlessExecutionResult> | AsyncIterable<HeadlessRunFrame>

export interface HeadlessRunConfig {
  apiBaseUrl: string
  serviceSecret: string
  headlessExecutor?: HeadlessExecutor
}

export function createDeterministicAgentAdapter(
  outcome: HeadlessExecutionResult,
  options?: { messageDeltas?: string[] },
): HeadlessExecutor {
  const scripted = headlessExecutionResultSchema.parse(outcome)
  return async function* streamDeterministicRun(): AsyncIterable<HeadlessRunFrame> {
    yield { type: 'run.started' }
    const deltas =
      options?.messageDeltas ?? (scripted.kind === 'completed' ? [scripted.message] : [])
    let sequence = 1
    for (const text of deltas) {
      if (!text) {
        continue
      }
      yield { type: 'message.delta', sequence, text }
      sequence += 1
    }
    yield { type: 'run.completed', result: scripted }
  }
}

export async function collectHeadlessRun(
  run: Promise<HeadlessExecutionResult> | AsyncIterable<HeadlessRunFrame>,
): Promise<{ frames: HeadlessRunFrame[]; result: HeadlessExecutionResult }> {
  if (isAsyncIterable(run)) {
    const frames: HeadlessRunFrame[] = []
    let result: HeadlessExecutionResult | undefined
    for await (const frame of run) {
      const parsed = headlessRunFrameSchema.parse(frame)
      frames.push(parsed)
      if (parsed.type === 'run.completed') {
        result = parsed.result
      }
    }
    if (!result) {
      throw new Error('headless run ended without run.completed')
    }
    return { frames, result }
  }
  const result = headlessExecutionResultSchema.parse(await run)
  return {
    frames: [
      { type: 'run.started' },
      { type: 'run.completed', result },
    ],
    result,
  }
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
  if (
    createHash('sha256').update(parsedRequest.data.userText, 'utf8').digest('hex') !==
    parsedRequest.data.userTextSha256
  ) {
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
    if (bound.identity.taskId) {
      if (!bound.runId) {
        json(response, 401, { data: AiCollaborationError.fromCode('DELEGATION_INVALID').toJSON() })
        return
      }
      await fetchTaskContext(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        { taskId: bound.identity.taskId, runId: bound.runId },
      )
    }
  } catch (error) {
    const mapped = error instanceof AiCollaborationError ? error : mapAgentFetchError(error)
    json(response, statusForCollaborationError(mapped), { data: mapped.toJSON() })
    return
  }

  const executor = config.headlessExecutor
  if (!executor) {
    await writeNdjsonRun(request, response, async function* () {
      yield { type: 'run.started' as const }
      yield {
        type: 'run.completed' as const,
        result: {
          kind: 'failed' as const,
          error: AiCollaborationError.fromCode('AGENT_UNAVAILABLE').toJSON(),
        },
      }
    })
    return
  }

  const userText = parsedRequest.data.userText
  const requestContext = bound.requestContext

  try {
    await runWithAssistRequestContext({ delegationToken, ...requestContext }, () =>
      writeNdjsonRun(request, response, (signal) =>
        iterateHeadlessFrames(executor, { ...parsedRequest.data, userText }, signal),
      ),
    )
  } catch (error) {
    const mapped = error instanceof AiCollaborationError ? error : mapModelError(error)
    if (response.headersSent) {
      return
    }
    await writeNdjsonRun(request, response, async function* () {
      yield { type: 'run.started' as const }
      yield {
        type: 'run.completed' as const,
        result: { kind: 'failed' as const, error: mapped.toJSON() },
      }
    })
  }
}

function boundIdentitiesFromDelegation(
  payload: Record<string, unknown>,
): {
  identity: HeadlessExecutionIdentity
  runId?: string
  requestContext: RequestContext
} | null {
  const runId = optionalClaim(payload.runId)
  const taskId = optionalClaim(payload.taskId)
  const organizationId = stringClaim(payload.organizationId)
  const userId = stringClaim(payload.sub)
  if (Boolean(taskId) !== Boolean(runId)) {
    return null
  }
  const parsed = headlessExecutionIdentitySchema.safeParse({
    ...(taskId ? { taskId } : {}),
    conversationId: stringClaim(payload.conversationId),
    inputBatchId: stringClaim(payload.inputBatchId),
    attemptId: stringClaim(payload.attemptId),
    contextManifestId: stringClaim(payload.contextManifestId),
  })
  const requestContext = requestContextSchema.safeParse({
    organizationId,
    userId,
    ...(taskId ? { taskId } : {}),
    ...(runId ? { runId } : {}),
    conversationId: stringClaim(payload.conversationId),
    inputBatchId: stringClaim(payload.inputBatchId),
    attemptId: stringClaim(payload.attemptId),
    contextManifestId: stringClaim(payload.contextManifestId),
    agentDefinition: payload.agentDefinition,
    grantedCapabilities: payload.grantedCapabilities,
    entitlementStatus: payload.entitlementStatus,
    objectScopes: payload.objectScopes,
  })
  if (!parsed.success || !requestContext.success) {
    return null
  }
  return { identity: parsed.data, ...(runId ? { runId } : {}), requestContext: requestContext.data }
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

function optionalClaim(value: unknown): string | undefined {
  const claimed = stringClaim(value)
  return claimed.length > 0 ? claimed : undefined
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

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return Boolean(value && typeof value === 'object' && Symbol.asyncIterator in value)
}

async function* iterateHeadlessFrames(
  executor: HeadlessExecutor,
  request: HeadlessExecutionRequest,
  signal?: AbortSignal,
): AsyncIterable<HeadlessRunFrame> {
  const output = executor(request, { signal })
  if (isAsyncIterable<HeadlessRunFrame>(output)) {
    yield* output
    return
  }
  yield { type: 'run.started' }
  const result = headlessExecutionResultSchema.parse(await output)
  yield { type: 'run.completed', result }
}

async function writeNdjsonRun(
  request: IncomingMessage,
  response: ServerResponse,
  frames:
    | ((signal: AbortSignal) => AsyncIterable<HeadlessRunFrame> | Promise<AsyncIterable<HeadlessRunFrame>>)
    | (() => AsyncIterable<HeadlessRunFrame> | Promise<AsyncIterable<HeadlessRunFrame>>),
): Promise<void> {
  if (response.headersSent) {
    return
  }
  response.writeHead(200, {
    'Content-Type': NDJSON_CONTENT_TYPE,
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
  if (typeof response.flushHeaders === 'function') {
    response.flushHeaders()
  }

  const abort = new AbortController()
  const onClose = () => abort.abort()
  request.once('close', onClose)

  let writeChain = Promise.resolve()
  const writeFrame = (frame: HeadlessRunFrame) => {
    writeChain = writeChain.then(() => writeNdjsonLine(response, frame))
    return writeChain
  }

  let lastWriteAt = Date.now()
  const heartbeat = setInterval(() => {
    if (abort.signal.aborted || response.writableEnded) {
      return
    }
    if (Date.now() - lastWriteAt >= HEADLESS_HEARTBEAT_MS) {
      lastWriteAt = Date.now()
      void writeFrame({ type: 'run.heartbeat' })
    }
  }, 1_000)

  try {
    const iterable = await frames(abort.signal)
    for await (const frame of iterable) {
      if (abort.signal.aborted || response.writableEnded) {
        break
      }
      const parsed = headlessRunFrameSchema.safeParse(frame)
      if (!parsed.success) {
        continue
      }
      lastWriteAt = Date.now()
      await writeFrame(parsed.data)
      if (parsed.data.type === 'run.completed') {
        break
      }
    }
    await writeChain
  } catch (error) {
    const mapped = error instanceof AiCollaborationError ? error : mapModelError(error)
    await writeFrame({
      type: 'run.completed',
      result: { kind: 'failed', error: mapped.toJSON() },
    })
    await writeChain
  } finally {
    clearInterval(heartbeat)
    request.off('close', onClose)
    if (!response.writableEnded) {
      response.end()
    }
  }
}

function writeNdjsonLine(response: ServerResponse, frame: HeadlessRunFrame): Promise<void> {
  if (response.writableEnded) {
    return Promise.resolve()
  }
  const line = `${JSON.stringify(frame)}\n`
  if (response.write(line)) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    response.once('drain', resolve)
  })
}
