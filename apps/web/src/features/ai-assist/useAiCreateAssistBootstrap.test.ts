import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startAiCreateAssistSession } from '@/services/ai-create-task.service'
import type { AiCreateAssistSession } from '@/types/api'
import { useAiCreateAssistBootstrap } from './useAiCreateAssistBootstrap'

vi.mock('@/services/ai-create-task.service', () => ({
  startAiCreateAssistSession: vi.fn(),
}))

const mockSession: AiCreateAssistSession = {
  task: {
    id: 'task-assist',
    status: 'in_progress',
    currentPhase: 'basic_info',
    departureId: null,
    creatorUserId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    draft: {
      version: 1,
      snapshot: { mode: 'manual', routeName: '喀纳斯阿勒泰10日线' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  conversation: {
    id: 'conv-1',
    status: 'open',
    events: [],
    activeBatch: null,
  },
}

describe('useAiCreateAssistBootstrap', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    vi.mocked(startAiCreateAssistSession).mockResolvedValue(mockSession)
  })

  it('flushes the draft before starting the assist session', async () => {
    const order: string[] = []
    const flushDraft = vi.fn(async () => {
      order.push('flush')
    })
    vi.mocked(startAiCreateAssistSession).mockImplementation(async () => {
      order.push('session')
      return mockSession
    })
    const applySavedDraft = vi.fn()
    const syncTaskSearch = vi.fn()
    const { result } = renderHook(() =>
      useAiCreateAssistBootstrap({
        enabled: true,
        flushDraft,
        buildDraft: () => ({ mode: 'manual', routeName: '喀纳斯阿勒泰10日线' }),
        getTaskId: () => 'task-1',
        applySavedDraft,
        syncTaskSearch,
      }),
    )

    await act(async () => {
      await result.current.bootstrap()
    })

    expect(order).toEqual(['flush', 'session'])
    expect(applySavedDraft).toHaveBeenCalledWith(mockSession.task, { keepDirty: true })
    expect(syncTaskSearch).toHaveBeenCalledWith('task-assist')
  })

  it('still starts a session when flushDraft throws without marking the form saved', async () => {
    const flushDraft = vi.fn(async () => {
      throw new Error('发团创建草稿保存失败')
    })
    const applySavedDraft = vi.fn()
    const { result } = renderHook(() =>
      useAiCreateAssistBootstrap({
        enabled: true,
        flushDraft,
        buildDraft: () => ({ mode: 'template', routeName: '' }),
        getTaskId: () => null,
        applySavedDraft,
        syncTaskSearch: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.bootstrap()
    })

    expect(startAiCreateAssistSession).toHaveBeenCalled()
    expect(applySavedDraft).toHaveBeenCalledWith(mockSession.task, { keepDirty: true })
    expect(result.current.session?.conversation.id).toBe('conv-1')
    expect(result.current.error).toBeNull()
  })

  it('starts the session with the current draft and returns the conversation', async () => {
    let currentDraft = { mode: 'template' as const, routeName: '' }
    const { result } = renderHook(() =>
      useAiCreateAssistBootstrap({
        enabled: true,
        flushDraft: vi.fn().mockResolvedValue(undefined),
        buildDraft: () => currentDraft,
        getTaskId: () => undefined,
        applySavedDraft: vi.fn(),
        syncTaskSearch: vi.fn(),
      }),
    )

    currentDraft = { mode: 'manual', routeName: '喀纳斯阿勒泰10日线' }

    await act(async () => {
      await result.current.bootstrap()
    })

    expect(startAiCreateAssistSession).toHaveBeenCalledWith({
      taskId: undefined,
      draft: { mode: 'manual', routeName: '喀纳斯阿勒泰10日线' },
    })
    expect(result.current.session?.conversation.id).toBe('conv-1')
  })

  it('uses the task id assigned during flushDraft, not the id from render', async () => {
    let latestId: string | null = null
    const flushDraft = vi.fn(async () => {
      latestId = 'task-from-flush'
    })
    const { result } = renderHook(() =>
      useAiCreateAssistBootstrap({
        enabled: true,
        flushDraft,
        buildDraft: () => ({ mode: 'manual', routeName: '喀纳斯阿勒泰10日线' }),
        getTaskId: () => latestId,
        applySavedDraft: vi.fn(),
        syncTaskSearch: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.bootstrap()
    })

    expect(startAiCreateAssistSession).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-from-flush' }),
    )
  })

  it('does not start a second session while bootstrap is in flight', async () => {
    let resolveSession!: (value: AiCreateAssistSession) => void
    vi.mocked(startAiCreateAssistSession).mockImplementation(
      () =>
        new Promise<AiCreateAssistSession>((resolve) => {
          resolveSession = resolve
        }),
    )
    const { result } = renderHook(() =>
      useAiCreateAssistBootstrap({
        enabled: true,
        flushDraft: vi.fn().mockResolvedValue(undefined),
        buildDraft: () => ({ mode: 'manual', routeName: '喀纳斯阿勒泰10日线' }),
        getTaskId: () => 'task-1',
        applySavedDraft: vi.fn(),
        syncTaskSearch: vi.fn(),
      }),
    )

    let first!: Promise<void>
    let second!: Promise<void>
    try {
      act(() => {
        first = result.current.bootstrap()
        second = result.current.bootstrap()
      })

      await waitFor(() => {
        expect(startAiCreateAssistSession).toHaveBeenCalled()
      })
      expect(startAiCreateAssistSession).toHaveBeenCalledTimes(1)
      expect(result.current.loading).toBe(true)
      await act(async () => {
        resolveSession(mockSession)
        await first
        await second
      })
      expect(result.current.loading).toBe(false)
      expect(startAiCreateAssistSession).toHaveBeenCalledTimes(1)
    } finally {
      resolveSession?.(mockSession)
      await Promise.allSettled([first, second])
    }
  })

  it('clears the prior session when a later bootstrap fails', async () => {
    vi.mocked(startAiCreateAssistSession)
      .mockResolvedValueOnce(mockSession)
      .mockRejectedValueOnce(new Error('委托已过期'))
    const { result } = renderHook(() =>
      useAiCreateAssistBootstrap({
        enabled: true,
        flushDraft: vi.fn().mockResolvedValue(undefined),
        buildDraft: () => ({ mode: 'manual', routeName: '喀纳斯阿勒泰10日线' }),
        getTaskId: () => 'task-1',
        applySavedDraft: vi.fn(),
        syncTaskSearch: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.bootstrap()
    })
    expect(result.current.session?.conversation.id).toBe('conv-1')
    expect(result.current.error).toBeNull()

    await act(async () => {
      await result.current.bootstrap()
    })
    expect(result.current.session).toBeNull()
    expect(result.current.error?.message).toBe('委托已过期')
  })

  it('clears the session so a later bootstrap can start a new one', async () => {
    const secondSession: AiCreateAssistSession = {
      ...mockSession,
      conversation: {
        ...mockSession.conversation,
        id: 'conv-2',
      },
    }
    vi.mocked(startAiCreateAssistSession)
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(secondSession)
    const { result } = renderHook(() =>
      useAiCreateAssistBootstrap({
        enabled: true,
        flushDraft: vi.fn().mockResolvedValue(undefined),
        buildDraft: () => ({ mode: 'manual', routeName: '喀纳斯阿勒泰10日线' }),
        getTaskId: () => 'task-1',
        applySavedDraft: vi.fn(),
        syncTaskSearch: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.bootstrap()
    })
    expect(result.current.session?.conversation.id).toBe('conv-1')

    act(() => {
      result.current.reset()
    })
    expect(result.current.session).toBeNull()

    await act(async () => {
      await result.current.bootstrap()
    })
    expect(result.current.session?.conversation.id).toBe('conv-2')
    expect(startAiCreateAssistSession).toHaveBeenCalledTimes(2)
  })

  it('discards an in-flight session after reset so the next bootstrap is not blocked', async () => {
    let resolveSession!: (value: AiCreateAssistSession) => void
    vi.mocked(startAiCreateAssistSession).mockImplementation(
      () =>
        new Promise<AiCreateAssistSession>((resolve) => {
          resolveSession = resolve
        }),
    )
    const applySavedDraft = vi.fn()
    const { result } = renderHook(() =>
      useAiCreateAssistBootstrap({
        enabled: true,
        flushDraft: vi.fn().mockResolvedValue(undefined),
        buildDraft: () => ({ mode: 'manual', routeName: '喀纳斯阿勒泰10日线' }),
        getTaskId: () => 'task-1',
        applySavedDraft,
        syncTaskSearch: vi.fn(),
      }),
    )

    let first!: Promise<void>
    act(() => {
      first = result.current.bootstrap()
    })
    await waitFor(() => {
      expect(startAiCreateAssistSession).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.reset()
    })

    await act(async () => {
      resolveSession(mockSession)
      await first
    })
    expect(result.current.session).toBeNull()

    vi.mocked(startAiCreateAssistSession).mockResolvedValue({
      ...mockSession,
      conversation: {
        ...mockSession.conversation,
        id: 'conv-2',
      },
    })
    await act(async () => {
      await result.current.bootstrap()
    })
    expect(result.current.session?.conversation.id).toBe('conv-2')
    expect(startAiCreateAssistSession).toHaveBeenCalledTimes(2)
  })
})
