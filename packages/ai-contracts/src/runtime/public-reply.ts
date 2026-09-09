import { stripEnglishChainOfThought } from './visible-reasoning'

export const PUBLIC_REPLY_FALLBACK = '已处理当前说明。'

export type PublicStreamChannel = 'public' | 'reasoning'

const THINK_OPEN = /<think>/i
const THINK_CLOSE = /<\/think>/i
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi
const THINK_UNCLOSED = /<think>[\s\S]*$/i
const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

export function stripThinkTags(text: string): string {
  return text.replace(THINK_BLOCK, '').replace(THINK_UNCLOSED, '')
}

/**
 * Final User-visible reply persisted as agent_message.
 * Prefer streamed text-delta; never keep 思考过程 that the stream already
 * classified, or `<think>` blocks from thinking-disabled content.
 */
function visiblePublicText(text: string): string {
  return stripEnglishChainOfThought(stripThinkTags(text.replace(/\u0000/g, '')))
}

export function selectPublicReply(input: {
  streamedPublicText: string
  streamedReasoning?: string | readonly string[]
  fullOutputText: string
}): string {
  const streamed = visiblePublicText(input.streamedPublicText)
  if (streamed.length > 0) {
    return streamed
  }
  const reasons = (Array.isArray(input.streamedReasoning)
    ? input.streamedReasoning
    : [input.streamedReasoning ?? '']
  )
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
  let next = visiblePublicText(input.fullOutputText)
  for (const reason of reasons) {
    next = next.split(reason).join('')
  }
  next = next.trim()
  return next || PUBLIC_REPLY_FALLBACK
}

function suffixTagHoldback(text: string, tags: readonly string[]): number {
  const lower = text.toLowerCase()
  let hold = 0
  for (const tag of tags) {
    const max = Math.min(tag.length - 1, lower.length)
    for (let n = max; n >= 1; n--) {
      if (lower.endsWith(tag.slice(0, n))) {
        hold = Math.max(hold, n)
        break
      }
    }
  }
  return hold
}

export function createThinkTagSplitter() {
  let inThink = false
  let holdback = ''

  function consume(delta: string, ended: boolean): Array<{ channel: PublicStreamChannel; text: string }> {
    const parts: Array<{ channel: PublicStreamChannel; text: string }> = []
    let rest = holdback + delta
    holdback = ''

    const emit = (channel: PublicStreamChannel, text: string) => {
      if (text.length > 0) {
        parts.push({ channel, text })
      }
    }

    while (rest.length > 0) {
      if (inThink) {
        const closeMatch = rest.match(THINK_CLOSE)
        if (!closeMatch || closeMatch.index == null) {
          if (!ended) {
            const hold = suffixTagHoldback(rest, [CLOSE_TAG])
            if (hold > 0) {
              emit('reasoning', rest.slice(0, rest.length - hold))
              holdback = rest.slice(rest.length - hold)
              break
            }
          }
          emit('reasoning', rest)
          break
        }
        emit('reasoning', rest.slice(0, closeMatch.index))
        rest = rest.slice(closeMatch.index + closeMatch[0].length)
        inThink = false
        continue
      }
      const openMatch = rest.match(THINK_OPEN)
      if (!openMatch || openMatch.index == null) {
        if (!ended) {
          const hold = suffixTagHoldback(rest, [OPEN_TAG, CLOSE_TAG])
          if (hold > 0) {
            emit('public', rest.slice(0, rest.length - hold))
            holdback = rest.slice(rest.length - hold)
            break
          }
        }
        emit('public', rest)
        break
      }
      emit('public', rest.slice(0, openMatch.index))
      rest = rest.slice(openMatch.index + openMatch[0].length)
      inThink = true
    }
    return parts
  }

  return {
    push(delta: string): Array<{ channel: PublicStreamChannel; text: string }> {
      return consume(delta, false)
    },
    flush(): Array<{ channel: PublicStreamChannel; text: string }> {
      const parts = consume('', true)
      inThink = false
      holdback = ''
      return parts
    },
  }
}
