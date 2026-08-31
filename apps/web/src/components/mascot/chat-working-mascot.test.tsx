import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatWorkingMascot } from './chat-working-mascot'

describe('ChatWorkingMascot', () => {
  it('exposes the chat-working visual contract (capsule loop, not catalog cycle)', () => {
    render(<ChatWorkingMascot />)

    const mascot = screen.getByRole('img', { name: 'Agent 正在工作' })
    expect(mascot).toHaveAttribute('data-mascot-preset', 'working')
    expect(mascot).toHaveAttribute('data-mascot-visual', 'chat-working')
    expect(mascot).toHaveAttribute('data-mascot-state', 'chat-working')
    expect(mascot).toHaveAttribute('width', '56')
    expect(mascot).toHaveAttribute('height', '56')

    // Must not advertise bloub catalog working states that destroy the body.
    expect(mascot.getAttribute('data-mascot-state')).not.toMatch(
      /^(play|orbit|burst|comet|thinking)$/,
    )
  })

  it('keeps a capsule body path with slit eyes in the SVG', () => {
    const { container } = render(<ChatWorkingMascot playing={false} />)
    const rects = container.querySelectorAll('rect')
    // 1 body capsule + 2 eye slits
    expect(rects.length).toBeGreaterThanOrEqual(3)
    const body = rects[0]
    expect(body).toHaveAttribute('fill', '#a3a3a3')
    expect(Number(body?.getAttribute('width'))).toBeGreaterThan(
      Number(body?.getAttribute('height')),
    )
  })
})
