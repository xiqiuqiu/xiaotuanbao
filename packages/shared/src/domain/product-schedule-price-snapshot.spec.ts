import {
  canPublishProduct,
  isDisplayableProductSchedule,
  isEffectiveProductSchedule,
  snapshotSchedulePricesFromSpec,
} from './product-schedule-price-snapshot'

describe('ADR-0025 班期价格快照', () => {
  it('创建班期时从规格默认价复制出独立快照（疆游记样例：成人 2380 元）', () => {
    // 独立真值：客户 Excel「7月2380」→ 2380 元 = 238000 分
    const snapshot = snapshotSchedulePricesFromSpec({
      adultPriceCents: 238_000,
      childPriceCents: 198_000,
      singleSupplementCents: 50_000,
    })

    expect(snapshot).toEqual({
      adultPriceCents: 238_000,
      childPriceCents: 198_000,
      singleSupplementCents: 50_000,
    })
  })

  it('快照是值拷贝：改规格默认价对象后，既有快照字面量不变', () => {
    const defaults = {
      adultPriceCents: 238_000,
      childPriceCents: 198_000,
      singleSupplementCents: 50_000,
    }
    const julySnapshot = snapshotSchedulePricesFromSpec(defaults)

    defaults.adultPriceCents = 280_000
    defaults.childPriceCents = 220_000
    defaults.singleSupplementCents = 60_000

    expect(julySnapshot).toEqual({
      adultPriceCents: 238_000,
      childPriceCents: 198_000,
      singleSupplementCents: 50_000,
    })
  })
})

describe('Product 上架与班期有效性', () => {
  it('可展示班期：有成人价或询价，且非已取消', () => {
    expect(
      isDisplayableProductSchedule({
        status: 'on_sale',
        adultPriceCents: 238_000,
        inquireOnly: false,
      }),
    ).toBe(true)
    expect(
      isDisplayableProductSchedule({
        status: 'on_sale',
        adultPriceCents: null,
        inquireOnly: true,
      }),
    ).toBe(true)
    expect(
      isDisplayableProductSchedule({
        status: 'cancelled',
        adultPriceCents: 238_000,
        inquireOnly: false,
      }),
    ).toBe(false)
    expect(
      isDisplayableProductSchedule({
        status: 'on_sale',
        adultPriceCents: null,
        inquireOnly: false,
      }),
    ).toBe(false)
  })

  it('已取消班期不计入有效统计', () => {
    expect(isEffectiveProductSchedule({ status: 'on_sale' })).toBe(true)
    expect(isEffectiveProductSchedule({ status: 'closed' })).toBe(true)
    expect(isEffectiveProductSchedule({ status: 'cancelled' })).toBe(false)
  })

  it('上架门槛：名称 + 简版 + 至少一条可展示班期', () => {
    expect(
      canPublishProduct({
        name: '北疆大巴纯玩',
        shortItinerary: 'D1 乌鲁木齐…',
        schedules: [{ status: 'on_sale', adultPriceCents: 238_000, inquireOnly: false }],
      }),
    ).toBe(true)

    expect(
      canPublishProduct({
        name: '北疆大巴纯玩',
        shortItinerary: 'D1 乌鲁木齐…',
        schedules: [{ status: 'on_sale', adultPriceCents: null, inquireOnly: true }],
      }),
    ).toBe(true)

    expect(
      canPublishProduct({
        name: '北疆大巴纯玩',
        shortItinerary: '',
        schedules: [{ status: 'on_sale', adultPriceCents: 238_000, inquireOnly: false }],
      }),
    ).toBe(false)

    expect(
      canPublishProduct({
        name: '北疆大巴纯玩',
        shortItinerary: 'D1 乌鲁木齐…',
        schedules: [{ status: 'cancelled', adultPriceCents: 238_000, inquireOnly: false }],
      }),
    ).toBe(false)
  })
})
