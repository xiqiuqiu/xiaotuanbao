export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type DraftRestorePhase = 'idle' | 'loading' | 'ready' | 'failed'

export type DraftRestoreView = 'form' | 'loading' | 'failed'

export type CriticalQueryPresentation = 'loading' | 'error' | 'empty' | 'data'

export function shouldBlockLeavingDraft(args: {
  dirty: boolean
  currentPathname: string
  nextPathname: string
}): boolean {
  if (args.currentPathname === args.nextPathname) {
    return false
  }
  return args.dirty
}

export function draftRestoreView(phase: DraftRestorePhase): DraftRestoreView {
  if (phase === 'loading') return 'loading'
  if (phase === 'failed') return 'failed'
  return 'form'
}

export function criticalQueryPresentation(args: {
  isError: boolean
  isLoading: boolean
  hasData: boolean
}): CriticalQueryPresentation {
  if (args.isError) return 'error'
  if (args.isLoading && !args.hasData) return 'loading'
  if (!args.hasData) return 'empty'
  return 'data'
}

export async function persistWithConflictRetry<TSaved>(args: {
  persist: () => Promise<TSaved>
  readConflict: (error: unknown) => TSaved | null
  applyConflict: (saved: TSaved) => void
}): Promise<TSaved> {
  try {
    return await args.persist()
  } catch (error) {
    const conflict = args.readConflict(error)
    if (!conflict) {
      throw error
    }
    args.applyConflict(conflict)
    try {
      return await args.persist()
    } catch (retryError) {
      const retryConflict = args.readConflict(retryError)
      if (retryConflict) {
        args.applyConflict(retryConflict)
      }
      throw retryError
    }
  }
}
