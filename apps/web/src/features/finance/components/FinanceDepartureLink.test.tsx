import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceDepartureLink } from './FinanceDepartureLink'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    target,
    rel,
  }: {
    children: React.ReactNode
    to: string
    params: { departureId: string }
    target?: string
    rel?: string
  }) => (
    <a
      href={`${to.replace('$departureId', params.departureId)}`}
      target={target}
      rel={rel}
    >
      {children}
    </a>
  ),
}))

describe('FinanceDepartureLink', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens departure detail in a new tab', () => {
    render(
      <FinanceDepartureLink departureId="dep-1">春日西湖团</FinanceDepartureLink>,
    )

    const link = screen.getByRole('link', { name: '春日西湖团' })
    expect(link).toHaveAttribute('href', '/departure/dep-1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
