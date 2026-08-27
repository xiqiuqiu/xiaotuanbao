import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()

vi.mock('@/lib/request', () => ({
  request: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    patch: vi.fn(),
    put: (...args: unknown[]) => put(...args),
    delete: vi.fn(),
  },
}))

import {
  listAgentConversations,
  saveAgentConversationDraft,
  sendAgentConversationText,
  stopAgentConversationBatch,
} from './agent-conversation.service'

describe('agent conversation service', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    put.mockReset()
  })

  it('lists history with search and cursor query params', async () => {
    get.mockResolvedValue({ items: [], nextCursor: null })
    await listAgentConversations({ q: '青城山', cursor: 'c1', includeArchived: true, limit: 2 })
    expect(get).toHaveBeenCalledWith('/agent/conversations', {
      params: { q: '青城山', includeArchived: true, cursor: 'c1', limit: 2 },
    })
  })

  it('saves a taskless conversation draft by conversation id', async () => {
    put.mockResolvedValue({ conversationId: 'c-1', text: '未发送', draftEpoch: 0, revision: 1 })
    await saveAgentConversationDraft('c-1', { text: '未发送', draftEpoch: 0 })
    expect(put).toHaveBeenCalledWith(
      '/agent/conversations/c-1/draft',
      { text: '未发送', draftEpoch: 0 },
      { silentError: true },
    )
  })

  it('sends the first message without a conversation id', async () => {
    post.mockResolvedValue({ conversationId: 'c-1', events: [], lastSequence: 1 })
    await sendAgentConversationText(null, { text: '你好' }, 'key-1')
    expect(post).toHaveBeenCalledWith(
      '/agent/conversations/messages',
      { text: '你好' },
      { silentError: true, headers: { 'Idempotency-Key': 'key-1' } },
    )
  })

  it('sends an attached page locator only when present', async () => {
    post.mockResolvedValue({ conversationId: 'c-1', events: [], lastSequence: 1 })
    await sendAgentConversationText(
      'c-1',
      {
        text: '查一下账款',
        pageLocator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
      },
      'key-2',
    )
    expect(post).toHaveBeenCalledWith(
      '/agent/conversations/c-1/messages',
      {
        text: '查一下账款',
        pageLocator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
      },
      { silentError: true, headers: { 'Idempotency-Key': 'key-2' } },
    )
  })

  it('sends a selected departure-creation task as the primary candidate', async () => {
    post.mockResolvedValue({ conversationId: 'c-1', events: [], lastSequence: 1 })
    await sendAgentConversationText(
      'c-1',
      { text: '继续建团', primaryTaskId: 'task-1' },
      'key-3',
    )
    expect(post).toHaveBeenCalledWith(
      '/agent/conversations/c-1/messages',
      { text: '继续建团', primaryTaskId: 'task-1' },
      { silentError: true, headers: { 'Idempotency-Key': 'key-3' } },
    )
  })

  it('stops the current batch with an idempotency key', async () => {
    post.mockResolvedValue({ conversationId: 'c-1', events: [], lastSequence: 3 })
    await stopAgentConversationBatch('c-1', 'batch-1', 'key-stop')
    expect(post).toHaveBeenCalledWith(
      '/agent/conversations/c-1/batches/batch-1/stop',
      {},
      { silentError: true, headers: { 'Idempotency-Key': 'key-stop' } },
    )
  })
})
