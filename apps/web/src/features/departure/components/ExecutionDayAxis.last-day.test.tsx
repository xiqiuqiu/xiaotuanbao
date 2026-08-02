import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, App } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ItinerarySegmentSummary } from '@/types/api'
import { ExecutionDayAxis } from './ExecutionDayAxis'

function segment(overrides: Partial<ItinerarySegmentSummary> = {}): ItinerarySegmentSummary {
  return {
    id: 'seg-1',
    departureId: 'dep-1',
    name: '第1天',
    destination: null,
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    dayCount: 1,
    sortOrder: 0,
    notes: null,
    resourceCount: 0,
    resourceAmountCents: 0,
    payableGeneratedCount: 0,
    payableOverview: {
      notGenerated: 0,
      pending: 0,
      partial: 0,
      paid: 0,
      closed: 0,
    },
    adultCount: null,
    childCount: null,
    studentCount: null,
    freeCount: null,
    ticketHeadcountMismatch: false,
    ...overrides,
  }
}

describe('ExecutionDayAxis last-day guard', () => {
  afterEach(() => {
    cleanup()
  })

  it('hides delete when only one day remains', () => {
    render(
      <ConfigProvider>
        <App>
          <ExecutionDayAxis
            segments={[segment()]}
            selectedSegmentId="seg-1"
            mutationLocked={false}
            onSelect={vi.fn()}
            onEdit={vi.fn()}
            onCreate={vi.fn()}
            onDelete={vi.fn()}
          />
        </App>
      </ConfigProvider>,
    )

    expect(screen.queryByRole('button', { name: /删除第1天/ })).not.toBeInTheDocument()
  })

  it('allows delete when more than one day exists', async () => {
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <App>
          <ExecutionDayAxis
            segments={[
              segment({ id: 'seg-1', name: '第1天', startDate: '2026-08-01', endDate: '2026-08-01' }),
              segment({
                id: 'seg-2',
                name: '第2天',
                startDate: '2026-08-02',
                endDate: '2026-08-02',
                sortOrder: 1,
              }),
            ]}
            selectedSegmentId="seg-1"
            mutationLocked={false}
            onSelect={vi.fn()}
            onEdit={vi.fn()}
            onCreate={vi.fn()}
            onDelete={vi.fn()}
          />
        </App>
      </ConfigProvider>,
    )

    expect(screen.getByRole('button', { name: /删除第1天/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /删除第2天/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /删除第1天/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
