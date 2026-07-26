import { describe, expect, it } from 'vitest'
import { ProductScheduleStatus } from '@xiaotuanbao/shared'
import { buildProductSchedulePayload } from './schedule-form'

describe('buildProductSchedulePayload', () => {
  it('omits empty price fields so backend can apply spec defaults', () => {
    const payload = buildProductSchedulePayload({
      title: '7月天天发',
      dateRuleText: '天天发团',
      status: ProductScheduleStatus.ON_SALE,
      priceOnInquiry: false,
      adultPriceYuan: null,
      childPriceYuan: undefined,
      singleRoomSupplementYuan: null,
    })

    expect(payload).not.toHaveProperty('adultPriceCents')
    expect(payload).not.toHaveProperty('childPriceCents')
    expect(payload).not.toHaveProperty('singleRoomSupplementCents')
    expect(structuredClone(payload)).not.toHaveProperty('adultPriceCents')
  })

  it('includes converted price cents when provided', () => {
    const payload = buildProductSchedulePayload({
      title: '',
      status: ProductScheduleStatus.ON_SALE,
      priceOnInquiry: false,
      adultPriceYuan: 2380,
      childPriceYuan: 1800,
      singleRoomSupplementYuan: 400,
    })

    expect(payload.adultPriceCents).toBe(238_000)
    expect(payload.childPriceCents).toBe(180_000)
    expect(payload.singleRoomSupplementCents).toBe(40_000)
  })

  it('allows inquiry schedules without adult price', () => {
    const payload = buildProductSchedulePayload({
      title: '询价班期',
      status: ProductScheduleStatus.ON_SALE,
      priceOnInquiry: true,
      adultPriceYuan: null,
    })

    expect(payload.priceOnInquiry).toBe(true)
    expect(payload).not.toHaveProperty('adultPriceCents')
  })
})
