/**
 * Protocol check: DeepSeek Chat Completions body must carry thinking.type=disabled
 * on the first request and the tool-loop continuation.
 *
 * Jest cannot load real Mastra (ESM p-map). This file is run by `tsx --test`.
 * It does not inspect Agent providerOptions objects, credentials, or Authorization.
 *
 * tsx loads @xiaotuanbao/ai-contracts from dist (CJS). Rebuild that package before this file.
 */
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'
import { test } from 'node:test'
import {
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  CONVERSATION_ROUTING_CAPABILITY_REF,
  DEPARTURE_CREATION_ROUTING_DECISION,
  PUBLIC_REPLY_FALLBACK,
  requestContextSchema,
} from '@xiaotuanbao/ai-contracts'
import { AI_CREATE_AGENT_ID, createAiCreateMastraFromDefinition } from './agent-factory'
import { collectHeadlessRun } from './headless-execution'
import { createMastraHeadlessExecutor } from './mastra-headless.executor'

const IDENTITY = {
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  userText: '帮我建一个喀纳斯3日团',
  userTextSha256: 'a'.repeat(64),
}

const TOOL_CALL_ID = 'call_route_conversation'
const TOOL_ARGS = JSON.stringify({
  decision: DEPARTURE_CREATION_ROUTING_DECISION,
  goal: '帮我建一个喀纳斯3日团',
})
const CLARIFY_ARGS = JSON.stringify({
  decision: 'request_clarification',
  prompt: '请补充出团日期和人数。',
})
const SOLILOQUY = '用户要建喀纳斯三日团。我先核团名、出团日期和人数，再决定是否提交审核建议。'
const FINAL_REPLY = '已登记建团目标。'
const CLARIFY_PROMPT = '请补充出团日期和人数。'

const routingContext = requestContextSchema.parse({
  organizationId: 'org-1',
  userId: 'user-1',
  conversationId: IDENTITY.conversationId,
  inputBatchId: IDENTITY.inputBatchId,
  attemptId: IDENTITY.attemptId,
  contextManifestId: IDENTITY.contextManifestId,
  agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  grantedCapabilities: [CONVERSATION_ROUTING_CAPABILITY_REF],
  entitlementStatus: 'unavailable',
  objectScopes: [{ organizationId: 'org-1', kind: 'agent_conversation', id: IDENTITY.conversationId }],
})

type CapturedChatBody = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasToolResult(messages: unknown): boolean {
  if (!Array.isArray(messages)) {
    return false
  }
  return messages.some((message) => {
    if (!isRecord(message)) {
      return false
    }
    if (message.role === 'tool') {
      return true
    }
    if (!Array.isArray(message.content)) {
      return false
    }
    return message.content.some(
      (part) => isRecord(part) && (part.type === 'tool-result' || part.type === 'function_call_output'),
    )
  })
}

function sse(events: unknown[]): string {
  return `${[...events.map((event) => `data: ${JSON.stringify(event)}`), 'data: [DONE]'].join('\n\n')}\n\n`
}

function chatChunk(delta: Record<string, unknown>, finishReason: string | null = null) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1_704_000_000,
    model: 'deepseek-chat',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

function toolCallSse(args: string, content = SOLILOQUY): string {
  return sse([
    chatChunk({
      role: 'assistant',
      content,
      tool_calls: [
        {
          index: 0,
          id: TOOL_CALL_ID,
          type: 'function',
          function: { name: 'routeConversation', arguments: args },
        },
      ],
    }),
    chatChunk({}, 'tool_calls'),
  ])
}

function textReplySse(content: string): string {
  return sse([chatChunk({ role: 'assistant', content }), chatChunk({}, 'stop')])
}

async function readJsonBody(request: IncomingMessage): Promise<CapturedChatBody> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (!isRecord(parsed)) {
    throw new Error('chat completions body must be a JSON object')
  }
  return parsed
}

async function listenMockDeepSeek(script: { firstRound: string; laterRound: string }) {
  const bodies: CapturedChatBody[] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://deepseek.local')
      if (request.method !== 'POST' || !url.pathname.endsWith('/chat/completions')) {
        response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: { message: `unexpected ${request.method} ${url.pathname}` } }))
        return
      }
      const body = await readJsonBody(request)
      bodies.push(body)
      const payload = hasToolResult(body.messages) ? script.laterRound : script.firstRound
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      response.end(payload)
    })().catch((error: unknown) => {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : 'mock failed' } }))
      } else if (!response.writableEnded) {
        response.end()
      }
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return {
    bodies,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

function livePublicText(frames: Awaited<ReturnType<typeof collectHeadlessRun>>['frames']): string {
  return frames
    .filter((frame) => frame.type === 'message.delta')
    .map((frame) => frame.text)
    .join('')
}

async function runAgainstMock(script: { firstRound: string; laterRound: string }) {
  const mock = await listenMockDeepSeek(script)
  try {
    const mastra = createAiCreateMastraFromDefinition(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'test-only',
        modelApiKey: 'test-only-not-a-secret',
        model: 'deepseek/deepseek-chat',
        modelBaseUrl: mock.baseUrl,
        modelThinking: 'disabled',
      },
      routingContext,
    )
    const executor = createMastraHeadlessExecutor({
      readUserText: async (request) => request.userText,
      stream: (userText, signal) =>
        mastra.getAgent(AI_CREATE_AGENT_ID).stream(userText, {
          abortSignal: signal,
          maxSteps: 5,
        }),
    })
    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    return { mock, frames, result }
  } catch (error) {
    await mock.close()
    throw error
  }
}

test('sends thinking.type=disabled and keeps tool-step soliloquy off the public reply', async () => {
  const { mock, frames, result } = await runAgainstMock({
    firstRound: toolCallSse(TOOL_ARGS),
    laterRound: textReplySse(FINAL_REPLY),
  })
  try {
    assert.equal(mock.bodies.length, 2)
    assert.equal(hasToolResult(mock.bodies[0]?.messages), false)
    assert.equal(hasToolResult(mock.bodies[1]?.messages), true)
    for (const [index, body] of mock.bodies.entries()) {
      assert.deepEqual(
        body.thinking,
        { type: 'disabled' },
        `round ${index + 1} request body must include thinking.type=disabled`,
      )
    }

    const livePublic = livePublicText(frames)
    assert.equal(livePublic, FINAL_REPLY)
    assert.equal(livePublic.includes(SOLILOQUY), false)
    assert.equal(result.kind, 'registered_intent')
    if (result.kind === 'registered_intent') {
      assert.equal(result.message, FINAL_REPLY)
      assert.equal(result.message.includes(SOLILOQUY), false)
    }
  } finally {
    await mock.close()
  }
})

test('does not publish tool-step soliloquy when routing asks a clarification', async () => {
  const { mock, frames, result } = await runAgainstMock({
    firstRound: toolCallSse(CLARIFY_ARGS),
    laterRound: textReplySse(''),
  })
  try {
    assert.ok(mock.bodies.length >= 1)
    for (const [index, body] of mock.bodies.entries()) {
      assert.deepEqual(
        body.thinking,
        { type: 'disabled' },
        `round ${index + 1} request body must include thinking.type=disabled`,
      )
    }
    assert.equal(result.kind, 'awaiting_user_input')
    if (result.kind === 'awaiting_user_input') {
      assert.equal(result.interaction.prompt, CLARIFY_PROMPT)
    }
    assert.equal(livePublicText(frames), '')
    assert.equal(JSON.stringify(frames).includes(SOLILOQUY), false)
  } finally {
    await mock.close()
  }
})

test('uses the generic completion line when the final no-tool step is empty', async () => {
  const { mock, frames, result } = await runAgainstMock({
    firstRound: toolCallSse(TOOL_ARGS),
    laterRound: textReplySse(''),
  })
  try {
    assert.equal(mock.bodies.length, 2)
    assert.equal(result.kind, 'registered_intent')
    if (result.kind === 'registered_intent') {
      assert.equal(result.message, PUBLIC_REPLY_FALLBACK)
      assert.equal(result.message.includes(SOLILOQUY), false)
    }
    assert.equal(livePublicText(frames), PUBLIC_REPLY_FALLBACK)
    assert.equal(JSON.stringify(frames).includes(SOLILOQUY), false)
  } finally {
    await mock.close()
  }
})
