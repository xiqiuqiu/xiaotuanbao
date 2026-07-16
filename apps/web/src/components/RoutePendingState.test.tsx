import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  RouterProvider,
} from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RoutePendingState } from './RoutePendingState'

describe('RoutePendingState', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a centered loading spinner as the pending placeholder', () => {
    const { container } = render(<RoutePendingState />)

    expect(container.querySelector('.ant-spin')).toBeInTheDocument()
  })

  it('shows a loading spinner while a lazy route chunk is pending', async () => {
    let resolveModule!: (mod: { LazyPage: () => ReactElement }) => void
    const pendingModule = new Promise<{ LazyPage: () => ReactElement }>((resolve) => {
      resolveModule = resolve
    })

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: lazyRouteComponent(() => pendingModule, 'LazyPage'),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      defaultPendingComponent: RoutePendingState,
      defaultPendingMs: 0,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(document.querySelector('.ant-spin')).toBeInTheDocument()
    })

    resolveModule({ LazyPage: () => <div>已加载的页面</div> })

    expect(await screen.findByText('已加载的页面')).toBeInTheDocument()
  })
})
