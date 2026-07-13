import { describe, expect, it } from 'vitest'
import {
  counterpartyFilterFromSegmentResource,
  counterpartyFilterFromSourceOrder,
} from './payment-schedule-view-counterparty'

describe('payment-schedule-view-counterparty', () => {
  it('maps source-order customer name to counterparty keyword', () => {
    expect(
      counterpartyFilterFromSourceOrder({ partnerName: '华东国旅' }),
    ).toEqual({
      counterpartyKeyword: '华东国旅',
    })
  })

  it('maps resource counterparty name to keyword', () => {
    expect(
      counterpartyFilterFromSegmentResource({
        counterpartyName: '新疆丝路旅汽',
      }),
    ).toEqual({
      counterpartyKeyword: '新疆丝路旅汽',
    })
  })

  it('returns undefined when names are blank', () => {
    expect(counterpartyFilterFromSourceOrder({ partnerName: '  ' })).toBeUndefined()
    expect(
      counterpartyFilterFromSegmentResource({ counterpartyName: '' }),
    ).toBeUndefined()
  })
})
