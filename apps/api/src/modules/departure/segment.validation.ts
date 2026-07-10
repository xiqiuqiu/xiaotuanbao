import { BadRequestException } from '@nestjs/common'
import { computeDayCount, formatDateOnly, parseDateOnly } from './departure-date.utils'

export interface SegmentDateValidationInput {
  startDate: Date
  endDate: Date
  departureStartDate: Date
  departureEndDate: Date
}

export function validateSegmentDates(input: SegmentDateValidationInput): void {
  const start = formatDateOnly(input.startDate)
  const end = formatDateOnly(input.endDate)
  const departureStart = formatDateOnly(input.departureStartDate)
  const departureEnd = formatDateOnly(input.departureEndDate)

  if (end < start) {
    throw new BadRequestException('结束日期不能早于开始日期')
  }

  if (start < departureStart || end > departureEnd) {
    throw new BadRequestException('行程段日期不能超出发团日期')
  }
}

export function validateSegmentFields(input: { name?: string }): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new BadRequestException('请填写行程段名称')
  }
}

export type ResolvedSegmentDates =
  | { kind: 'empty'; startDate: null; endDate: null; dayCount: null }
  | { kind: 'set'; startDate: Date; endDate: Date; dayCount: number }

/** Resolve create/update date pair: both empty, both set, or reject unpaired. */
export function resolveSegmentDatePair(input: {
  startDate: string | null | undefined
  endDate: string | null | undefined
  departureStartDate: Date
  departureEndDate: Date
  /** When both omitted on update, keep existing. */
  existing?: { startDate: Date | null; endDate: Date | null; dayCount: number | null }
  mode: 'create' | 'update'
}): ResolvedSegmentDates | { kind: 'keep' } {
  const { startDate, endDate, mode, existing } = input

  const startOmitted = startDate === undefined
  const endOmitted = endDate === undefined
  const startEmpty = startDate === null || startDate === ''
  const endEmpty = endDate === null || endDate === ''
  const startSet = typeof startDate === 'string' && startDate.length > 0
  const endSet = typeof endDate === 'string' && endDate.length > 0

  if (mode === 'update' && startOmitted && endOmitted) {
    return { kind: 'keep' }
  }

  if ((startEmpty || (mode === 'create' && startOmitted)) && (endEmpty || (mode === 'create' && endOmitted))) {
    return { kind: 'empty', startDate: null, endDate: null, dayCount: null }
  }

  if (startSet && endSet) {
    const parsedStart = parseDateOnly(startDate)
    const parsedEnd = parseDateOnly(endDate)
    validateSegmentDates({
      startDate: parsedStart,
      endDate: parsedEnd,
      departureStartDate: input.departureStartDate,
      departureEndDate: input.departureEndDate,
    })
    return {
      kind: 'set',
      startDate: parsedStart,
      endDate: parsedEnd,
      dayCount: computeDayCount(parsedStart, parsedEnd),
    }
  }

  // Update with one omitted: fill from existing only if the other side is set/empty consistently
  if (mode === 'update' && existing) {
    if (startSet && endOmitted) {
      throw new BadRequestException('开始日期与结束日期须同时填写或同时清空')
    }
    if (endSet && startOmitted) {
      throw new BadRequestException('开始日期与结束日期须同时填写或同时清空')
    }
    if (startEmpty && endOmitted) {
      throw new BadRequestException('开始日期与结束日期须同时填写或同时清空')
    }
    if (endEmpty && startOmitted) {
      throw new BadRequestException('开始日期与结束日期须同时填写或同时清空')
    }
  }

  throw new BadRequestException('开始日期与结束日期须同时填写或同时清空')
}

export function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed || null
}
