import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AgentReasoningMessage,
  AgentWorkingCursor,
  ensureAgentWorkingReasoningSlot,
  hasDurableAssistantAfter,
  WORKING_REASONING_SLOT_ID,
} from './agent-reasoning-message'

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
  it('shows chat-working capsule mascot (56px) for the latest running turn', () => {
    renderIndicator()

    const indicator = screen.getByTestId('agent-working-indicator')
    expect(indicator).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /正在思考|思考过程/ })).not.toBeInTheDocument()

    const mascot = screen.getByRole('img', { name: 'Agent 正在工作' })
    expect(mascot).toHaveAttribute('data-mascot-preset', 'working')
    expect(mascot).toHaveAttribute('data-mascot-visual', 'chat-working')
    expect(mascot).toHaveAttribute('data-mascot-state', 'chat-working')
    expect(mascot).toHaveAttribute('width', '56')
    expect(mascot).toHaveAttribute('height', '56')
    // Must not use bloub catalog working cycle (triangle / faceless).
    expect(mascot.getAttribute('data-mascot-state')).not.toMatch(
      /^(play|orbit|burst|comet|thinking)$/,
    )

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

describe('ensureAgentWorkingReasoningSlot', () => {
  it('injects a working reasoning slot when running without reasoning', () => {
    const messages = [
      { id: 'event-1', role: 'user' as const, content: '你好' },
    ]
    const next = ensureAgentWorkingReasoningSlot(messages, true)
    expect(next.at(-1)).toMatchObject({
      id: WORKING_REASONING_SLOT_ID,
      role: 'reasoning',
    })
  })

  it('does not inject when an active reasoning row already exists', () => {
    const messages = [liveReasoning]
    expect(ensureAgentWorkingReasoningSlot(messages, true)).toBe(messages)
  })

  it('does not inject after durable assistant closed the turn', () => {
    const messages = [
      liveReasoning,
      { id: 'event-3', role: 'assistant' as const, content: '完成。' },
    ]
    expect(ensureAgentWorkingReasoningSlot(messages, true)).toEqual(messages)
    expect(hasDurableAssistantAfter(messages, liveReasoning.id)).toBe(true)
  })

  it('does not inject when not running', () => {
    const messages = [{ id: 'event-1', role: 'user' as const, content: '你好' }]
    expect(ensureAgentWorkingReasoningSlot(messages, false)).toEqual(messages)
  })
})

describe('AgentWorkingCursor', () => {
  it('renders a hidden slot so CopilotKit typing dot is not the character', () => {
    render(<AgentWorkingCursor />)
    const slot = screen.getByTestId('agent-working-cursor-slot')
    expect(slot).toBeInTheDocument()
    expect(slot).toHaveAttribute('hidden')
  })
})
