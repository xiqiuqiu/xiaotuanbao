import { describe, expect, it } from 'vitest'
import {
  counterpartyCollectionMethodText,
  counterpartyDisplayName,
} from './counterparty-display'

describe('counterparty display helpers', () => {
  it('maps guest type to 游客代收 method and bare name', () => {
    expect(counterpartyCollectionMethodText('guest')).toBe('游客代收')
    expect(counterpartyDisplayName('福建土楼专线地接 7月25日发客')).toBe(
      '福建土楼专线地接 7月25日发客',
    )
  })

  it('maps partner/supplier types and falls back empty name to dash', () => {
    expect(counterpartyCollectionMethodText('partner')).toBe('合作伙伴')
    expect(counterpartyCollectionMethodText('supplier')).toBe('供应商')
    expect(counterpartyDisplayName(null)).toBe('-')
    expect(counterpartyDisplayName('  ')).toBe('-')
  })
})
