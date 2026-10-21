import { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { CopilotKitContext, CopilotKitCoreReact } from '@copilotkit/react-core/v2/context'
import { afterEach, expect, it, vi } from 'vitest'
import { CopilotRuntimeRecovery } from './CopilotRuntimeRecovery'

// Use the real lightweight SDK context and hook without the browser-only CSS bundle.
vi.mock('@copilotkit/react-core/v2', async () => import('@copilotkit/react-core/v2/context'))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('recovers through real SDK subscriptions without a manual rerender', async () => {
  let requests = 0
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    if (!String(input).endsWith('/info')) throw new Error(`Unexpected request: ${String(input)}`)
    requests += 1
    if (requests === 1) return Response.json({}, { status: 500 })
    return Response.json({ version: '1.67.1', agents: {}, mode: 'sse' })
  }))
  const copilotkit = new CopilotKitCoreReact({ runtimeUrl: '/copilotkit', deferInitialConnection: true })
  render(<StrictMode><CopilotKitContext.Provider value={{ copilotkit, executingToolCallIds: new Set() }}>
    <CopilotRuntimeRecovery />
  </CopilotKitContext.Provider></StrictMode>)
  act(() => copilotkit.connect())
  await screen.findByRole('status')
  await waitFor(() => expect(requests).toBe(2), { timeout: 6000 })
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
}, 10_000)
