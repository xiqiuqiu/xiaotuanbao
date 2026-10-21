import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CopilotRuntimeRecovery } from './CopilotRuntimeRecovery'

const runtime = vi.hoisted(() => ({
  runtimeUrl: '/copilotkit',
  runtimeConnectionStatus: 'connected',
  setRuntimeUrl: vi.fn(),
}))
vi.mock('@copilotkit/react-core/v2', () => ({ useCopilotKit: () => ({ copilotkit: runtime }) }))
let refresh = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  runtime.runtimeConnectionStatus = 'connected'

})
afterEach(() => { cleanup(); vi.useRealTimers() })

function status(value: string) {
  act(() => { runtime.runtimeConnectionStatus = value; refresh() })
}

function renderRecovery() {
  const result = render(<CopilotRuntimeRecovery />)
  refresh = () => result.rerender(<CopilotRuntimeRecovery />)
  return result
}

it('reconnects the existing provider and removes the warning after recovery', () => {
  renderRecovery()
  status('error')
  expect(screen.getByRole('alert')).toHaveTextContent('正在自动重连')
  act(() => vi.advanceTimersByTime(1000))
  expect(runtime.setRuntimeUrl.mock.calls).toEqual([[undefined], ['/copilotkit']])
  status('connected')
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => vi.advanceTimersByTime(30_000))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(2)
  status('error')
  act(() => vi.advanceTimersByTime(1000))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(4)
})

it('backs off recurring failures with a bounded delay', () => {
  renderRecovery()
  for (const [index, delay] of [1000, 2000, 4000, 8000, 15_000, 15_000].entries()) {
    status('error')
    act(() => vi.advanceTimersByTime(delay - 1))
    expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(index * 2)
    act(() => vi.advanceTimersByTime(1))
    expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes((index + 1) * 2)
    status('connecting')
  }
})

it('supports immediate and online recovery, and cleans up after unmount', () => {
  const { unmount } = renderRecovery()
  status('error')
  fireEvent.click(screen.getByRole('button', { name: '立即重连' }))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(2)
  status('connecting')
  status('error')
  fireEvent(window, new Event('online'))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(4)
  unmount()
  act(() => vi.advanceTimersByTime(30_000))
  fireEvent(window, new Event('online'))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(4)
})
