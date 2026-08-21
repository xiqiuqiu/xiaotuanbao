import type { AiActionRepeatObservationDraft, AiActionTargetRef } from './ai-action.types'

export function repeatFingerprintFrom(
  draft: Pick<AiActionRepeatObservationDraft, 'organizationId' | 'name' | 'targetRef' | 'inputHash'>,
): string {
  return [
    draft.organizationId,
    draft.name,
    draft.targetRef?.kind ?? '',
    draft.targetRef?.id ?? '',
    draft.inputHash,
  ].join('\u001f')
}

export function sameRepeatTarget(
  left: AiActionTargetRef | null | undefined,
  right: AiActionTargetRef | null | undefined,
): boolean {
  return (left?.kind ?? '') === (right?.kind ?? '') && (left?.id ?? '') === (right?.id ?? '')
}
