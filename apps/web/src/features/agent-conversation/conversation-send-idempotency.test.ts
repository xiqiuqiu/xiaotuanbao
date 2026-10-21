import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => { sessionStorage.clear(); vi.resetModules() })

it('keeps the same failed request identity across a reload and releases it after acceptance', async () => {
  const first = await import('./conversation-send-idempotency')
  const key = first.pendingSendKey('user:new', { text: '同一次发送' })
  vi.resetModules()
  const reloaded = await import('./conversation-send-idempotency')
  expect(reloaded.pendingSendKey('user:new', { text: '同一次发送' })).toBe(key)
  reloaded.clearPendingSendKey('user:new', key)
  expect(reloaded.pendingSendKey('user:new', { text: '同一次发送' })).not.toBe(key)
})

it('separates edits, file identities, actors and business context', async () => {
  const { pendingSendKey } = await import('./conversation-send-idempotency')
  const file = new File(['a'], '资料.txt')
  const original = { text: '相同文字', files: [file], pageLocator: { kind: 'departure' as const, objectId: 'dep-1' } }
  const key = pendingSendKey('user:new', original)
  expect(pendingSendKey('user:new', original)).toBe(key)
  expect(pendingSendKey('other-user:new', original)).not.toBe(key)
  expect(pendingSendKey('user:new', { ...original, text: '修正后的指令' })).not.toBe(key)
  expect(pendingSendKey('user:new', { ...original, files: [new File(['b'], '资料.txt')] })).not.toBe(key)
  expect(pendingSendKey('user:new', { ...original, pageLocator: { kind: 'departure', objectId: 'dep-2' } })).not.toBe(key)
})

it('explicitly starting another blank conversation discards the old request identity', async () => {
  const { pendingSendKey } = await import('./conversation-send-idempotency')
  const { useAgentConversationStore } = await import('./agent-conversation.store')
  const key = pendingSendKey('anonymous:new', { text: '同样文字的新会话' })
  useAgentConversationStore.getState().startNewConversation()
  expect(pendingSendKey('anonymous:new', { text: '同样文字的新会话' })).not.toBe(key)
})

it('clears pending request identities on session reset', async () => {
  const { pendingSendKey } = await import('./conversation-send-idempotency')
  const { useAgentConversationStore } = await import('./agent-conversation.store')
  const key = pendingSendKey('user:c-1', { text: '退出登录前的指令' })
  useAgentConversationStore.getState().reset()
  expect(sessionStorage.getItem('conversation-pending-send:user:c-1')).toBeNull()
  expect(pendingSendKey('user:c-1', { text: '退出登录前的指令' })).not.toBe(key)
})
