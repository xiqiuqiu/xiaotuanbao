import { BadRequestException } from '@nestjs/common'
import { parseDateOnly } from './departure-date.utils'
import { resolveSegmentDatePair, validateSegmentDates } from './segment.validation'

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

describe('resolveSegmentDatePair', () => {
  const departureStart = parseDateOnly('2026-08-01')
  const departureEnd = parseDateOnly('2026-08-10')

  it('creates empty dates when both omitted', () => {
    expect(
      resolveSegmentDatePair({
        startDate: undefined,
        endDate: undefined,
        departureStartDate: departureStart,
        departureEndDate: departureEnd,
        mode: 'create',
      }),
    ).toEqual({ kind: 'empty', startDate: null, endDate: null, dayCount: null })
  })

  it('creates set dates when both provided', () => {
    const result = resolveSegmentDatePair({
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      departureStartDate: departureStart,
      departureEndDate: departureEnd,
      mode: 'create',
    })
    expect(result.kind).toBe('set')
    if (result.kind === 'set') {
      expect(result.dayCount).toBe(3)
    }
  })

  it('keeps existing dates when both omitted on update', () => {
    expect(
      resolveSegmentDatePair({
        startDate: undefined,
        endDate: undefined,
        departureStartDate: departureStart,
        departureEndDate: departureEnd,
        existing: {
          startDate: parseDateOnly('2026-08-01'),
          endDate: parseDateOnly('2026-08-03'),
          dayCount: 3,
        },
        mode: 'update',
      }),
    ).toEqual({ kind: 'keep' })
  })

  it('clears dates when both null on update', () => {
    expect(
      resolveSegmentDatePair({
        startDate: null,
        endDate: null,
        departureStartDate: departureStart,
        departureEndDate: departureEnd,
        mode: 'update',
      }),
    ).toEqual({ kind: 'empty', startDate: null, endDate: null, dayCount: null })
  })

  it('rejects unpaired dates', () => {
    expect(() =>
      resolveSegmentDatePair({
        startDate: '2026-08-01',
        endDate: null,
        departureStartDate: departureStart,
        departureEndDate: departureEnd,
        mode: 'create',
      }),
    ).toThrow(new BadRequestException('开始日期与结束日期须同时填写或同时清空'))
  })
})
