import {
  activityGroupFor,
  decodeHistoryCursor,
  encodeHistoryCursor,
  startOfShanghaiDay,
} from './conversation-history'

describe('conversation history grouping', () => {
  it('groups last activity by Shanghai calendar day', () => {
    const now = new Date('2026-08-25T04:00:00.000Z')
    expect(activityGroupFor(new Date('2026-08-25T02:00:00.000Z'), now)).toBe('today')
    expect(activityGroupFor(new Date('2026-08-24T10:00:00.000Z'), now)).toBe('yesterday')
    expect(activityGroupFor(new Date('2026-08-20T10:00:00.000Z'), now)).toBe('last_7_days')
    expect(activityGroupFor(new Date('2026-07-01T10:00:00.000Z'), now)).toBe('earlier')
    expect(startOfShanghaiDay(now).toISOString()).toBe('2026-08-24T16:00:00.000Z')
  })

  it('round-trips the activity cursor', () => {
    const lastActivityAt = new Date('2026-08-21T12:00:00.000Z')
    const cursor = encodeHistoryCursor(lastActivityAt, 'conv-1')
    expect(decodeHistoryCursor(cursor)).toEqual({ lastActivityAt, id: 'conv-1' })
    expect(decodeHistoryCursor('not-a-cursor')).toBeNull()
  })
})
