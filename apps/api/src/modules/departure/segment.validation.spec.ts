import { BadRequestException } from '@nestjs/common'
import { parseDateOnly } from './departure-date.utils'
import { validateSegmentDates } from './segment.validation'

describe('validateSegmentDates', () => {
  const departureStart = parseDateOnly('2026-08-01')
  const departureEnd = parseDateOnly('2026-08-10')

  it('accepts segment dates within departure range', () => {
    expect(() =>
      validateSegmentDates({
        startDate: parseDateOnly('2026-08-01'),
        endDate: parseDateOnly('2026-08-03'),
        departureStartDate: departureStart,
        departureEndDate: departureEnd,
      }),
    ).not.toThrow()
  })

  it('rejects end date before start date', () => {
    expect(() =>
      validateSegmentDates({
        startDate: parseDateOnly('2026-08-05'),
        endDate: parseDateOnly('2026-08-03'),
        departureStartDate: departureStart,
        departureEndDate: departureEnd,
      }),
    ).toThrow(new BadRequestException('结束日期不能早于开始日期'))
  })

  it('rejects segment dates outside departure range', () => {
    expect(() =>
      validateSegmentDates({
        startDate: parseDateOnly('2026-07-28'),
        endDate: parseDateOnly('2026-08-03'),
        departureStartDate: departureStart,
        departureEndDate: departureEnd,
      }),
    ).toThrow(new BadRequestException('行程段日期不能超出发团日期'))
  })
})
