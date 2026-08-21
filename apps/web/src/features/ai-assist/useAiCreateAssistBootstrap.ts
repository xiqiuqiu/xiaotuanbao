import { useCallback, useRef, useState } from 'react'
import { startAiCreateAssistSession } from '@/services/ai-create-task.service'
import type { AiCreateAssistSession, AiCreateTaskSummary } from '@/types/api'
import type { DepartureCreationDraftSnapshot } from '@xiaotuanbao/shared'
import { ASSIST_ERROR_TEXT } from './assist-error-text'

export interface UseAiCreateAssistBootstrapOptions {
  enabled: boolean
  flushDraft: () => Promise<void>
  buildDraft: () => DepartureCreationDraftSnapshot
  getTaskId: () => string | null | undefined
  applySavedDraft: (result: AiCreateTaskSummary, options?: { keepDirty?: boolean }) => void
  syncTaskSearch: (nextTaskId: string) => void
}

export function useAiCreateAssistBootstrap({
  enabled,
  flushDraft,
  buildDraft,
  getTaskId,
  applySavedDraft,
  syncTaskSearch,
}: UseAiCreateAssistBootstrapOptions): {
  bootstrap: () => Promise<void>
  reset: () => void
  session: AiCreateAssistSession | null
  error: Error | null
  loading: boolean
} {
  const [session, setSession] = useState<AiCreateAssistSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const inFlightRef = useRef(false)
  const generationRef = useRef(0)

  const finishBootstrap = useCallback((generation: number) => {
    if (generation !== generationRef.current) {
      return
    }
    inFlightRef.current = false
    setStatus('idle')
  }, [])

  const reset = useCallback(() => {
    generationRef.current += 1
    inFlightRef.current = false
    setSession(null)
    setError(null)
    setStatus('idle')
  }, [])

  const bootstrap = useCallback(async () => {
    if (!enabled || inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    setStatus('loading')
    const generation = generationRef.current
    try {
      try {
        await flushDraft()
      } catch {
        // 协助会话允许不完整草稿；保存失败不得挡住打开右栏。
      }

      const nextSession = await startAiCreateAssistSession({
        taskId: getTaskId() ?? undefined,
        draft: buildDraft(),
      })
      // 只绑定会话 taskId/version；flush 失败或跳过时不得把表单标成已保存。
      applySavedDraft(nextSession.task, { keepDirty: true })
      syncTaskSearch(nextSession.task.id)
      if (generation !== generationRef.current) {
        return
      }
      setSession(nextSession)
      setError(null)
    } catch (caught) {
      if (generation !== generationRef.current) {
        return
      }
      setSession(null)
      setError(caught instanceof Error ? caught : new Error(ASSIST_ERROR_TEXT))
    } finally {
      finishBootstrap(generation)
    }
  }, [applySavedDraft, buildDraft, enabled, finishBootstrap, flushDraft, getTaskId, syncTaskSearch])

  return { bootstrap, reset, session, error, loading: status === 'loading' }
}
