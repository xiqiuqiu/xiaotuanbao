import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DepartureSummary } from '@/types/api'
import { DepartureDetailPrefetchLink } from './DeparturesPage'

const prefetchQuery = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQueryClient: () => ({ prefetchQuery }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    preload,
    onMouseEnter,
    onFocus,
  }: {
    children: React.ReactNode
    preload?: false | 'intent' | 'render' | 'viewport'
    onMouseEnter?: () => void
    onFocus?: () => void
  }) => (
    <a
      href="/departure/dep-1"
      data-preload={preload === false ? 'false' : String(preload)}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
  listDepartures: vi.fn(),
}))

describe('DepartureDetailPrefetchLink', () => {
  afterEach(() => {
    cleanup()
    prefetchQuery.mockReset()
  })

  it('disables route intent preload and prefetches departure detail on hover', async () => {
    const user = userEvent.setup()
    const record = { id: 'dep-1', departureNo: 'HT-001' } as DepartureSummary

    render(
      <DepartureDetailPrefetchLink record={record} strong>
        {record.departureNo}
      </DepartureDetailPrefetchLink>,
    )

    const link = screen.getByRole('link', { name: 'HT-001' })
    expect(link).toHaveAttribute('data-preload', 'false')

    await user.hover(link)

    expect(prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['departure', 'dep-1'],
      }),
    )
  })
})
