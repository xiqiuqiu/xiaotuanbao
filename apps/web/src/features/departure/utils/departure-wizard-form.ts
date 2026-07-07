import { DepartureType } from '@xiaotuanbao/shared'
import type { CreateDepartureDto } from '@/types/api'

export interface RouteStepValues {
  routeName: string
  defaultDayCount?: number
}

export interface InfoStepValues {
  name: string
  departureNo: string
  departureType: DepartureType
  startDate: string
  endDate: string
  ownerUserId: string
  notes?: string
}

export function formatChineseMonthDay(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number)
  return `${month}月${day}日`
}

export function buildDefaultDepartureName(routeName: string, startDate: string): string {
  return `${routeName} ${formatChineseMonthDay(startDate)}团`
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function computeDayCount(startDate: string, endDate: string): number {
  const startMs = new Date(`${startDate}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${endDate}T00:00:00.000Z`).getTime()
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1
}

export function computeEndDateFromDefaultDays(startDate: string, defaultDayCount: number): string {
  return addDays(startDate, defaultDayCount - 1)
}

export function isEndDateBeforeStartDate(startDate: string, endDate: string): boolean {
  return endDate < startDate
}

export function getShanghaiTodayString(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
}

export function buildInitialInfoValues(
  route: RouteStepValues,
  ownerUserId: string,
  startDate = getShanghaiTodayString(),
): InfoStepValues {
  const endDate =
    route.defaultDayCount && route.defaultDayCount > 0
      ? computeEndDateFromDefaultDays(startDate, route.defaultDayCount)
      : startDate

  return {
    name: buildDefaultDepartureName(route.routeName, startDate),
    departureNo: '',
    departureType: DepartureType.COMBINED,
    startDate,
    endDate,
    ownerUserId,
    notes: undefined,
  }
}

export function buildCreateDeparturePayload(
  route: RouteStepValues,
  info: InfoStepValues,
): CreateDepartureDto {
  return {
    name: info.name.trim(),
    routeName: route.routeName.trim(),
    startDate: info.startDate,
    endDate: info.endDate,
    ownerUserId: info.ownerUserId,
    departureNo: info.departureNo.trim() || undefined,
    departureType: info.departureType,
    notes: info.notes?.trim() || undefined,
  }
}
