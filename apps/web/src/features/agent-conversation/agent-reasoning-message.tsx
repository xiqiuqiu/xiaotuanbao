import {
  CopilotChatReasoningMessage,
  type CopilotChatReasoningMessageProps,
} from '@copilotkit/react-core/v2'
import { Mascot } from '@/components/mascot'
import styles from './agent-reasoning-message.module.css'

const DEFAULT_WORK_DESCRIPTION = '正在处理你的请求'
const MAX_WORK_DESCRIPTION_LENGTH = 36
/** Chat-scale mascot: 56 CSS px keeps orbit rings ~1px+ readable. */
const CHAT_MASCOT_SIZE = 56
/** Face + colorful rings only; exclude faceless burst/comet from the catalog working cycle. */
const CHAT_WORKING_CYCLE = ['play', 'orbit'] as const

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
function hasDurableAssistantAfter(
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
 * Grok-style transient work indicator: only the latest running turn renders.
 * Reasoning stays non-expandable; its short live description appears on hover/focus.
 * Hide as soon as a durable assistant reply follows this reasoning row (do not wait for
 * batch_status completed — isRunning stays true through waiting/agent_running).
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
        <Mascot
          preset="working"
          cycle={[...CHAT_WORKING_CYCLE]}
          size={CHAT_MASCOT_SIZE}
          playing
          follow={false}
          paper="#f9f9f9"
          color="gris"
          shape="capsule"
          data-testid="agent-thinking-mascot"
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
