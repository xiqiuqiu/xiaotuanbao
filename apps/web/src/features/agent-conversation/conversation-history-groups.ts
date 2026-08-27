import type { ConversationHistoryItem } from '@xiaotuanbao/shared'

export const HISTORY_GROUP_LABELS = {
  today: '今天',
  yesterday: '昨天',
  last_7_days: '最近 7 天',
  earlier: '更早',
} as const

export function groupConversationHistory(
  items: ConversationHistoryItem[],
): Array<{ key: ConversationHistoryItem['activityGroup']; label: string; items: ConversationHistoryItem[] }> {
  const buckets: Record<ConversationHistoryItem['activityGroup'], ConversationHistoryItem[]> = {
    today: [],
    yesterday: [],
    last_7_days: [],
    earlier: [],
  }
  for (const item of items) {
    buckets[item.activityGroup].push(item)
  }
  const groups: Array<{
    key: ConversationHistoryItem['activityGroup']
    label: string
    items: ConversationHistoryItem[]
  }> = []
  for (const key of Object.keys(HISTORY_GROUP_LABELS) as Array<
    ConversationHistoryItem['activityGroup']
  >) {
    if (buckets[key].length > 0) {
      groups.push({
        key,
        label: HISTORY_GROUP_LABELS[key],
        items: buckets[key],
      })
    }
  }
  return groups
}
