import type { VerificationDateRange } from './date-ranges'

export type VerificationDeepLinkSearch = {
  transactionNo?: string
  scheduleNo?: string
}

export type VerificationDeepLinkLock = 'transactionNo' | 'scheduleNo' | null

export type VerificationDeepLinkFilterState = {
  dateRange: VerificationDateRange
  direction?: string
  status?: string
  transactionNo: string
  scheduleNo: string
  departureKeyword: string
  lock: VerificationDeepLinkLock
}

function trimOptional(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** URL may only carry one business number; transactionNo wins if both are present. */
export function resolveVerificationDeepLinkSearch(
  search: VerificationDeepLinkSearch,
): VerificationDeepLinkSearch {
  const transactionNo = trimOptional(search.transactionNo)
  if (transactionNo) {
    return { transactionNo }
  }
  const scheduleNo = trimOptional(search.scheduleNo)
  if (scheduleNo) {
    return { scheduleNo }
  }
  return {}
}

/** Apply deep-link search into top filters: fill number, clear date and other filters. */
export function applyVerificationDeepLink(
  search: VerificationDeepLinkSearch,
): VerificationDeepLinkFilterState {
  const resolved = resolveVerificationDeepLinkSearch(search)

  if (resolved.transactionNo) {
    return {
      dateRange: null,
      direction: undefined,
      status: undefined,
      transactionNo: resolved.transactionNo,
      scheduleNo: '',
      departureKeyword: '',
      lock: 'transactionNo',
    }
  }

  if (resolved.scheduleNo) {
    return {
      dateRange: null,
      direction: undefined,
      status: undefined,
      transactionNo: '',
      scheduleNo: resolved.scheduleNo,
      departureKeyword: '',
      lock: 'scheduleNo',
    }
  }

  return {
    dateRange: null,
    direction: undefined,
    status: undefined,
    transactionNo: '',
    scheduleNo: '',
    departureKeyword: '',
    lock: null,
  }
}

export function buildVerificationListMatchParams(input: {
  transactionNo: string
  scheduleNo: string
  lock: VerificationDeepLinkLock
}): {
  transactionNo?: string
  transactionNoMatch?: 'exact'
  scheduleNo?: string
  scheduleNoMatch?: 'exact'
} {
  const transactionNo = input.transactionNo.trim() || undefined
  const scheduleNo = input.scheduleNo.trim() || undefined

  return {
    ...(transactionNo
      ? {
          transactionNo,
          ...(input.lock === 'transactionNo' ? { transactionNoMatch: 'exact' as const } : {}),
        }
      : {}),
    ...(scheduleNo
      ? {
          scheduleNo,
          ...(input.lock === 'scheduleNo' ? { scheduleNoMatch: 'exact' as const } : {}),
        }
      : {}),
  }
}
