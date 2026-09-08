import { createContext } from 'react'
import type { CopilotChatReasoningMessageProps } from '@copilotkit/react-core/v2'

// CopilotKit 1.67 memoizes non-final reasoning rows without checking isRunning.
// Context keeps the shared renderer current without remounting the chat or input.
export const AgentWorkContext = createContext<Pick<
  CopilotChatReasoningMessageProps,
  'messages' | 'isRunning'
> | null>(null)

