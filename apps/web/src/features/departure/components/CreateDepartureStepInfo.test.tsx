import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Form } from 'antd'
import type { FormInstance } from 'antd/es/form'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { InfoFormValues, RouteStepValues } from '../utils/departure-wizard-form'
import { CreateDepartureStepInfo } from './CreateDepartureStepInfo'
import { listDepartureMaterials, previewDepartureMaterial } from '@/services/ai-create-task.service'

vi.mock('@/services/ai-create-task.service', () => ({
  listDepartureMaterials: vi.fn().mockResolvedValue([]),
  previewDepartureMaterial: vi.fn(),
}))

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

function renderStep(values: InfoFormValues = initialValues, taskId?: string) {
  let formRef: FormInstance<InfoFormValues> | undefined

  function Harness() {
    const [form] = Form.useForm<InfoFormValues>()
    formRef = form
    return (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ConfigProvider locale={zhCN}>
          <CreateDepartureStepInfo form={form} route={route} taskId={taskId} />
        </ConfigProvider>
      </QueryClientProvider>
    )
  }

  render(<Harness />)
  act(() => {
    formRef?.setFieldsValue(values)
  })
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

  it('外部写入出团日后，再改出团日仍按刚写入的日期重算结束日', async () => {
    const user = userEvent.setup()
    const form = renderStep()

    await waitFor(() => {
      expect(screen.getByLabelText('结束日期')).toHaveValue('2026-08-02')
    })

    act(() => {
      form!.setFieldsValue({
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        dayCount: 10,
      })
    })

    await waitFor(() => {
      expect(form!.getFieldValue('startDate')).toBe('2026-09-01')
      expect(screen.getByLabelText('结束日期')).toHaveValue('2026-09-10')
    })

    await user.click(screen.getByLabelText('出团日期'))
    await user.click(await screen.findByTitle('2026-09-03'))

    expect(screen.getByLabelText('结束日期')).toHaveValue('2026-09-12')
    expect(screen.getByLabelText('天数')).toHaveValue('10')
  })

  it('lists archived materials and opens a preview', async () => {
    vi.mocked(listDepartureMaterials).mockResolvedValue([
      {
        id: 'mat-1',
        originalFilename: '团期.png',
        contentType: 'image/png',
        status: 'available',
        statusVersion: 1,
        sha256: 'abc',
        sizeBytes: 12,
        createdAt: '2026-08-14T00:00:00.000Z',
        latestResultVersion: 1,
      },
    ])
    vi.mocked(previewDepartureMaterial).mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      filename: '团期.png',
    })

    renderStep(initialValues, 'task-1')

    expect(await screen.findByText('发团资料')).toBeInTheDocument()
    expect(screen.getByText('团期.png')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '预览' }))
    await waitFor(() => {
      expect(previewDepartureMaterial).toHaveBeenCalledWith('task-1', 'mat-1')
    })
    expect(await screen.findByRole('img', { name: '团期.png' })).toBeInTheDocument()
  })

  it('shows loading and error for archived materials, and allows preview while parsing', async () => {
    let resolveList!: (value: Awaited<ReturnType<typeof listDepartureMaterials>>) => void
    vi.mocked(listDepartureMaterials).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        }),
    )

    renderStep(initialValues, 'task-1')
    expect(await screen.findByText('发团资料')).toBeInTheDocument()

    await act(async () => {
      resolveList([])
    })
    await waitFor(() => {
      expect(screen.queryByText('发团资料')).not.toBeInTheDocument()
    })

    cleanup()
    vi.mocked(listDepartureMaterials).mockRejectedValueOnce(new Error('network'))
    renderStep(initialValues, 'task-2')
    expect(await screen.findByText('发团资料加载失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('previews original bytes while a material is still parsing', async () => {
    vi.mocked(listDepartureMaterials).mockResolvedValue([
      {
        id: 'mat-1',
        originalFilename: '团期.png',
        contentType: 'image/png',
        status: 'parsing',
        statusVersion: 1,
        sha256: 'abc',
        sizeBytes: 12,
        createdAt: '2026-08-14T00:00:00.000Z',
        latestResultVersion: null,
      },
    ])
    vi.mocked(previewDepartureMaterial).mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      filename: '团期.png',
    })

    renderStep(initialValues, 'task-1')

    expect(await screen.findByText('解析中')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '预览' }))
    await waitFor(() => {
      expect(previewDepartureMaterial).toHaveBeenCalledWith('task-1', 'mat-1')
    })
    expect(await screen.findByRole('img', { name: '团期.png' })).toBeInTheDocument()
  })
})
