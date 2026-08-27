import { CopilotChatReasoningMessage } from '@copilotkit/react-core/v2'
import type { ComponentProps } from 'react'

export function AgentReasoningHeader(
  props: ComponentProps<typeof CopilotChatReasoningMessage.Header>,
) {
  return (
    <CopilotChatReasoningMessage.Header
      {...props}
      label={props.isStreaming ? '正在思考' : '思考过程'}
    />
  )
}
