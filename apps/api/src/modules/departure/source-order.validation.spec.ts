import { BadRequestException } from '@nestjs/common'
import { validateSourceOrderInput } from './source-order.validation'

const validBase = {
  partnerId: 'partner-1',
  adultGuestCount: 2,
  childGuestCount: 1,
  adultUnitPriceCents: 120000,
  childUnitPriceCents: 80000,
  discountType: 'none' as const,
  discountCents: 0,
  collectionMode: 'guest_only' as const,
  partnerCollectedCents: 0,
}

describe('validateSourceOrderInput', () => {
  it('accepts mixed adult/child counts with prices', () => {
    expect(() => validateSourceOrderInput(validBase)).not.toThrow()
  })

  it('rejects when total guest count is less than 1', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        adultGuestCount: 0,
        childGuestCount: 0,
      }),
    ).toThrow(new BadRequestException('总人数必须大于0'))
  })

  it('accepts adults only when child count is 0 and child price omitted', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        adultGuestCount: 2,
        childGuestCount: 0,
        childUnitPriceCents: undefined,
      }),
    ).not.toThrow()
  })

  it('rejects missing adult unit price when adult count is positive', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        adultUnitPriceCents: undefined,
      }),
    ).toThrow(new BadRequestException('成人团款单价不能为空'))
  })

  it('rejects missing child unit price when child count is positive', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        childUnitPriceCents: null,
      }),
    ).toThrow(new BadRequestException('儿童团款单价不能为空'))
  })

  it('accepts children only when adult count is 0', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        adultGuestCount: 0,
        childGuestCount: 1,
        adultUnitPriceCents: 0,
        childUnitPriceCents: 80000,
      }),
    ).not.toThrow()
  })

  it('accepts zero unit price when guest count is positive', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        adultUnitPriceCents: 0,
        childUnitPriceCents: 0,
      }),
    ).not.toThrow()
  })

  it('rejects negative adult guest count', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        adultGuestCount: -1,
      }),
    ).toThrow(new BadRequestException('成人人数不能为负数'))
  })

  it('rejects negative child guest count', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        childGuestCount: -1,
      }),
    ).toThrow(new BadRequestException('儿童人数不能为负数'))
  })

  it('rejects negative adult unit price', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        adultUnitPriceCents: -1,
      }),
    ).toThrow(new BadRequestException('成人团款单价不能为负数'))
  })

  it('rejects negative child unit price', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        childUnitPriceCents: -1,
      }),
    ).toThrow(new BadRequestException('儿童团款单价不能为负数'))
  })

  it('rejects discount greater than adult/child gross receivable', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        discountType: 'lump_sum',
        discountCents: 320001,
      }),
    ).toThrow(new BadRequestException('优惠金额不能大于原始应收'))
  })

  it('rejects partner collected greater than net from adult/child gross', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        collectionMode: 'split',
        partnerCollectedCents: 320001,
      }),
    ).toThrow(new BadRequestException('客户已收金额不能大于结算金额'))
  })
})
