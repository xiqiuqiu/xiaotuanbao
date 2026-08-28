import { describe, expect, it, vi } from 'vitest'
import {
  criticalQueryPresentation,
  draftRestoreView,
  persistWithConflictRetry,
  shouldBlockLeavingDraft,
} from './draft-lifecycle'

describe('shouldBlockLeavingDraft', () => {
  it('does not block same-document search updates such as attaching taskId', () => {
    expect(
      shouldBlockLeavingDraft({
        dirty: true,
        currentPathname: '/departure/new',
        nextPathname: '/departure/new',
      }),
    ).toBe(false)
  })

  it('does not block when the draft is clean', () => {
    expect(
      shouldBlockLeavingDraft({
        dirty: false,
        currentPathname: '/departure/new',
        nextPathname: '/departure',
      }),
    ).toBe(false)
  })

  it('blocks leaving the page while the draft is dirty', () => {
    expect(
      shouldBlockLeavingDraft({
        dirty: true,
        currentPathname: '/departure/new',
        nextPathname: '/departure',
      }),
    ).toBe(true)
  })
})

describe('draftRestoreView', () => {
  it('keeps the form hidden while restore is in flight or failed', () => {
    expect(draftRestoreView('loading')).toBe('loading')
    expect(draftRestoreView('failed')).toBe('failed')
  })

  it('shows the form only after restore is idle or ready', () => {
    expect(draftRestoreView('idle')).toBe('form')
    expect(draftRestoreView('ready')).toBe('form')
  })
})

describe('criticalQueryPresentation', () => {
  it('treats a failed query as an error even when the result looks empty', () => {
    expect(
      criticalQueryPresentation({ isError: true, isLoading: false, hasData: false }),
    ).toBe('error')
  })

  it('does not present an error as an empty collection', () => {
    expect(
      criticalQueryPresentation({ isError: false, isLoading: false, hasData: false }),
    ).toBe('empty')
    expect(
      criticalQueryPresentation({ isError: false, isLoading: false, hasData: true }),
    ).toBe('data')
  })
})

describe('persistWithConflictRetry', () => {
  it('retries once after a CAS conflict and returns the later save', async () => {
    const conflict = { version: 3 }
    const retried = { version: 4 }
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce(retried)
    const applyConflict = vi.fn()

    const result = await persistWithConflictRetry({
      persist,
      readConflict: (error) => (error instanceof Error ? conflict : null),
      applyConflict,
    })

    expect(applyConflict).toHaveBeenCalledWith(conflict)
    expect(persist).toHaveBeenCalledTimes(2)
    expect(result).toBe(retried)
  })

  it('rethrows after a second conflict so the caller can offer retry', async () => {
    const conflict = { version: 5 }
    const persist = vi.fn().mockRejectedValue(new Error('conflict'))
    const applyConflict = vi.fn()

    await expect(
      persistWithConflictRetry({
        persist,
        readConflict: () => conflict,
        applyConflict,
      }),
    ).rejects.toThrow('conflict')

    expect(persist).toHaveBeenCalledTimes(2)
    expect(applyConflict).toHaveBeenCalledTimes(2)
  })
})
