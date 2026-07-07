import { DepartureProgress } from '@xiaotuanbao/shared'

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export function getShanghaiTodayString(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI_TIME_ZONE }).format(new Date())
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
