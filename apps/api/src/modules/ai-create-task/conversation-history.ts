import { AiConversationStatus } from '@prisma/client'
import type { ConversationHistoryItem } from '@xiaotuanbao/shared'

export function toHistoryItem(
  conversation: {
    id: string
    title: string
    status: AiConversationStatus
    lastActivityAt: Date
  },
  now: Date,
): ConversationHistoryItem {
  return {
    id: conversation.id,
    title: conversation.title,
    status: conversation.status === AiConversationStatus.archived ? 'archived' : 'open',
    lastActivityAt: conversation.lastActivityAt.toISOString(),
    activityGroup: activityGroupFor(conversation.lastActivityAt, now),
  }
}

export function activityGroupFor(
  lastActivityAt: Date,
  now: Date,
): ConversationHistoryItem['activityGroup'] {
  const startOfToday = startOfShanghaiDay(now)
  const startOfYesterday = addUtcDays(startOfToday, -1)
  const startOfLast7Days = addUtcDays(startOfToday, -6)
  if (lastActivityAt >= startOfToday) {
    return 'today'
  }
  if (lastActivityAt >= startOfYesterday) {
    return 'yesterday'
  }
  if (lastActivityAt >= startOfLast7Days) {
    return 'last_7_days'
  }
  return 'earlier'
}

export function startOfShanghaiDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  return new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0))
}

export function encodeHistoryCursor(lastActivityAt: Date, id: string): string {
  return Buffer.from(`${lastActivityAt.toISOString()}|${id}`, 'utf8').toString('base64url')
}

export function decodeHistoryCursor(cursor: string): { lastActivityAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    const separator = decoded.lastIndexOf('|')
    const timestamp = decoded.slice(0, separator)
    const id = decoded.slice(separator + 1)
    const lastActivityAt = new Date(timestamp)
    if (!id || Number.isNaN(lastActivityAt.getTime())) {
      return null
    }
    return { lastActivityAt, id }
  } catch {
    return null
  }
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
}
