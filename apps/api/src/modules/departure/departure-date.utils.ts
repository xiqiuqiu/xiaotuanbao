import { DepartureProgress } from '@xiaotuanbao/shared'

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
    return false
  }

  const parsed = parseDateOnly(value)
  return !Number.isNaN(parsed.getTime()) && formatDateOnly(parsed) === value
}

export function parseDateOnlyStrict(value: string): Date {
  if (!isDateOnly(value)) {
    throw new RangeError(`日期须为 YYYY-MM-DD：${value}`)
  }
  return parseDateOnly(value)
}

export function getShanghaiTodayString(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI_TIME_ZONE }).format(new Date())
}

/** Business-number / document_sequences period_key: yyMM (Asia/Shanghai). */
export function getShanghaiNumberingMonthKey(): string {
  return getShanghaiTodayString().replace(/-/g, '').slice(2, 6)
}

/** TX document_sequences period_key: yyMMdd (Asia/Shanghai). */
export function getShanghaiNumberingDayKey(): string {
  return getShanghaiTodayString().replace(/-/g, '').slice(2)
}

export function computeDayCount(startDate: Date, endDate: Date): number {
  const startMs = parseDateOnly(formatDateOnly(startDate)).getTime()
  const endMs = parseDateOnly(formatDateOnly(endDate)).getTime()
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1
}

export function deriveDepartureProgress(startDate: Date, endDate: Date): DepartureProgress {
  const today = getShanghaiTodayString()
  const start = formatDateOnly(startDate)
  const end = formatDateOnly(endDate)

  if (today < start) {
    return DepartureProgress.NOT_STARTED
  }

  if (today > end) {
    return DepartureProgress.ENDED
  }

  return DepartureProgress.IN_PROGRESS
}
