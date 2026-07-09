import { BadRequestException } from '@nestjs/common'
import { formatDateOnly } from './departure-date.utils'

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

export function validateSegmentFields(input: {
  name?: string
  destination?: string
}): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new BadRequestException('请填写行程段名称')
  }

  if (input.destination !== undefined && !input.destination.trim()) {
    throw new BadRequestException('请填写目的地')
  }
}
