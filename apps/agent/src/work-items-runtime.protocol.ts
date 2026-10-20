import { createServer } from 'node:http'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestContextSchema } from '@xiaotuanbao/ai-contracts'
import { AI_CREATE_AGENT_ID, createAiCreateMastraFromDefinition } from './agent-factory'

for (const longToolChain of [false, true]) test(`production loop completes the ledger (beyond SDK default step budget: ${longToolChain})`, async () => {
  const question = { id: 'steps', request: '用三句话说明业务步骤', goal: 'answer' }
  const answer = '先建团。再录入客源与资源。最后核对应收应付。'
  const pending = { items: [{ ...question, resolution: { kind: 'pending' } }] }
  const replies = longToolChain ? [
    ...Array.from({ length: 5 }, () => pending),
    { items: [{ ...question, resolution: { kind: 'answered', message: answer } }] },
    answer,
  ] : [
    { items: [{ ...question, resolution: { kind: 'pending' } }] },
    '我会继续整理。',
    { items: [{ ...question, resolution: { kind: 'answered', message: answer } }] },
    answer,
  ]
  const requests: Array<{ messages: unknown[] }> = []
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      requests.push(JSON.parse(Buffer.concat(chunks).toString()))
      const reply = replies[requests.length - 1]
      const toolCall = typeof reply === 'object'
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({
        id: `completion-${requests.length}`, object: 'chat.completion', created: 1, model: 'deepseek-v4-flash',
        choices: [{ index: 0, finish_reason: toolCall ? 'tool_calls' : 'stop', message: {
          role: 'assistant', content: toolCall ? null : reply,
          ...(toolCall ? { tool_calls: [{ id: `record-${requests.length}`, type: 'function',
            function: { name: 'recordWorkItems', arguments: JSON.stringify(reply) } }] } : {}),
        } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }))
    })().catch(() => { response.writeHead(500); response.end() })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test provider unavailable')
  try {
    const mastra = createAiCreateMastraFromDefinition({
      apiBaseUrl: 'http://api.local', serviceSecret: 'fixture-only', currentUserText: question.request,
      model: 'deepseek/deepseek-v4-flash', modelThinking: 'disabled',
      modelBaseUrl: `http://127.0.0.1:${address.port}/v1`, modelApiKey: 'fixture-only',
    }, requestContextSchema.parse({
      organizationId: 'org-1', userId: 'user-1', conversationId: 'conversation-1', inputBatchId: 'batch-1',
      attemptId: 'attempt-1', contextManifestId: 'manifest-1', executionGoal: 'resolve_items',
      agentDefinition: { key: 'conversation.general', version: 1 }, grantedCapabilities: [],
      entitlementStatus: 'unavailable', objectScopes: [{ organizationId: 'org-1', kind: 'agent_conversation', id: 'conversation-1' }],
    }))
    const result = await mastra.getAgent(AI_CREATE_AGENT_ID).generate(question.request)
    assert.equal(result.text, answer)
    assert.equal(requests.length, replies.length)
    if (!longToolChain) assert.match(JSON.stringify(requests[2]!.messages), /ITEM_UNRESOLVED/)
    assert.equal(result.tripwire, undefined)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
