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
  session: AiCreateAssistSession | null
  error: Error | null
} {
  const [session, setSession] = useState<AiCreateAssistSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const inFlightRef = useRef(false)

  const bootstrap = useCallback(async () => {
    if (!enabled || inFlightRef.current) {
      return
    }

    inFlightRef.current = true
    try {
      try {
        await flushDraft()
      } catch {
        // 协助会话允许不完整草稿；保存失败不得挡住打开右栏。
      }

      try {
        const nextSession = await startAiCreateAssistSession({
          taskId: getTaskId() ?? undefined,
          draft: buildDraft(),
        })
        applySavedDraft(nextSession.task)
        syncTaskSearch(nextSession.task.id)
        setSession(nextSession)
        setError(null)
      } catch (caught) {
        setSession(null)
        setError(caught instanceof Error ? caught : new Error(ASSIST_ERROR_TEXT))
      }
    } finally {
      inFlightRef.current = false
    }
  }, [applySavedDraft, buildDraft, enabled, flushDraft, getTaskId, syncTaskSearch])

  return { bootstrap, session, error }
}
