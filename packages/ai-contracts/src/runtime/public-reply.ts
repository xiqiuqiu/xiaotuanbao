import { stripEnglishChainOfThought } from './visible-reasoning'

export const PUBLIC_REPLY_FALLBACK = '已处理当前说明。'

export type PublicStreamChannel = 'public' | 'reasoning'

const THINK_OPEN = /<think>/i
const THINK_CLOSE = /<\/think>/i
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi

export function stripThinkTags(text: string): string {
  return text.replace(THINK_BLOCK, '')
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

export function createThinkTagSplitter() {
  let inThink = false
  return {
    push(delta: string): Array<{ channel: PublicStreamChannel; text: string }> {
      const parts: Array<{ channel: PublicStreamChannel; text: string }> = []
      let rest = delta
      while (rest.length > 0) {
        if (inThink) {
          const closeMatch = rest.match(THINK_CLOSE)
          if (!closeMatch || closeMatch.index == null) {
            parts.push({ channel: 'reasoning', text: rest })
            break
          }
          if (closeMatch.index > 0) {
            parts.push({ channel: 'reasoning', text: rest.slice(0, closeMatch.index) })
          }
          rest = rest.slice(closeMatch.index + closeMatch[0].length)
          inThink = false
          continue
        }
        const openMatch = rest.match(THINK_OPEN)
        if (!openMatch || openMatch.index == null) {
          parts.push({ channel: 'public', text: rest })
          break
        }
        if (openMatch.index > 0) {
          parts.push({ channel: 'public', text: rest.slice(0, openMatch.index) })
        }
        rest = rest.slice(openMatch.index + openMatch[0].length)
        inThink = true
      }
      return parts.filter((part) => part.text.length > 0)
    },
  }
}
