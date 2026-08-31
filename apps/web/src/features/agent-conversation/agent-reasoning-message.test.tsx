import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentReasoningMessage } from './agent-reasoning-message'

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotChatReasoningMessage: {
    Header: ({ label }: { label?: string }) => (
      <button type="button">{label ?? '思考过程'}</button>
    ),
    Content: () => null,
    Toggle: () => null,
  },
}))

afterEach(() => {
  cleanup()
})

const liveReasoning = {
  id: 'live-reasoning-attempt-9',
  role: 'reasoning' as const,
  content: '正在核对出团日期与人数',
}

function renderIndicator(
  overrides: Partial<Parameters<typeof AgentReasoningMessage>[0]> = {},
) {
  const messages = overrides.messages ?? [liveReasoning]
  return render(
    <AgentReasoningMessage
      message={liveReasoning}
      messages={messages}
      isRunning
      {...overrides}
    />,
  )
}

describe('AgentReasoningMessage working indicator', () => {
  it('shows working mascot (56px, play+orbit cycle) for the latest running turn', () => {
    renderIndicator()

    const indicator = screen.getByTestId('agent-working-indicator')
    expect(indicator).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /正在思考|思考过程/ })).not.toBeInTheDocument()

    const mascot = screen.getByRole('img', { name: 'Agent 正在工作' })
    expect(mascot).toHaveAttribute('data-mascot-preset', 'working')
    expect(mascot).toHaveAttribute('width', '56')
    expect(mascot).toHaveAttribute('height', '56')
    expect(mascot).toHaveAttribute('data-mascot-state', 'play')

    expect(screen.getByRole('status')).toHaveTextContent('正在核对出团日期与人数')
  })

  it('keeps the indicator while live assistant text streams (live-assistant-* is not durable)', () => {
    renderIndicator({
      messages: [
        liveReasoning,
        {
          id: 'live-assistant-attempt-9',
          role: 'assistant',
          content: '已记下路线。',
        },
      ],
    })

    expect(screen.getByTestId('agent-working-indicator')).toBeInTheDocument()
  })

  it('hides as soon as a durable event-* assistant follows, even while isRunning', () => {
    renderIndicator({
      isRunning: true,
      messages: [
        liveReasoning,
        {
          id: 'event-3',
          role: 'assistant',
          content: '已记下路线。可继续问。',
        },
      ],
    })

    expect(screen.queryByTestId('agent-working-indicator')).not.toBeInTheDocument()
  })

  it('renders nothing for historical reasoning when not the latest running message', () => {
    render(
      <AgentReasoningMessage
        message={{ id: 'live-reasoning-old', role: 'reasoning', content: '旧思考' }}
        messages={[
          { id: 'live-reasoning-old', role: 'reasoning', content: '旧思考' },
          liveReasoning,
        ]}
        isRunning
      />,
    )

    expect(screen.queryByTestId('agent-working-indicator')).not.toBeInTheDocument()
  })

  it('renders nothing when isRunning is false', () => {
    renderIndicator({ isRunning: false })
    expect(screen.queryByTestId('agent-working-indicator')).not.toBeInTheDocument()
  })

  it('truncates long work descriptions for the hover/focus tooltip', () => {
    const long = '甲'.repeat(40)
    renderIndicator({
      message: { ...liveReasoning, content: long },
      messages: [{ ...liveReasoning, content: long }],
    })

    expect(screen.getByRole('status')).toHaveTextContent(`${'甲'.repeat(36)}…`)
  })
})
