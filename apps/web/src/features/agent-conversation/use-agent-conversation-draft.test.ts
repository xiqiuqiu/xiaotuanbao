import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiConversationDraftView } from '@xiaotuanbao/shared'
import { saveAgentConversationDraft } from '@/services/agent-conversation.service'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'
import { useAgentConversationDraft } from './use-agent-conversation-draft'

vi.mock('@/services/agent-conversation.service', () => ({
  saveAgentConversationDraft: vi.fn(),
}))

function draft(partial: Partial<AiConversationDraftView> = {}): AiConversationDraftView {
  return {
    conversationId: 'c-1',
    text: '对端草稿',
    draftEpoch: 1,
    revision: 2,
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...partial,
  }
}

describe('useAgentConversationDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(saveAgentConversationDraft).mockReset()
    useAgentConversationRuntimeStore.getState().clear()
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      draft: '',
      draftEpoch: 0,
      revision: 0,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('debounces draft saves and applies the newer server version', async () => {
    vi.mocked(saveAgentConversationDraft).mockResolvedValue(
      draft({ text: '本地草稿', draftEpoch: 0, revision: 1 }),
    )
    const { result } = renderHook(() => useAgentConversationDraft('c-1'))

    act(() => {
      result.current.updateDraft('本')
      result.current.updateDraft('本地草稿')
    })
    expect(saveAgentConversationDraft).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(saveAgentConversationDraft).toHaveBeenCalledTimes(1)
    expect(saveAgentConversationDraft).toHaveBeenCalledWith(
      'c-1',
      { text: '本地草稿', draftEpoch: 0 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(useAgentConversationRuntimeStore.getState()).toMatchObject({
      draft: '本地草稿',
      revision: 1,
    })
  })

  it('applies a peer draft after a failed save instead of staying gated', async () => {
    vi.mocked(saveAgentConversationDraft).mockRejectedValue(new Error('409'))
    const { result } = renderHook(() => useAgentConversationDraft('c-1'))

    act(() => {
      result.current.updateDraft('我还在打字')
      result.current.applyServerDraft(draft({ text: '另一台设备', draftEpoch: 1, revision: 1 }))
    })
    expect(useAgentConversationRuntimeStore.getState().draft).toBe('我还在打字')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(useAgentConversationRuntimeStore.getState().draft).toBe('另一台设备')
  })
})
