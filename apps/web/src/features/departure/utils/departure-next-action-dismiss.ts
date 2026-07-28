import type { DepartureNextAction } from './departure-next-action'

export const NEXT_ACTION_DISMISS_KEY_PREFIX =
  'xiaotuanbao.departure.nextAction.dismissed:'

export function buildNextActionFingerprint(action: DepartureNextAction): string {
  const tab = action.action?.tab ?? ''
  const intent = action.action?.intent ?? ''
  return [
    action.type,
    action.title,
    action.description ?? '',
    tab,
    intent,
  ].join('\u0001')
}

function storageKey(departureId: string): string {
  return `${NEXT_ACTION_DISMISS_KEY_PREFIX}${departureId}`
}

export function getDismissedFingerprint(departureId: string): string | null {
  try {
    return localStorage.getItem(storageKey(departureId))
  } catch {
    return null
  }
}

export function dismissNextAction(departureId: string, fingerprint: string): void {
  try {
    localStorage.setItem(storageKey(departureId), fingerprint)
  } catch {
    // Storage full / private mode — treat as undismissed next time.
  }
}

export function isNextActionDismissed(
  departureId: string,
  fingerprint: string,
): boolean {
  return getDismissedFingerprint(departureId) === fingerprint
}
