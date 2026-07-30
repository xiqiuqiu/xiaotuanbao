import { DepartureType } from '@xiaotuanbao/shared'
import type { CopyDepartureDto, CreateDepartureDto } from '@/types/api'

export type RouteStepMode = 'manual' | 'template' | 'copy'

export interface RouteStepValues {
  mode: RouteStepMode
  routeName: string
  defaultDayCount?: number
  /** 手动输入路线时必填；进入填写步后写入出团日期。 */
  startDate?: string
  templateId?: string
  copyFromDepartureId?: string
  sourceDepartureNo?: string
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
  driverSupplierId?: string
  guideSupplierId?: string
  vehiclePlate?: string
  contactPhone?: string
}

export type InfoFormValues = InfoStepValues & {
  dayCount: number
}

export function createInitialRouteStepValues(): RouteStepValues {
  return { mode: 'template', routeName: '' }
}

export function formatChineseMonthDay(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number)
  return `${month}月${day}日`
}

/** 出团日期中文：`YYYY年M月D日`（如 2026年7月30日）。 */
export function formatChineseYearMonthDay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

/** 默认团名：仅路线名；传入出团日期后前缀「YYYY年M月D日」。 */
export function buildDefaultDepartureName(routeName: string, startDate?: string): string {
  const trimmed = routeName.trim()
  if (!startDate) return trimmed
  return `${formatChineseYearMonthDay(startDate)} ${trimmed}`
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

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })

export function getShanghaiTodayString(): string {
  return shanghaiDateFormatter.format(new Date())
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

  return route.routeName.trim().length > 0 && Boolean(route.startDate)
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
    departureType: info.departureType,
    notes: info.notes?.trim() || undefined,
  }

  if (info.driverSupplierId) {
    payload.driverSupplierId = info.driverSupplierId
  }
  if (info.guideSupplierId) {
    payload.guideSupplierId = info.guideSupplierId
  }
  if (info.vehiclePlate?.trim()) {
    payload.vehiclePlate = info.vehiclePlate.trim()
  }
  if (info.contactPhone?.trim()) {
    payload.contactPhone = info.contactPhone.trim()
  }

  if (route.mode === 'template' && route.templateId) {
    payload.templateId = route.templateId
  }

  return payload
}

export function buildCopyDeparturePayload(
  _route: RouteStepValues,
  info: InfoStepValues,
): CopyDepartureDto {
  return {
    name: info.name.trim(),
    startDate: info.startDate,
    endDate: info.endDate,
    ownerUserId: info.ownerUserId,
    departureType: info.departureType,
    notes: info.notes?.trim() || undefined,
  }
}

export function createInfoFormValues(
  route: RouteStepValues,
  ownerUserId: string,
  startDate: string,
  departureNo: string,
): InfoFormValues {
  const endDate =
    route.defaultDayCount && route.defaultDayCount > 0
      ? computeEndDateFromDefaultDays(startDate, route.defaultDayCount)
      : startDate

  return {
    name: buildDefaultDepartureName(route.routeName, startDate),
    departureNo,
    departureType: DepartureType.COMBINED,
    startDate,
    endDate,
    dayCount: computeDayCount(startDate, endDate),
    ownerUserId,
    notes: undefined,
  }
}

export function buildRouteSummary(route: RouteStepValues): string | null {
  if (route.mode === 'copy' && route.sourceDepartureNo) {
    return `复制自发团 ${route.sourceDepartureNo}，不含客源与财务`
  }

  return buildTemplateCopySummary(route)
}

function buildTemplateCopySummary(route: RouteStepValues): string | null {
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
