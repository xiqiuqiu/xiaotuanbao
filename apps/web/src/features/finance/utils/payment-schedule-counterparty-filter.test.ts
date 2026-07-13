import { describe, expect, it } from 'vitest'
import { CounterpartyType } from '@xiaotuanbao/shared'
import {
  buildCounterpartyCascaderOptions,
  counterpartyTypeOptionsForDirection,
  decodeCounterpartyEntityKey,
  encodeCounterpartyEntityKey,
  toCounterpartyCascaderValue,
} from './payment-schedule-counterparty-filter'

describe('payment-schedule-counterparty-filter', () => {
  it('encodes and decodes id-backed counterparties', () => {
    const key = encodeCounterpartyEntityKey({
      counterpartyId: 'sup-1',
      counterpartyName: '丝路旅汽',
    })
    expect(key).toBe('id:sup-1')
    expect(decodeCounterpartyEntityKey(key)).toEqual({ counterpartyId: 'sup-1' })
  })

  it('encodes and decodes name-only counterparties', () => {
    const key = encodeCounterpartyEntityKey({
      counterpartyId: null,
      counterpartyName: '手改客人',
    })
    expect(key).toBe('name:手改客人')
    expect(decodeCounterpartyEntityKey(key)).toEqual({ counterpartyName: '手改客人' })
  })

  it('limits type options by schedule direction', () => {
    expect(counterpartyTypeOptionsForDirection('receivable').map((item) => item.value)).toEqual([
      CounterpartyType.PARTNER,
      CounterpartyType.GUEST,
    ])
    expect(counterpartyTypeOptionsForDirection('payable').map((item) => item.value)).toEqual([
      CounterpartyType.SUPPLIER,
      CounterpartyType.PARTNER,
    ])
  })

  it('builds cascader options grouped by type', () => {
    expect(
      buildCounterpartyCascaderOptions('payable', [
        {
          counterpartyType: 'supplier',
          counterpartyId: 'sup-1',
          counterpartyName: '丝路旅汽',
        },
        {
          counterpartyType: 'partner',
          counterpartyId: 'p-1',
          counterpartyName: '巴州博湖旅行社',
        },
      ]),
    ).toEqual([
      {
        value: CounterpartyType.SUPPLIER,
        label: '供应商',
        children: [{ value: 'id:sup-1', label: '丝路旅汽' }],
      },
      {
        value: CounterpartyType.PARTNER,
        label: '合作伙伴',
        children: [{ value: 'id:p-1', label: '巴州博湖旅行社' }],
      },
    ])
  })

  it('maps type-only and type+entity selections to cascader value', () => {
    expect(toCounterpartyCascaderValue(CounterpartyType.SUPPLIER)).toEqual([
      CounterpartyType.SUPPLIER,
    ])
    expect(toCounterpartyCascaderValue(CounterpartyType.SUPPLIER, 'id:sup-1')).toEqual([
      CounterpartyType.SUPPLIER,
      'id:sup-1',
    ])
    expect(toCounterpartyCascaderValue(undefined)).toBeUndefined()
  })
})
