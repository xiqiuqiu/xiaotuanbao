import { describe, expect, it } from 'vitest'
import type { ConversationHistoryItem } from '@xiaotuanbao/shared'
import { groupConversationHistory } from './conversation-history-groups'

function item(
  id: string,
  activityGroup: ConversationHistoryItem['activityGroup'],
): ConversationHistoryItem {
  return {
    id,
    title: id,
    status: 'open',
    lastActivityAt: '2026-08-25T00:00:00.000Z',
    activityGroup,
  }
}

describe('groupConversationHistory', () => {
  it('keeps recent-activity groups in product order and drops empty buckets', () => {
    expect(
      groupConversationHistory([
        item('earlier', 'earlier'),
        item('today', 'today'),
        item('week', 'last_7_days'),
      ]).map((group) => group.label),
    ).toEqual(['今天', '最近 7 天', '更早'])
  })
})
