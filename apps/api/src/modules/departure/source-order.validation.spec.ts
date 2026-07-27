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
  depositCents: 100000,
  balanceCents: 220000,
  fareAdjustments: [],
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

  it('rejects when settlement would be negative from discount alone', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        discountType: 'lump_sum',
        discountCents: 320001,
      }),
    ).toThrow(new BadRequestException('结算金额不能为负数'))
  })

  it('allows discount above gross when increase adjustments keep settlement non-negative', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        discountType: 'lump_sum',
        discountCents: 340000,
        fareAdjustments: [
          {
            kind: 'single_room_supplement',
            direction: 'increase',
            amountCents: 20000,
          },
        ],
      }),
    ).not.toThrow()
  })

  it('rejects when decrease adjustments and discount make settlement negative', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        discountType: 'lump_sum',
        discountCents: 200000,
        fareAdjustments: [
          {
            kind: 'student_ticket_pre_discounted',
            direction: 'decrease',
            amountCents: 130000,
          },
        ],
      }),
    ).toThrow(new BadRequestException('结算金额不能为负数'))
  })

  it('allows partner collected (deposit) greater than settlement amount', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        collectionMode: 'split',
        depositCents: 320001,
        balanceCents: 10000,
      }),
    ).not.toThrow()
  })

  it('allows split where deposit + balance does not equal settlement', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        collectionMode: 'split',
        depositCents: 20000,
        balanceCents: 600000,
      }),
    ).not.toThrow()
  })

  it('rejects collection modes when G约定 is zero', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        collectionMode: 'guest_only',
        depositCents: 0,
        balanceCents: 0,
      }),
    ).toThrow(new BadRequestException('代收场景的 G约定 必须大于0'))

    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        collectionMode: 'split',
        depositCents: 100000,
        balanceCents: 0,
      }),
    ).toThrow(new BadRequestException('代收场景的 G约定 必须大于0'))
  })

  it('rejects negative deposit or balance', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        depositCents: -1,
      }),
    ).toThrow(new BadRequestException('定金不能为负数'))

    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        balanceCents: -1,
      }),
    ).toThrow(new BadRequestException('尾款不能为负数'))
  })

  it('accepts partner_settled without deposit/balance', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
      }),
    ).not.toThrow()
  })

  it('rejects duplicate fixed fare-adjustment kinds', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        fareAdjustments: [
          {
            kind: 'single_room_supplement',
            direction: 'increase',
            amountCents: 10000,
          },
          {
            kind: 'single_room_supplement',
            direction: 'increase',
            amountCents: 20000,
          },
        ],
      }),
    ).toThrow(new BadRequestException('同一固定种类的团款调整项只能有一行'))
  })

  it('rejects zero-amount fare adjustments', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        fareAdjustments: [
          {
            kind: 'child_ticket',
            direction: 'increase',
            amountCents: 0,
          },
        ],
      }),
    ).toThrow(new BadRequestException('团款调整项金额必须大于0'))
  })

  it('rejects custom fare adjustments without a name', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        fareAdjustments: [
          {
            kind: 'custom',
            direction: 'increase',
            amountCents: 10000,
            customName: '  ',
          },
        ],
      }),
    ).toThrow(new BadRequestException('自定义团款调整项必须填写名称'))
  })

  it('rejects fixed kinds with a mismatched direction', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        fareAdjustments: [
          {
            kind: 'single_room_supplement',
            direction: 'decrease',
            amountCents: 10000,
          },
        ],
      }),
    ).toThrow(new BadRequestException('固定种类的团款调整方向不可修改'))
  })

  it('accepts multiple custom fare adjustments with names', () => {
    expect(() =>
      validateSourceOrderInput({
        ...validBase,
        fareAdjustments: [
          {
            kind: 'custom',
            direction: 'increase',
            amountCents: 10000,
            customName: '不含首晚住宿补偿',
          },
          {
            kind: 'custom',
            direction: 'decrease',
            amountCents: 5000,
            customName: '其他协商扣减',
          },
        ],
      }),
    ).not.toThrow()
  })
})
