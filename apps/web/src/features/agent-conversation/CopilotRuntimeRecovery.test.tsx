import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CopilotRuntimeRecovery } from './CopilotRuntimeRecovery'

const runtime = vi.hoisted(() => ({
  runtimeUrl: '/copilotkit', runtimeConnectionStatus: 'connected',
  setRuntimeUrl: vi.fn(), subscribe: vi.fn(),
}))
vi.mock('@copilotkit/react-core/v2', () => ({ useCopilotKit: () => ({ copilotkit: runtime }) }))
let events: {
  onError: (event: { code: string; error: Error }) => void
  onRuntimeConnectionStatusChanged: (event: { status: string }) => void
}
let refresh = () => {}
let visible = true
const unsubscribe = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  visible = true
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden')
  runtime.runtimeConnectionStatus = 'connected'
  runtime.subscribe.mockImplementation((subscriber) => { events = subscriber; return { unsubscribe } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function status(value: string) {
  act(() => {
    runtime.runtimeConnectionStatus = value
    events.onRuntimeConnectionStatusChanged({ status: value })
    refresh()
  })
}
function fail(code = 500) {
  status('error')
  act(() => events.onError({ code: 'runtime_info_fetch_failed', error: new Error(`Runtime info request failed with status ${code}`) }))
}
function renderRecovery() {
  const result = render(<StrictMode><CopilotRuntimeRecovery /></StrictMode>)
  refresh = () => result.rerender(<StrictMode><CopilotRuntimeRecovery /></StrictMode>)
  return result
}

it('keeps one non-assertive notice while connecting and resets only on success', () => {
  renderRecovery()
  fail()
  const notice = screen.getByRole('status')
  act(() => vi.advanceTimersByTime(999))
  expect(runtime.setRuntimeUrl).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(runtime.setRuntimeUrl.mock.calls).toEqual([[undefined], ['/copilotkit']])
  status('connecting')
  expect(screen.getByRole('status')).toBe(notice)
  status('connected')
  expect(screen.queryByRole('status')).toBeNull()
  fail()
  act(() => vi.advanceTimersByTime(1000))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(4)
})

it.each([401, 403, 404])('stops automatic and online retries for HTTP %s', (code) => {
  renderRecovery()
  fail(code)
  expect(screen.getByRole('status')).toHaveTextContent(code === 404 ? '配置有误' : '认证失败')
  act(() => vi.advanceTimersByTime(120_000))
  fireEvent(window, new Event('online'))
  expect(runtime.setRuntimeUrl).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '立即重连' }))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(2)
})

it('stops after three automatic attempts and permits a manual restart', () => {
  renderRecovery()
  for (const delay of [1000, 2000, 4000]) {
    fail()
    act(() => vi.advanceTimersByTime(delay))
    status('connecting')
  }
  fail()
  expect(screen.getByRole('status')).toHaveTextContent('自动重试已停止')
  act(() => vi.advanceTimersByTime(120_000))
  fireEvent(window, new Event('online'))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(6)
  fireEvent.click(screen.getByRole('button', { name: '立即重连' }))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(8)
})

it('pauses hidden pages, resumes when visible, and cleans up on unmount', () => {
  const { unmount } = renderRecovery()
  fail()
  visible = false
  fireEvent(document, new Event('visibilitychange'))
  act(() => vi.advanceTimersByTime(30_000))
  fireEvent(window, new Event('online'))
  expect(runtime.setRuntimeUrl).not.toHaveBeenCalled()
  visible = true
  fireEvent(document, new Event('visibilitychange'))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(2)
  unmount()
  act(() => vi.advanceTimersByTime(30_000))
  fireEvent(window, new Event('online'))
  fireEvent(document, new Event('visibilitychange'))
  expect(runtime.setRuntimeUrl).toHaveBeenCalledTimes(2)
  expect(unsubscribe).toHaveBeenCalled()
})

it('keeps unrelated SDK errors visible through runtime recovery', () => {
  renderRecovery()
  act(() => events.onError({ code: 'agent_run_failed', error: new Error('独立的 Agent 执行错误') }))
  expect(screen.getByRole('alert')).toHaveTextContent('独立的 Agent 执行错误')
  fail()
  status('connected')
  expect(screen.getByRole('alert')).toHaveTextContent('独立的 Agent 执行错误')
})
