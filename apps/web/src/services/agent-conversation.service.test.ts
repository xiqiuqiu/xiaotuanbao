import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/request', () => ({
  request: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import {
  listAgentConversations,
  sendAgentConversationMessage,
} from './agent-conversation.service'

describe('agent conversation service', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('lists history with search and cursor query params', async () => {
    get.mockResolvedValue({ items: [], nextCursor: null })
    await listAgentConversations({ q: '青城山', cursor: 'c1', includeArchived: true, limit: 2 })
    expect(get).toHaveBeenCalledWith('/agent/conversations', {
      params: { q: '青城山', includeArchived: true, cursor: 'c1', limit: 2 },
    })
  })

  it('sends the first message without a conversation id', async () => {
    post.mockResolvedValue({ conversationId: 'c-1', events: [], lastSequence: 1 })
    await sendAgentConversationMessage(null, { text: '你好' }, 'key-1')
    expect(post).toHaveBeenCalledWith(
      '/agent/conversations/messages',
      { text: '你好' },
      { silentError: true, headers: { 'Idempotency-Key': 'key-1' } },
    )
  })
})
