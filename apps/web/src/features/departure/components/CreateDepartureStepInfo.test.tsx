import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Form } from 'antd'
import type { FormInstance } from 'antd/es/form'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import type { InfoFormValues, RouteStepValues } from '../utils/departure-wizard-form'
import { CreateDepartureStepInfo } from './CreateDepartureStepInfo'
import { listEmployeeOptions } from '@/services/employee.service'
import { getSupplier } from '@/services/supplier.service'

vi.mock('@/services/employee.service', () => ({
  listEmployeeOptions: vi.fn().mockResolvedValue([{ id: 'user-1', name: '阿财' }]),
}))

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getSupplier: vi.fn().mockImplementation((id: string) =>
    Promise.resolve({
      id,
      name: id === 'driver-101' ? '第 101 位司机' : '第 101 位导游',
      categories: [],
      status: 'active',
    }),
  ),
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

function renderStep(
  values: InfoFormValues = initialValues,
  routeValues: RouteStepValues = route,
  review?: { pendingReview: AiReviewPackageView; onCorrectCandidate: ReturnType<typeof vi.fn> },
) {
  let formRef: FormInstance<InfoFormValues> | undefined

  function Harness() {
    const [form] = Form.useForm<InfoFormValues>()
    formRef = form
    return (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ConfigProvider locale={zhCN}>
          <CreateDepartureStepInfo form={form} route={routeValues} {...review} />
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

  it('在同一表单审核全部非关联创建字段候选', () => {
    const onCorrectCandidate = vi.fn()
    const pendingReview: AiReviewPackageView = {
      id: 'pkg-1',
      status: 'pending',
      confirmationUnit: 'basic_info_draft',
      payloadSchema: 'departure.basic_info_draft@v1',
      schemaSupported: true,
      baseObjectVersion: 1,
      version: 1,
      runId: 'run-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      attemptId: 'attempt-1',
      capabilityKey: 'departure.review-package.propose',
      capabilityVersion: 1,
      targetKind: 'departure_creation_draft',
      targetId: 'draft-1',
      proposalHash: 'a'.repeat(64),
      baselineSnapshot: initialValues,
      candidates: [
        {
          fieldKey: 'departureType',
          proposedValue: 'independent',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '独立团' }],
        },
        {
          fieldKey: 'notes',
          proposedValue: '客人需要轮椅',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客人需要轮椅' }],
        },
        {
          fieldKey: 'vehiclePlate',
          proposedValue: '新A·12345',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '车牌新A·12345' }],
        },
        {
          fieldKey: 'contactPhone',
          proposedValue: '13800138000',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '电话13800138000' }],
        },
      ],
    }

    renderStep(initialValues, route, { pendingReview, onCorrectCandidate })

    expect(screen.getByLabelText('发团类型候选')).toBeInTheDocument()
    expect(screen.getByLabelText('备注候选')).toHaveValue('客人需要轮椅')
    expect(screen.getByLabelText('车牌候选')).toHaveValue('新A·12345')
    expect(screen.getByLabelText('联系电话候选')).toHaveValue('13800138000')
  })

  it('创建前摘要同步显示团期、负责人、类型、路线和执行班组', async () => {
    renderStep()

    expect(
      await screen.findByText('2026-07-24 至 2026-08-02（10 天）'),
    ).toBeInTheDocument()
    expect(screen.getByText('负责人：阿财')).toBeInTheDocument()
    expect(screen.getByText('发团类型：拼团')).toBeInTheDocument()
    expect(screen.getByText('路线：A线：天吐喀伊10日')).toBeInTheDocument()
    expect(screen.getByText('执行班组：司机未选择；导游未选择')).toBeInTheDocument()
  })

  it('已选班组不在当前搜索结果时，摘要仍按 ID 查询并显示名称', async () => {
    renderStep({
      ...initialValues,
      driverSupplierId: 'driver-101',
      guideSupplierId: 'guide-101',
    })

    expect(
      await screen.findByText('执行班组：司机第 101 位司机；导游第 101 位导游'),
    ).toBeInTheDocument()
  })

  it('已选班组详情加载期间，摘要不误报未选择', async () => {
    vi.mocked(getSupplier).mockImplementationOnce(() => new Promise(() => undefined))

    renderStep({ ...initialValues, driverSupplierId: 'driver-loading' })

    expect(
      await screen.findByText('执行班组：司机加载中；导游未选择'),
    ).toBeInTheDocument()
  })

  it('已选班组详情加载失败时提供重试入口', async () => {
    vi.mocked(getSupplier).mockRejectedValueOnce(new Error('network error'))

    renderStep({ ...initialValues, driverSupplierId: 'driver-error' })

    expect(await screen.findByText('执行班组供应商加载失败')).toBeInTheDocument()
    expect(screen.getByText('执行班组：司机加载失败；导游未选择')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument()
  })

  it('选用常用路线且天数大于或小于团期时均给出字段级错误', async () => {
    const shorterTour = renderStep(
      {
        ...initialValues,
        startDate: '2026-08-01',
        endDate: '2026-08-06',
        dayCount: 6,
      },
      {
        mode: 'template',
        routeName: '喀纳斯阿勒泰10日线',
        defaultDayCount: 10,
        templateId: 'template-10',
      },
    )

    await expect(shorterTour!.validateFields(['endDate'])).rejects.toBeTruthy()
    expect(
      await screen.findByText(
        '常用路线为 10 天，与所选团期 6 天（2026-08-01～2026-08-06）不一致。请调整常用路线或团期后再创建，系统不会自动改结束日。',
      ),
    ).toBeInTheDocument()

    cleanup()

    const longerTour = renderStep(
      {
        ...initialValues,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        dayCount: 10,
      },
      {
        mode: 'template',
        routeName: '西安-青海湖-茶卡6日游',
        defaultDayCount: 6,
        templateId: 'template-1',
      },
    )

    await expect(longerTour!.validateFields(['endDate'])).rejects.toBeTruthy()
    expect(
      await screen.findByText(
        '常用路线为 6 天，与所选团期 10 天（2026-08-01～2026-08-10）不一致。请调整常用路线或团期后再创建，系统不会自动改结束日。',
      ),
    ).toBeInTheDocument()
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

  it('shows owner load errors instead of an empty select', async () => {
    vi.mocked(listEmployeeOptions).mockRejectedValueOnce(new Error('网络中断'))
    renderStep()

    expect(await screen.findByText('负责人列表加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument()
  })
})
