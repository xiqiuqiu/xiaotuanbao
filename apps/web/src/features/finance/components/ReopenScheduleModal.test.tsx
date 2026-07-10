import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Form } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentScheduleStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { ReopenScheduleModal, type ReopenScheduleFormValues } from './ReopenScheduleModal'

function schedule(): PaymentScheduleSummary {
  return {
    id: 'sch-1',
    departureId: 'dep-1',
    direction: 'receivable',
    scheduleNo: 'AR2026070001',
    title: '团款',
    amountCents: 100000,
    dueDate: '2026-08-01',
    counterpartyType: 'guest',
    counterpartyId: null,
    counterpartyName: '客人',
    sourceType: 'manual',
    sourceId: null,
    status: PaymentScheduleStatus.CANCELLED,
    financeTouched: true,
    settledAmountCents: 40000,
    unsettledAmountCents: 60000,
    cancelledAt: '2026-07-01T00:00:00.000Z',
    cancelledBy: 'user-1',
    closeDisposition: 'other',
    cancelReason: '关闭',
    amountAdjustedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}

function Harness({ onSubmit }: { onSubmit: (values: ReopenScheduleFormValues) => void }) {
  const [form] = Form.useForm<ReopenScheduleFormValues>()
  return (
    <ConfigProvider>
      <ReopenScheduleModal
        open
        schedule={schedule()}
        loading={false}
        form={form}
        onClose={() => undefined}
        onSubmit={onSubmit}
      />
    </ConfigProvider>
  )
}

describe('ReopenScheduleModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('requires reopen reason before submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: '确认重新打开' }))
    expect(await screen.findByText('请填写重新打开原因')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(screen.getByPlaceholderText('必填，说明为何恢复追收/追付'), '继续追收')
    await user.click(screen.getByRole('button', { name: '确认重新打开' }))
    expect(onSubmit).toHaveBeenCalledWith({ reopenReason: '继续追收' })
  })
})
