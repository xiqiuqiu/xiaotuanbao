import type { AiActionRecordDraft } from './ai-action.types'

export function replayKeyFromDraft(
  draft: Pick<AiActionRecordDraft, 'attemptId' | 'runId' | 'name' | 'targetRef' | 'inputHash'>,
): string {
  const scope = draft.attemptId ? `attempt:${draft.attemptId}` : `run:${draft.runId ?? ''}`
  return [scope, draft.name, draft.targetRef?.kind ?? '', draft.targetRef?.id ?? '', draft.inputHash].join(
    '\u001f',
  )
}
