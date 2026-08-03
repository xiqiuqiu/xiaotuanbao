import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider, Form } from 'antd'
import type { FormInstance } from 'antd/es/form'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { InfoFormValues, RouteStepValues } from '../utils/departure-wizard-form'
import { CreateDepartureStepInfo } from './CreateDepartureStepInfo'

vi.mock('@/services/employee.service', () => ({
  listEmployeeOptions: vi.fn().mockResolvedValue([{ id: 'user-1', name: '阿财' }]),
}))

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}))

const route: RouteStepValues = {
  mode: 'copy',
  routeName: 'A线：天吐喀伊10日',
  defaultDayCount: 10,
  copyFromDepartureId: 'departure-1',
  sourceDepartureNo: 'XTB2026070009',
}

const initialValues: InfoFormValues = {
  name: 'A线：天吐喀伊10日',
  departureNo: 'XTB2026070010',
  departureType: DepartureType.COMBINED,
  ownerUserId: 'user-1',
  startDate: '2026-07-24',
  endDate: '2026-08-02',
  dayCount: 10,
}

function renderStep(values: InfoFormValues = initialValues) {
  let formRef: FormInstance<InfoFormValues> | undefined

  function Harness() {
    const [form] = Form.useForm<InfoFormValues>()
    formRef = form
    return (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ConfigProvider locale={zhCN}>
          <CreateDepartureStepInfo form={form} route={route} />
        </ConfigProvider>
      </QueryClientProvider>
    )
  }

  render(<Harness />)
  formRef?.setFieldsValue(values)
  return formRef
}

describe('CreateDepartureStepInfo', () => {
  afterEach(() => {
    cleanup()
  })

  it('团号与天数不可编辑时呈现禁用框效果', () => {
    renderStep()

    expect(screen.getByLabelText('团号')).toBeDisabled()
    expect(screen.getByLabelText('天数')).toBeDisabled()
  })

  it('填写步展示执行班组字段：司机、车牌、导游、联系电话', () => {
    renderStep()

    expect(screen.getByLabelText('司机')).toBeInTheDocument()
    expect(screen.getByLabelText('车牌')).toBeInTheDocument()
    expect(screen.getByLabelText('导游')).toBeInTheDocument()
    expect(screen.getByLabelText('联系电话')).toBeInTheDocument()
    expect(
      screen.getByText('选择执行班组（司机、导游）不会自动提交应付'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('联系电话')).toHaveAttribute('type', 'tel')
  })

  it('结束日期早于出团日期时给出字段级错误', async () => {
    const form = renderStep({
      ...initialValues,
      startDate: '2026-08-10',
      endDate: '2026-08-01',
      dayCount: 1,
    })

    await expect(form!.validateFields(['endDate'])).rejects.toBeTruthy()
    expect(await screen.findByText('结束日期不能早于出团日期')).toBeInTheDocument()
  })
})
