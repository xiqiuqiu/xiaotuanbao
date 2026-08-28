import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, type ShouldBlockFn } from '@tanstack/react-router'
import {
  shouldBlockLeavingDraft,
  type DraftSaveStatus,
} from './draft-lifecycle'

export function useDraftLifecycle(options: {
  persist: () => Promise<void>
  isDirty: () => boolean
  debounceMs?: number
  onAutosaveError?: (error: Error) => void
}) {
  const persistRef = useRef(options.persist)
  persistRef.current = options.persist
  const isDirtyRef = useRef(options.isDirty)
  isDirtyRef.current = options.isDirty
  const onAutosaveErrorRef = useRef(options.onAutosaveError)
  onAutosaveErrorRef.current = options.onAutosaveError
  const debounceMs = options.debounceMs ?? 800

  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle')
  const [saveError, setSaveError] = useState<Error | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (inFlightRef.current) {
      try {
        await inFlightRef.current
      } catch {
        // Previous attempt already recorded saveStatus.
      }
    }
    if (!isDirtyRef.current()) {
      return
    }

    const run = (async () => {
      setSaveStatus('saving')
      try {
        await persistRef.current()
        setSaveStatus(isDirtyRef.current() ? 'idle' : 'saved')
        setSaveError(null)
      } catch (error) {
        const err = error instanceof Error ? error : new Error('草稿保存失败')
        setSaveStatus('error')
        setSaveError(err)
        throw err
      }
    })()

    inFlightRef.current = run.finally(() => {
      if (inFlightRef.current === run) {
        inFlightRef.current = null
      }
    })
    await inFlightRef.current
  }, [])

  const scheduleAutosave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      void flush().catch((error) => {
        onAutosaveErrorRef.current?.(error instanceof Error ? error : new Error('草稿保存失败'))
      })
    }, debounceMs)
  }, [debounceMs, flush])

  const retrySave = useCallback(() => flush(), [flush])

  const shouldBlockFn = useCallback<ShouldBlockFn>(
    async ({ current, next }) => {
      if (
        !shouldBlockLeavingDraft({
          dirty: isDirtyRef.current(),
          currentPathname: current.pathname,
          nextPathname: next.pathname,
        })
      ) {
        return false
      }
      try {
        await flush()
        return isDirtyRef.current()
      } catch {
        return true
      }
    },
    [flush],
  )

  useBlocker({
    shouldBlockFn,
    enableBeforeUnload: () => isDirtyRef.current(),
  })

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    saveStatus,
    saveError,
    scheduleAutosave,
    flush,
    retrySave,
  }
}
