import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MascotAuditPage } from './MascotAuditPage'

vi.mock('@/components/mascot', async () => {
  const actual = await vi.importActual<typeof import('@/components/mascot')>('@/components/mascot')
  return {
    ...actual,
    Mascot: (props: { preset?: string; size?: number }) => (
      <svg
        role="img"
        aria-label={`preset-${props.preset}`}
        data-testid={`mock-mascot-preset-${props.preset}`}
        width={props.size}
        height={props.size}
        data-mascot-preset={props.preset}
      />
    ),
    ChatWorkingMascot: (props: { beat?: string; size?: number }) => (
      <svg
        role="img"
        aria-label={`beat-${props.beat}`}
        data-testid={`mock-mascot-beat-${props.beat}-${props.size}`}
        width={props.size}
        height={props.size}
        data-mascot-beat-mode={props.beat}
        data-mascot-visual="chat-working"
      />
    ),
  }
})

afterEach(() => {
  cleanup()
})

describe('MascotAuditPage', () => {
  it('renders all 6 preset cards and all 7 beat cards', () => {
    render(<MascotAuditPage />)

    expect(screen.getByTestId('mascot-audit-page')).toBeInTheDocument()
    expect(screen.getByTestId('mascot-audit-presets')).toBeInTheDocument()
    expect(screen.getByTestId('mascot-audit-beats')).toBeInTheDocument()

    for (const preset of ['idle', 'thinking', 'working', 'success', 'error', 'sleep']) {
      expect(screen.getByTestId(`mascot-audit-preset-${preset}`)).toBeInTheDocument()
    }

    for (const beat of ['look', 'blink', 'squash', 'flip', 'halo', 'trails', 'loop']) {
      expect(screen.getByTestId(`mascot-audit-beat-${beat}`)).toBeInTheDocument()
    }
  })
})
