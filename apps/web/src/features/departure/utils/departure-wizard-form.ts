import { DepartureType } from '@xiaotuanbao/shared'
import type { CopyDepartureDto, CreateDepartureDto } from '@/types/api'

export type RouteStepMode = 'manual' | 'template' | 'copy'

export interface RouteStepValues {
  mode: RouteStepMode
  routeName: string
  defaultDayCount?: number
  templateId?: string
  copyFromDepartureId?: string
  sourceDepartureNo?: string
  copySegments?: boolean
  copyResources?: boolean
  copyReferencePrices?: boolean
  previewSegmentCount?: number
  previewResourceCount?: number
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

export function createInitialRouteStepValues(): RouteStepValues {
  return { mode: 'template', routeName: '' }
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

export function canProceedFromRouteStep(route: RouteStepValues): boolean {
  if (route.mode === 'template') {
    return Boolean(route.templateId)
  }

  return route.routeName.trim().length > 0
}

export function buildCreateDeparturePayload(
  route: RouteStepValues,
  info: InfoStepValues,
): CreateDepartureDto {
  const payload: CreateDepartureDto = {
    name: info.name.trim(),
    routeName: route.routeName.trim(),
    startDate: info.startDate,
    endDate: info.endDate,
    ownerUserId: info.ownerUserId,
    departureNo: info.departureNo.trim() || undefined,
    departureType: info.departureType,
    notes: info.notes?.trim() || undefined,
  }

  if (route.mode === 'template' && route.templateId) {
    payload.templateId = route.templateId
    payload.copySegments = route.copySegments ?? true
    payload.copyResources = route.copyResources ?? true
    payload.copyReferencePrices = route.copyReferencePrices ?? true
  }

  return payload
}

export function buildCopyDeparturePayload(
  route: RouteStepValues,
  info: InfoStepValues,
): CopyDepartureDto {
  return {
    name: info.name.trim(),
    startDate: info.startDate,
    endDate: info.endDate,
    ownerUserId: info.ownerUserId,
    departureNo: info.departureNo.trim() || undefined,
    departureType: info.departureType,
    notes: info.notes?.trim() || undefined,
    copySegments: route.copySegments ?? true,
    copyResources: route.copyResources ?? true,
    copyReferencePrices: route.copyReferencePrices ?? true,
  }
}

export function buildRouteSummary(route: RouteStepValues): string | null {
  if (route.mode === 'copy' && route.sourceDepartureNo) {
    return `复制自发团 ${route.sourceDepartureNo}，不含客源与财务`
  }

  return buildTemplateCopySummary(route)
}

export function buildTemplateCopySummary(route: RouteStepValues): string | null {
  if (route.mode === 'template') {
    const segmentCount = route.previewSegmentCount ?? 0
    const resourceCount = route.previewResourceCount ?? 0

    if (segmentCount === 0 && resourceCount === 0) {
      return '无模板复制项'
    }

    return `将复制 ${segmentCount} 段行程、${resourceCount} 项资源草稿`
  }

  if (route.mode === 'copy') {
    const segmentCount = route.previewSegmentCount ?? 0
    const resourceCount = route.previewResourceCount ?? 0

    if (segmentCount === 0 && resourceCount === 0) {
      return route.sourceDepartureNo
        ? `复制自发团 ${route.sourceDepartureNo}，不含客源与财务`
        : null
    }

    return `将复制 ${segmentCount} 段行程、${resourceCount} 项资源草稿`
  }

  return null
}
