import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import { SegmentDrawer } from './SegmentDrawer'

const departure = {
  id: 'departure-1',
  totalGuests: 10,
  startDate: '2026-08-01',
  endDate: '2026-08-10',
} as DepartureDetail

const editing: ItinerarySegmentSummary = {
  id: 'segment-1',
  departureId: 'departure-1',
  name: '第1天',
  sortOrder: 0,
  startDate: '2026-08-01',
  endDate: '2026-08-01',
  dayCount: 1,
  destination: null,
  notes: null,
  fullTicketCount: 6,
  halfTicketCount: 1,
  studentTicketCount: 0,
  freeTicketCount: 0,
  hasTicketHeadcountMismatch: true,
  pendingCheck: false,
  resourceCount: 0,
  outsourceCount: 0,
  resourceAmountCents: 0,
  payableGeneratedCount: 0,
  payableStatus: 'not_generated',
}

describe('SegmentDrawer ticket type headcount #203', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows prominent mismatch warning while save remains available', async () => {
    render(
      <ConfigProvider>
        <SegmentDrawer
          open
          departure={departure}
          editing={editing}
          readOnly={false}
          loading={false}
          onClose={() => undefined}
          onSubmit={vi.fn()}
        />
      </ConfigProvider>,
    )

    expect(await screen.findByText('票型人数与客源人数不一致')).toBeInTheDocument()
    expect(
      screen.getByText('票型人数合计（7）与本团客源人数（10）不一致，请核对。仍可保存。'),
    ).toBeInTheDocument()

    const saveButton = document.querySelector(
      '.ant-drawer-footer .ant-btn-primary',
    ) as HTMLButtonElement | null
    expect(saveButton).toBeTruthy()
    expect(saveButton?.disabled).toBe(false)
  })
})
