import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatWorkingMascot } from './chat-working-mascot'
import {
  beatAt,
  beatsInLoop,
  CHAT_WORKING_LOOP_MS,
  sampleChatWorkingPose,
} from './chat-working-motion'

afterEach(() => {
  cleanup()
})

describe('chat-working-motion beats', () => {
  it('loop visits look, squash, flip, halo, rest', () => {
    expect(beatsInLoop().sort()).toEqual(['flip', 'halo', 'look', 'rest', 'squash'].sort())
    const sampled = new Set<string>()
    for (let t = 0; t < CHAT_WORKING_LOOP_MS; t += 50) {
      sampled.add(beatAt(t).beat)
    }
    expect(sampled.has('look')).toBe(true)
    expect(sampled.has('squash')).toBe(true)
    expect(sampled.has('flip')).toBe(true)
    expect(sampled.has('halo')).toBe(true)
    expect(sampled.has('rest')).toBe(true)
  })

  it('solo modes keep data beat sticky to that clip', () => {
    for (const mode of ['look', 'blink', 'squash', 'flip', 'halo', 'trails'] as const) {
      const pose = sampleChatWorkingPose(400, mode)
      expect(pose.beat).toBe(mode)
    }
  })

  it('keeps squash stretch and flip trails; halo has rings opacity', () => {
    const squash = sampleChatWorkingPose(2300, 'loop')
    expect(squash.beat).toBe('squash')
    expect(squash.sx).toBeGreaterThan(1)
    expect(squash.sy).toBeLessThan(1)

    const flip = sampleChatWorkingPose(3150, 'loop')
    expect(flip.beat).toBe('flip')
    expect(flip.trail).toBeGreaterThan(0.2)

    const halo = sampleChatWorkingPose(4200, 'loop')
    expect(halo.beat).toBe('halo')
    expect(halo.halo).toBeGreaterThan(0.5)
    expect(halo.trail).toBe(0)

    const trails = sampleChatWorkingPose(200, 'trails')
    expect(trails.beat).toBe('trails')
    expect(trails.trail).toBeGreaterThan(0.3)
  })
})

describe('ChatWorkingMascot', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('exposes chat-working visual contract at size 56', () => {
    render(<ChatWorkingMascot beat="loop" playing={false} />)
    const mascot = screen.getByRole('img', { name: 'Agent 正在工作' })
    expect(mascot).toHaveAttribute('data-mascot-visual', 'chat-working')
    expect(mascot).toHaveAttribute('data-mascot-beat-mode', 'loop')
    expect(mascot).toHaveAttribute('width', '56')
    expect(mascot.getAttribute('data-mascot-state')).not.toMatch(
      /^(play|orbit|burst|comet|thinking)$/,
    )
  })

  it('keeps capsule hull + eyes/halo/trails part groups', () => {
    const { container } = render(<ChatWorkingMascot beat="look" playing={false} />)
    expect(container.querySelector('[data-part="eyes"]')).not.toBeNull()
    expect(container.querySelector('[data-part="halo"]')).not.toBeNull()
    expect(container.querySelector('[data-part="trails"]')).not.toBeNull()
    const hull = container.querySelector('[data-part="hull"]')
    expect(Number(hull?.getAttribute('width'))).toBeGreaterThan(
      Number(hull?.getAttribute('height')),
    )
    expect(container.querySelector('[data-part="halo"] polygon')).toBeNull()
  })

  it('beat prop changes data-mascot-beat to the held clip', () => {
    const { rerender } = render(<ChatWorkingMascot beat="squash" playing={false} />)
    expect(screen.getByRole('img')).toHaveAttribute('data-mascot-beat', 'squash')
    expect(screen.getByRole('img')).toHaveAttribute('data-mascot-beat-mode', 'squash')

    rerender(<ChatWorkingMascot beat="halo" playing={false} />)
    expect(screen.getByRole('img')).toHaveAttribute('data-mascot-beat', 'halo')
    expect(screen.getByRole('img')).toHaveAttribute('data-mascot-beat-mode', 'halo')
  })

  it('loop mode advances data-mascot-beat through look/squash/flip/halo', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const rafCallbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    render(<ChatWorkingMascot beat="loop" playing />)
    const mascot = screen.getByRole('img', { name: 'Agent 正在工作' })
    const seen = new Set<string>()
    seen.add(mascot.getAttribute('data-mascot-beat') ?? '')

    const stepTo = async (targetMs: number) => {
      now = targetMs
      await act(async () => {
        const cbs = rafCallbacks.splice(0, rafCallbacks.length)
        for (const cb of cbs) cb(targetMs)
      })
      seen.add(mascot.getAttribute('data-mascot-beat') ?? '')
    }

    await stepTo(100)
    await stepTo(2300)
    await stepTo(2800)
    await stepTo(4200)

    await waitFor(() => {
      expect(seen.has('look')).toBe(true)
      expect(seen.has('squash')).toBe(true)
      expect(seen.has('flip')).toBe(true)
      expect(seen.has('halo')).toBe(true)
    })
  })
})
