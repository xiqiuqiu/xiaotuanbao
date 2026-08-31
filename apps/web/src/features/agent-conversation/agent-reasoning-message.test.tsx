import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentReasoningHeader } from './agent-reasoning-message'

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotChatReasoningMessage: {
    Header: ({ label }: { label?: string }) => (
      <button type="button">{label ?? '思考过程'}</button>
    ),
  },
}))

afterEach(() => {
  cleanup()
})

describe('AgentReasoningHeader mascot wiring', () => {
  it('shows thinking mascot when showMascot (isRunning) is true', () => {
    render(<AgentReasoningHeader isStreaming showMascot />)
    expect(screen.getByTestId('agent-thinking-mascot')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '正在思考' })).toHaveAttribute(
      'data-mascot-preset',
      'thinking',
    )
    expect(screen.getByRole('button', { name: '正在思考' })).toBeInTheDocument()
  })

  it('does not leave a looping mascot when not running', () => {
    render(<AgentReasoningHeader isStreaming={false} showMascot={false} />)
    expect(screen.queryByTestId('agent-thinking-mascot')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '思考过程' })).toBeInTheDocument()
  })
})
