import { useCallback, useEffect, useRef } from 'react'
import type { AiConversationDraftView } from '@xiaotuanbao/shared'
import { saveAgentConversationDraft } from '@/services/agent-conversation.service'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'

const DRAFT_SAVE_DEBOUNCE_MS = 600

type DraftVersion = Pick<AiConversationDraftView, 'draftEpoch' | 'revision'>

function isNewerDraftVersion(next: DraftVersion, current: DraftVersion): boolean {
  return (
    next.draftEpoch > current.draftEpoch ||
    (next.draftEpoch === current.draftEpoch && next.revision > current.revision)
  )
}

export function useAgentConversationDraft(conversationId: string | null) {
  const draftEpoch = useAgentConversationRuntimeStore((state) => state.draftEpoch)
  const revision = useAgentConversationRuntimeStore((state) => state.revision)
  const conversationIdRef = useRef(conversationId)
  const draftEpochRef = useRef(draftEpoch)
  const draftRevisionRef = useRef(revision)
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const draftSaveAbortRef = useRef<AbortController | null>(null)
  const draftSaveGenerationRef = useRef(0)
  const pendingDraftTextRef = useRef<string | null>(null)
  const editingDraftRef = useRef(false)
  const deferredDraftRef = useRef<AiConversationDraftView | null>(null)

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  useEffect(() => {
    draftEpochRef.current = draftEpoch
    draftRevisionRef.current = revision
  }, [draftEpoch, revision])

  const abortDraftSave = useCallback(() => {
    draftSaveAbortRef.current?.abort()
    draftSaveAbortRef.current = null
  }, [])

  const applyServerDraft = useCallback((next: AiConversationDraftView) => {
    if (
      !isNewerDraftVersion(next, {
        draftEpoch: draftEpochRef.current,
        revision: draftRevisionRef.current,
      })
    ) {
      return
    }
    const localDraft = useAgentConversationRuntimeStore.getState().draft.trim()
    if (editingDraftRef.current && localDraft.length > 0) {
      const deferred = deferredDraftRef.current
      if (!deferred || isNewerDraftVersion(next, deferred)) {
        deferredDraftRef.current = next
      }
      return
    }
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current)
      draftSaveTimerRef.current = undefined
    }
    pendingDraftTextRef.current = null
    editingDraftRef.current = false
    deferredDraftRef.current = null
    draftEpochRef.current = next.draftEpoch
    draftRevisionRef.current = next.revision
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: conversationIdRef.current,
      draft: next.text,
      draftEpoch: next.draftEpoch,
      revision: next.revision,
    })
  }, [])

  const updateDraft = useCallback(
    (value: string) => {
      useAgentConversationRuntimeStore.getState().hydrate({
        conversationId: conversationIdRef.current,
        draft: value,
      })
      if (!conversationIdRef.current) {
        return
      }
      editingDraftRef.current = true
      draftSaveGenerationRef.current += 1
      const generation = draftSaveGenerationRef.current
      pendingDraftTextRef.current = value
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
      }
      draftSaveTimerRef.current = setTimeout(() => {
        pendingDraftTextRef.current = null
        const epoch = draftEpochRef.current
        abortDraftSave()
        const abort = new AbortController()
        draftSaveAbortRef.current = abort
        void saveAgentConversationDraft(
          conversationIdRef.current!,
          { text: value, draftEpoch: epoch },
          { signal: abort.signal },
        )
          .then((saved) => {
            if (generation !== draftSaveGenerationRef.current) {
              return
            }
            editingDraftRef.current = false
            applyServerDraft(saved)
            const deferred = deferredDraftRef.current
            deferredDraftRef.current = null
            if (deferred) {
              applyServerDraft(deferred)
            }
          })
          .catch(() => {
            if (generation !== draftSaveGenerationRef.current) {
              return
            }
            editingDraftRef.current = false
            const deferred = deferredDraftRef.current
            deferredDraftRef.current = null
            if (deferred) {
              applyServerDraft(deferred)
            }
          })
      }, DRAFT_SAVE_DEBOUNCE_MS)
    },
    [abortDraftSave, applyServerDraft],
  )

  useEffect(
    () => () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
        draftSaveTimerRef.current = undefined
      }
      const text = pendingDraftTextRef.current
      const id = conversationIdRef.current
      if (text === null || !id) {
        return
      }
      pendingDraftTextRef.current = null
      void saveAgentConversationDraft(id, {
        text,
        draftEpoch: draftEpochRef.current,
      }).catch(() => undefined)
    },
    [conversationId],
  )

  return { applyServerDraft, updateDraft, conversationIdRef, draftEpochRef, draftRevisionRef }
}
