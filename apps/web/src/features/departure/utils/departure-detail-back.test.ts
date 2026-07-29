import { describe, expect, it } from 'vitest'
import { encodeDepartureListReturn } from './departure-list-search'
import { resolveDepartureDetailBackAction } from './departure-detail-back'

describe('resolveDepartureDetailBackAction', () => {
  it('restores 发团管理 when detail was opened with durable listReturn', () => {
    const encoded = encodeDepartureListReturn({
      keyword: '北疆',
      page: 2,
      status: 'editing',
      view: 'route-ledger',
    })

    expect(resolveDepartureDetailBackAction(undefined, encoded)).toEqual({
      type: 'departure-list',
      search: {
        keyword: '北疆',
        page: 2,
        status: 'editing',
        view: 'route-ledger',
      },
    })
  })

  it('restores 发团管理 from in-session list location.state', () => {
    expect(
      resolveDepartureDetailBackAction({
        listSearch: {
          keyword: '乌镇',
          view: 'departure-list',
        },
      }),
    ).toEqual({
      type: 'departure-list',
      search: {
        keyword: '乌镇',
        view: 'departure-list',
      },
    })
  })

  it('returns to jump source (history) when detail was not opened from 发团管理', () => {
    // Symptom: workbench / finance / deep link → detail → back still hard-jumps to /departure.
    expect(resolveDepartureDetailBackAction(undefined)).toEqual({
      type: 'history-back',
    })
    expect(resolveDepartureDetailBackAction(null)).toEqual({
      type: 'history-back',
    })
    expect(resolveDepartureDetailBackAction({ somethingElse: true })).toEqual({
      type: 'history-back',
    })
  })
})
