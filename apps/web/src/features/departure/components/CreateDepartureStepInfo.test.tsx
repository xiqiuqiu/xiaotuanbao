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

function renderStep() {
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
  formRef?.setFieldsValue(initialValues)
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
})
