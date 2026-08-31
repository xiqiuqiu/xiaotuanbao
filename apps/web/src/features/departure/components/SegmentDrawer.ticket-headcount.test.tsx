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

  it('does not show ticket headcount mismatch alert or ticket count fields', async () => {
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

    expect(await screen.findByLabelText('行程名称')).toBeInTheDocument()
    expect(screen.queryByText('票型人数与客源人数不一致')).not.toBeInTheDocument()
    expect(screen.queryByText(/票型人数合计/)).not.toBeInTheDocument()
    expect(screen.queryByText('票型人数')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('全')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('开始日期')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('结束日期')).not.toBeInTheDocument()
    expect(screen.getByLabelText('日期')).toBeInTheDocument()

    const saveButton = document.querySelector(
      '.ant-drawer-footer .ant-btn-primary',
    ) as HTMLButtonElement | null
    expect(saveButton).toBeTruthy()
    expect(saveButton?.disabled).toBe(false)
  })
})
