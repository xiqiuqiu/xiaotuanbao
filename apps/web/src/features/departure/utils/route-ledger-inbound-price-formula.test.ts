import { describe, expect, it } from 'vitest'
import {
  formatRouteLedgerInboundPriceFormula,
  formatRouteLedgerInboundUnitPrice,
} from './route-ledger-inbound-price-formula'

describe('formatRouteLedgerInboundPriceFormula', () => {
  it('拼成人与儿童单价×人数为只读算式', () => {
    expect(
      formatRouteLedgerInboundPriceFormula({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 50000,
      }),
    ).toBe('1000×2+500×1')
  })

  it('儿童数为 0 时省略儿童项', () => {
    expect(
      formatRouteLedgerInboundPriceFormula({
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 90000,
        childUnitPriceCents: 40000,
      }),
    ).toBe('900×2')
  })

  it('人数皆 0 时为空串', () => {
    expect(
      formatRouteLedgerInboundPriceFormula({
        adultGuestCount: 0,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 50000,
      }),
    ).toBe('')
  })
})

describe('formatRouteLedgerInboundUnitPrice', () => {
  it('仅成人时只展示成人单价', () => {
    expect(
      formatRouteLedgerInboundUnitPrice({
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 90000,
        childUnitPriceCents: 40000,
      }),
    ).toBe('900')
  })

  it('有儿童时展示成人/儿童单价', () => {
    expect(
      formatRouteLedgerInboundUnitPrice({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 50000,
      }),
    ).toBe('1000/500')
  })

  it('人数皆 0 时为空串', () => {
    expect(
      formatRouteLedgerInboundUnitPrice({
        adultGuestCount: 0,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 50000,
      }),
    ).toBe('')
  })
})
