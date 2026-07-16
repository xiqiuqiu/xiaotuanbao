import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorState } from './RouteErrorState'

function renderRouter(component: () => ReactNode) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    defaultErrorComponent: RouteErrorState,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('RouteErrorState', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('catches a route render error and shows a retryable page instead of a blank screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    renderRouter(() => {
      throw new Error('boom')
    })

    expect(await screen.findByText('页面加载失败')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '前往发团管理' })).toBeInTheDocument()
  })

  it('recovers the route when the user retries after the error condition clears', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()

    let shouldThrow = true
    renderRouter(() => {
      if (shouldThrow) {
        throw new Error('boom')
      }
      return <div>已恢复的页面</div>
    })

    await screen.findByText('页面加载失败')
    shouldThrow = false

    await user.click(screen.getByRole('button', { name: /重\s*试/ }))

    expect(await screen.findByText('已恢复的页面')).toBeInTheDocument()
  })
})
