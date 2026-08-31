import { CopilotChatReasoningMessage } from '@copilotkit/react-core/v2'
import type { ComponentProps } from 'react'
import { Mascot } from '@/components/mascot'
import styles from './agent-reasoning-message.module.css'

type ReasoningMessageProps = ComponentProps<typeof CopilotChatReasoningMessage>
type ReasoningHeaderProps = ComponentProps<typeof CopilotChatReasoningMessage.Header>

/**
 * Reasoning header: keep CopilotKit collapse control +「正在思考」copy,
 * and show the bloub mascot while this turn is running (`isRunning`).
 */
export function AgentReasoningHeader(props: ReasoningHeaderProps & { showMascot?: boolean }) {
  const { showMascot = false, ...headerProps } = props
  return (
    <span className={styles.headerRow}>
      {showMascot ? (
        <span className={styles.mascotSlot} data-testid="agent-thinking-mascot">
          <Mascot
            preset="thinking"
            size={28}
            playing
            follow={false}
            paper="#f9f9f9"
            color="encre"
            shape="cercle"
            aria-label="正在思考"
          />
        </span>
      ) : null}
      <CopilotChatReasoningMessage.Header
        {...headerProps}
        label={headerProps.isStreaming ? '正在思考' : '思考过程'}
      />
    </span>
  )
}

function AgentReasoningMessageImpl(props: ReasoningMessageProps) {
  const { isRunning, header: _header, ...rest } = props
  return (
    <CopilotChatReasoningMessage
      {...rest}
      isRunning={isRunning}
      header={(headerProps) => (
        <AgentReasoningHeader {...headerProps} showMascot={Boolean(isRunning)} />
      )}
    />
  )
}

/**
 * Full reasoning message slot (same shape as CopilotChatReasoningMessage) so
 * CopilotKit `isRunning` can drive the thinking mascot without inventing a
 * product FSM.
 */
export const AgentReasoningMessage = Object.assign(AgentReasoningMessageImpl, {
  Header: AgentReasoningHeader,
  Content: CopilotChatReasoningMessage.Content,
  Toggle: CopilotChatReasoningMessage.Toggle,
})
