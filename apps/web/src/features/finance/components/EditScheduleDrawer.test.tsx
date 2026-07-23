import { useEffect } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Form } from 'antd'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CounterpartyType,
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { EditScheduleDrawer } from './EditScheduleDrawer'
import {
  scheduleToEditValues,
  type EditScheduleFormValues,
} from '../utils/edit-schedule-form'

function baseSchedule(
  overrides: Partial<PaymentScheduleSummary> = {},
): PaymentScheduleSummary {
  return {
    id: 'sch-1',
    departureId: 'dep-1',
    departureStatus: 'editing',
    direction: 'receivable',
    scheduleNo: 'ARXTB202607000482',
    title: '游客代收',
    amountCents: 738000,
    dueDate: '2026-08-10',
    counterpartyType: CounterpartyType.GUEST,
    counterpartyId: 'so-1',
    counterpartyName: '黄山徽行天下地接',
    sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    sourceId: 'so-1',
    sourceOrderName: '黄山徽行天下地接',
    status: 'pending',
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 738000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    voidedAt: null,
    voidedBy: null,
    voidedByName: null,
    voidReason: null,
    voidedAmountCents: null,
    amountAdjustedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderEdit(options: {
  schedule: PaymentScheduleSummary
  isReceivable: boolean
}) {
  function Harness() {
    const [form] = Form.useForm<EditScheduleFormValues>()
    useEffect(() => {
      form.setFieldsValue(scheduleToEditValues(options.schedule))
    }, [form])
    return (
      <ConfigProvider>
        <EditScheduleDrawer
          open
          schedule={options.schedule}
          loading={false}
          form={form}
          isReceivable={options.isReceivable}
          onClose={() => undefined}
          onSubmit={() => undefined}
        />
      </ConfigProvider>
    )
  }
  return render(<Harness />)
}

afterEach(() => {
  cleanup()
})

function formItemContent(label: string): HTMLElement {
  const labelNode = screen.getByText(label, { selector: 'label' })
  const item = labelNode.closest('.ant-form-item')
  if (!item) {
    throw new Error(`form item not found for ${label}`)
  }
  return item as HTMLElement
}

describe('EditScheduleDrawer receivable identity', () => {
  it('uses 应收单号 language, drops title, and aligns list identity fields', () => {
    renderEdit({ schedule: baseSchedule(), isReceivable: true })

    expect(screen.getByText('编辑应收单')).toBeTruthy()
    expect(screen.queryByText('编辑节点')).toBeNull()
    expect(screen.queryByText('节点编号')).toBeNull()
    expect(screen.queryByText('标题', { selector: 'label' })).toBeNull()

    expect(within(formItemContent('应收单号')).getByDisplayValue('ARXTB202607000482')).toBeTruthy()
    expect(within(formItemContent('来源客源单')).getByDisplayValue('黄山徽行天下地接')).toBeTruthy()
    expect(within(formItemContent('收款方式')).getByDisplayValue('游客代收')).toBeTruthy()
    expect(within(formItemContent('收款对象名称')).getByDisplayValue('游客')).toBeTruthy()
  })
})

describe('EditScheduleDrawer payable identity', () => {
  it('uses 应付单号 language, drops title, and shows fee category/item', () => {
    renderEdit({
      isReceivable: false,
      schedule: baseSchedule({
        direction: 'payable',
        scheduleNo: 'APXTB202607000001',
        title: '酒店资源应付',
        counterpartyType: CounterpartyType.SUPPLIER,
        counterpartyId: 'sup-1',
        counterpartyName: '测试酒店',
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        sourceId: 'res-1',
        resourceKind: 'hotel',
        resourceTitle: '黄山悦榕庄',
        sourceOrderName: null,
      }),
    })

    expect(screen.getByText('编辑应付单')).toBeTruthy()
    expect(screen.queryByText('标题', { selector: 'label' })).toBeNull()
    expect(within(formItemContent('应付单号')).getByDisplayValue('APXTB202607000001')).toBeTruthy()
    expect(within(formItemContent('费用类别')).getByDisplayValue('酒店')).toBeTruthy()
    expect(within(formItemContent('费用项目')).getByDisplayValue('黄山悦榕庄')).toBeTruthy()
    expect(within(formItemContent('付款对象名称')).getByDisplayValue('测试酒店')).toBeTruthy()
  })
})
