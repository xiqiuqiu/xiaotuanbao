import { BadRequestException } from '@nestjs/common'
import { sourceOrderWriteFromReviewValues } from './source-order-review.mapper'

const completeValues = {
  partnerId: 'partner-1',
  adultGuestCount: 8,
  childGuestCount: 2,
  adultUnitPriceCents: 680000,
  childUnitPriceCents: 420000,
  fareAdjustments: [
    { kind: 'single_room_topup', direction: 'increase', amountCents: 60000 },
    { kind: 'lodging_deduction', direction: 'decrease', amountCents: 40000 },
  ],
  discountType: 'lump_sum',
  discountCents: 200000,
  collectionMode: 'split',
  depositCents: 2000000,
  balanceCents: 4100000,
  guests: [
    { name: '王强', phone: '13800000000', included: true },
    { name: '  ', included: true },
    { name: '刘童童', included: false },
  ],
}

describe('sourceOrderWriteFromReviewValues #446', () => {
  it('does not fill missing quote or discount fields with zeros', () => {
    expect(() =>
      sourceOrderWriteFromReviewValues({
        partnerId: 'partner-1',
        adultGuestCount: 8,
        childGuestCount: null,
        adultUnitPriceCents: 680000,
        fareAdjustments: [],
        discountType: null,
        collectionMode: 'partner_settled',
      }),
    ).toThrow(new BadRequestException('请先确认缺失项：儿童人数、优惠方式'))
  })

  it('treats an empty adjustment list as confirmed none, not as missing', () => {
    const written = sourceOrderWriteFromReviewValues({
      ...completeValues,
      fareAdjustments: [],
      discountType: 'none',
      collectionMode: 'partner_settled',
    })
    expect(written.dto.fareAdjustments).toEqual([])
    expect(written.dto.discountType).toBe('none')
    expect(written.dto.discountCents).toBe(0)
  })

  it('writes only named guests that are included in this confirmation', () => {
    const written = sourceOrderWriteFromReviewValues(completeValues)
    expect(written.guests).toEqual([{ name: '王强', phone: '13800000000' }])
    expect(written.dto.adultGuestCount).toBe(8)
    expect(written.dto.childGuestCount).toBe(2)
  })
})
