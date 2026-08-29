import { CopilotChatInput } from '@copilotkit/react-core/v2'
import type { ButtonHTMLAttributes } from 'react'

type ComposerSendButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isRunning?: boolean
  canStop?: boolean
  draftValue?: string
}

/**
 * CopilotKit 默认：isRunning 时按钮只停不发。这里空输入停止，有字仍发送排队。
 */
export function ComposerSendButton({
  isRunning = false,
  canStop = false,
  draftValue = '',
  onClick,
  disabled,
  children,
  ...props
}: ComposerSendButtonProps) {
  const hasDraft = draftValue.trim().length > 0
  const showStop = isRunning && canStop && !hasDraft
  return (
    <CopilotChatInput.SendButton
      {...props}
      aria-label={showStop ? '停止当前处理' : '发送'}
      disabled={showStop ? false : disabled}
      onClick={onClick}
    >
      {children}
    </CopilotChatInput.SendButton>
  )
}
