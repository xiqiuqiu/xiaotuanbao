import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAgentConversationDraft, readPendingConversationDraft } from './use-agent-conversation-draft'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'

const save = vi.fn()
vi.mock('@/services/agent-conversation.service', () => ({
  saveAgentConversationDraft: (...args: unknown[]) => save(...args),
}))
beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  useAgentConversationRuntimeStore.getState().clear()
  save.mockReset().mockImplementation(() => new Promise(() => {}))
})
afterEach(() => { cleanup(); vi.useRealTimers(); sessionStorage.clear() })

it.each(['立即刷新前的新材料', ''])('restores an unsaved local draft after immediate reload, including intentional deletion: %s', (text) => {
  useAgentConversationRuntimeStore.getState().hydrate({ conversationId: 'conv-1', draftEpoch: 4, revision: 7 })
  const first = renderHook(() => useAgentConversationDraft('conv-1'))
  act(() => first.result.current.updateDraft(text))
  expect(readPendingConversationDraft('conv-1')?.text).toBe(text)
  first.unmount()
  useAgentConversationRuntimeStore.getState().clear()
  renderHook(() => useAgentConversationDraft('conv-1'))
  expect(useAgentConversationRuntimeStore.getState().draft).toBe(text)
  expect(useAgentConversationRuntimeStore.getState().draftEpoch).toBe(4)
})

it('clears the local backup only once the server accepts it', async () => {
  save.mockImplementation(async (conversationId, payload) => ({
    conversationId, ...payload, revision: 1,
  }))
  const hook = renderHook(() => useAgentConversationDraft('conv-1'))
  act(() => hook.result.current.updateDraft('需保存'))
  expect(readPendingConversationDraft('conv-1')?.text).toBe('需保存')
  await act(() => vi.advanceTimersByTimeAsync(600))
  expect(readPendingConversationDraft('conv-1')).toBeNull()
  expect(useAgentConversationRuntimeStore.getState().draft).toBe('需保存')
})
