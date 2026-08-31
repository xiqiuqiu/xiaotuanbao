import {
  CopilotChatReasoningMessage,
  type CopilotChatReasoningMessageProps,
} from '@copilotkit/react-core/v2'
import type { HTMLAttributes } from 'react'
import {
  ChatWorkingMascot,
  CHAT_WORKING_MASCOT_SIZE,
} from '@/components/mascot'
import styles from './agent-reasoning-message.module.css'

const DEFAULT_WORK_DESCRIPTION = '正在处理你的请求'
const MAX_WORK_DESCRIPTION_LENGTH = 36

/** Synthetic reasoning id when the agent is in-flight before the first reasoning token. */
export const WORKING_REASONING_SLOT_ID = 'live-reasoning-working'

type ChatMessage = NonNullable<CopilotChatReasoningMessageProps['messages']>[number]

function workDescription(content: unknown): string {
  if (typeof content !== 'string') return DEFAULT_WORK_DESCRIPTION
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return DEFAULT_WORK_DESCRIPTION
  return normalized.length > MAX_WORK_DESCRIPTION_LENGTH
    ? `${normalized.slice(0, MAX_WORK_DESCRIPTION_LENGTH)}…`
    : normalized
}

function latestReasoningMessageId(messages: CopilotChatReasoningMessageProps['messages']) {
  if (!messages) return null
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index]
    if (candidate?.role === 'reasoning') return candidate.id
  }
  return null
}

/**
 * Durable assistant reply for this turn: persisted `event-*` id with non-empty content.
 * Live streaming (`live-assistant-*`) must NOT count as done.
 */
export function hasDurableAssistantAfter(
  messages: CopilotChatReasoningMessageProps['messages'],
  reasoningMessageId: string,
): boolean {
  if (!messages) return false
  const index = messages.findIndex((entry) => entry?.id === reasoningMessageId)
  if (index < 0) return false
  for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
    const candidate = messages[cursor]
    if (!candidate || candidate.role !== 'assistant') continue
    if (typeof candidate.id !== 'string' || !candidate.id.startsWith('event-')) continue
    const content = candidate.content
    if (typeof content === 'string' && content.trim().length > 0) return true
  }
  return false
}

/**
 * While the agent is running, ensure a reasoning row exists so CopilotKit does not
 * fall back to its black typing-cursor dot (`showCursor` when last ≠ reasoning).
 * Do not inject after a durable assistant already closed the turn (keeps #471).
 */
export function ensureAgentWorkingReasoningSlot(
  messages: ChatMessage[] | undefined,
  isRunning: boolean,
): ChatMessage[] {
  const list = messages ?? []
  if (!isRunning) return list

  const latestId = latestReasoningMessageId(list)
  if (latestId && !hasDurableAssistantAfter(list, latestId)) {
    return list
  }

  // Turn already has a durable reply (isRunning may still be true until batch settles).
  if (latestId && hasDurableAssistantAfter(list, latestId)) {
    return list
  }

  // No active reasoning row yet — open the working slot so the recording mascot mounts.
  return [
    ...list,
    {
      id: WORKING_REASONING_SLOT_ID,
      role: 'reasoning',
      content: DEFAULT_WORK_DESCRIPTION,
    },
  ]
}

/**
 * Replaces CopilotKit's default `CopilotChatMessageView.Cursor` (black pulse dot).
 * When a reasoning row owns the working mascot, the cursor is not shown; when it would
 * show (last ≠ reasoning), render an empty placeholder so the typing dot never appears
 * as the character.
 */
export function AgentWorkingCursor({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={className}
      data-testid="agent-working-cursor-slot"
      hidden
      aria-hidden
    />
  )
}

/**
 * Grok-style transient work indicator: only the latest running turn renders.
 * Reasoning stays non-expandable; its short live description appears on hover/focus.
 * Hide as soon as a durable assistant reply follows this reasoning row (do not wait for
 * batch_status completed — isRunning stays true through waiting/agent_running).
 *
 * Visual: recording capsule squash/flip/trails (`ChatWorkingMascot`), not bloub
 * `play→orbit→burst→comet`.
 */
export function AgentReasoningMessage({
  message,
  messages,
  isRunning,
  header: _header,
  contentView: _contentView,
  toggle: _toggle,
  children: _children,
  className,
  ...rootProps
}: CopilotChatReasoningMessageProps) {
  const isLatestRunningMessage = Boolean(
    isRunning && latestReasoningMessageId(messages) === message.id,
  )
  const turnFinished = hasDurableAssistantAfter(messages, message.id)

  if (!isLatestRunningMessage || turnFinished) return <></>

  const description = workDescription(message.content)
  const rootClassName = [styles.root, className].filter(Boolean).join(' ')

  return (
    <div
      {...rootProps}
      className={rootClassName}
      data-message-id={message.id}
      data-testid="agent-working-indicator"
    >
      <span className={styles.indicator} tabIndex={0} aria-label={description}>
        <ChatWorkingMascot
          size={CHAT_WORKING_MASCOT_SIZE}
          playing
          aria-label="Agent 正在工作"
        />
        <span className={styles.description} role="status">
          {description}
        </span>
      </span>
    </div>
  )
}

export namespace AgentReasoningMessage {
  export const Header = CopilotChatReasoningMessage.Header
  export const Content = CopilotChatReasoningMessage.Content
  export const Toggle = CopilotChatReasoningMessage.Toggle
}
