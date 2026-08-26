import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ConfigService } from '@nestjs/config'
import { AiHeadlessClient } from './ai-headless.client'

const identity = {
  taskId: 'task-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
}

const request = {
  ...identity,
  userText: '帮我建一个喀纳斯3日团',
  userTextSha256: 'a'.repeat(64),
}

describe('AiHeadlessClient.run', () => {
  let server: Server | undefined

  afterEach(async () => {
    const current = server
    server = undefined
    if (!current) {
      return
    }
    await new Promise<void>((resolve, reject) => {
      current.closeAllConnections()
      current.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('aborts a hung downstream fetch and returns AGENT_UNAVAILABLE', async () => {
    server = createServer(() => {
      // Intentionally never respond — the worker must not wait indefinitely.
    })
    const origin = await listen(server)
    const client = createClient({
      'app.aiCreateAssist.agentInternalUrl': origin,
      'app.aiCreateAssist.agentServiceSecret': 'secret',
      'app.aiCreateAssist.runTimeoutMs': 80,
    })

    const started = Date.now()
    const result = await client.run(request, 'delegation-token')
    const elapsedMs = Date.now() - started

    expect(result).toEqual({
      kind: 'failed',
      error: {
        code: 'AGENT_UNAVAILABLE',
        message: 'AI 辅助暂时不可用，请稍后重试或继续使用表单',
        retryable: true,
      },
    })
    expect(elapsedMs).toBeLessThan(1_500)
  }, 3_000)

  it('aborts when response headers arrive but the body never finishes', async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    })
    const origin = await listen(server)
    const client = createClient({
      'app.aiCreateAssist.agentInternalUrl': origin,
      'app.aiCreateAssist.agentServiceSecret': 'secret',
      'app.aiCreateAssist.runTimeoutMs': 80,
    })

    const started = Date.now()
    const result = await client.run(request, 'delegation-token')
    const elapsedMs = Date.now() - started

    expect(result).toEqual({
      kind: 'failed',
      error: {
        code: 'AGENT_UNAVAILABLE',
        message: 'AI 辅助暂时不可用，请稍后重试或继续使用表单',
        retryable: true,
      },
    })
    expect(elapsedMs).toBeLessThan(1_500)
  }, 3_000)

  it('still returns a completed result when the agent responds in time', async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ data: { kind: 'completed', message: '已整理当前资料。' } }))
    })
    const origin = await listen(server)
    const client = createClient({
      'app.aiCreateAssist.agentInternalUrl': origin,
      'app.aiCreateAssist.agentServiceSecret': 'secret',
      'app.aiCreateAssist.runTimeoutMs': 1_000,
    })

    await expect(client.run(request, 'delegation-token')).resolves.toEqual({
      kind: 'completed',
      message: '已整理当前资料。',
    })
  })

  it('parses NDJSON message.delta frames and still awaits the terminal result', async () => {
    const deltas: string[] = []
    server = createServer((_incoming, response) => {
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' })
      response.write(`${JSON.stringify({ type: 'run.started' })}\n`)
      response.write(
        `${JSON.stringify({ type: 'message.delta', sequence: 1, text: '已' })}\n`,
      )
      response.write(
        `${JSON.stringify({ type: 'message.delta', sequence: 2, text: '整理当前资料。' })}\n`,
      )
      response.end(
        `${JSON.stringify({
          type: 'run.completed',
          result: { kind: 'completed', message: '已整理当前资料。' },
        })}\n`,
      )
    })
    const origin = await listen(server)
    const client = createClient({
      'app.aiCreateAssist.agentInternalUrl': origin,
      'app.aiCreateAssist.agentServiceSecret': 'secret',
      'app.aiCreateAssist.runTimeoutMs': 1_000,
    })

    await expect(
      client.run(request, 'delegation-token', {
        onPublicText: (text) => {
          deltas.push(text)
        },
      }),
    ).resolves.toEqual({
      kind: 'completed',
      message: '已整理当前资料。',
    })
    expect(deltas).toEqual(['已', '已整理当前资料。'])
  })

  it('ignores tool-shaped frames while still returning the completed result', async () => {
    server = createServer((_incoming, response) => {
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' })
      response.write(`${JSON.stringify({ type: 'run.started' })}\n`)
      response.write(
        `${JSON.stringify({
          type: 'tool.call',
          name: 'proposeReviewPackage',
          args: { secret: 'must-not-surface' },
        })}\n`,
      )
      response.write(
        `${JSON.stringify({ type: 'message.delta', sequence: 1, text: '已整理当前资料。' })}\n`,
      )
      response.end(
        `${JSON.stringify({
          type: 'run.completed',
          result: { kind: 'completed', message: '已整理当前资料。' },
        })}\n`,
      )
    })
    const origin = await listen(server)
    const client = createClient({
      'app.aiCreateAssist.agentInternalUrl': origin,
      'app.aiCreateAssist.agentServiceSecret': 'secret',
      'app.aiCreateAssist.runTimeoutMs': 1_000,
    })
    await expect(client.run(request, 'delegation-token')).resolves.toEqual({
      kind: 'completed',
      message: '已整理当前资料。',
    })
  })

  it('treats headless 5xx as retryable AGENT_UNAVAILABLE', async () => {
    server = createServer((_request, response) => {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ message: 'unavailable' }))
    })
    const origin = await listen(server)
    const client = createClient({
      'app.aiCreateAssist.agentInternalUrl': origin,
      'app.aiCreateAssist.agentServiceSecret': 'secret',
      'app.aiCreateAssist.runTimeoutMs': 1_000,
    })
    await expect(client.run(request, 'delegation-token')).resolves.toEqual({
      kind: 'failed',
      error: {
        code: 'AGENT_UNAVAILABLE',
        message: 'AI 辅助暂时不可用，请稍后重试或继续使用表单',
        retryable: true,
      },
    })
  })

  it('treats headless 4xx as non-retryable INVALID_FORMAT', async () => {
    server = createServer((_request, response) => {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ message: 'bad request' }))
    })
    const origin = await listen(server)
    const client = createClient({
      'app.aiCreateAssist.agentInternalUrl': origin,
      'app.aiCreateAssist.agentServiceSecret': 'secret',
      'app.aiCreateAssist.runTimeoutMs': 1_000,
    })
    await expect(client.run(request, 'delegation-token')).resolves.toEqual({
      kind: 'failed',
      error: {
        code: 'INVALID_FORMAT',
        message: '模型输出格式异常，本轮未形成任何候选',
        retryable: false,
      },
    })
  })

  it('posts the assembled User plaintext with the execution identity', async () => {
    let posted: unknown
    server = createServer((incoming, response) => {
      void (async () => {
        const chunks: Buffer[] = []
        for await (const chunk of incoming) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        posted = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ data: { kind: 'completed', message: '已整理当前资料。' } }))
      })()
    })
    const origin = await listen(server)
    const client = createClient({
      'app.aiCreateAssist.agentInternalUrl': origin,
      'app.aiCreateAssist.agentServiceSecret': 'secret',
      'app.aiCreateAssist.runTimeoutMs': 1_000,
    })

    await client.run(request, 'delegation-token')
    expect(posted).toEqual(request)
  })
})

function createClient(values: Record<string, unknown>): AiHeadlessClient {
  const configService = {
    get: (key: string) => values[key],
  } as Pick<ConfigService, 'get'>
  return new AiHeadlessClient(configService as ConfigService)
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null
      if (!address) {
        reject(new Error('headless test server did not bind a port'))
        return
      }
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}
