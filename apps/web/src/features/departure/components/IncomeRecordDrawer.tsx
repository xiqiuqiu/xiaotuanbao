import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { Dayjs } from 'dayjs'
import {
  DEPARTURE_INCOME_COLLECTION_STATUS_LABELS,
  DEPARTURE_INCOME_COMMISSION_STATUS_LABELS,
  DEPARTURE_INCOME_TYPE_AMOUNT_HINTS,
  DEPARTURE_INCOME_TYPE_LABELS,
  DepartureIncomeCollectionStatus,
  DepartureIncomeCommissionStatus,
  DepartureIncomeType,
  DirectoryProfileStatus,
  ResourceKind,
} from '@xiaotuanbao/shared'
import { useQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { listSuppliers } from '@/services/supplier.service'
import { formatCents } from '../catalog'

export type IncomeRecordFormValues = {
  type: DepartureIncomeType
  projectName: string
  partnerSupplierId?: string
  occurredOn: Dayjs
  amountYuan: number
  guideSupplierId?: string
  commissionYuan: number
  incomeStatus: DepartureIncomeCollectionStatus
  commissionStatus: DepartureIncomeCommissionStatus
  remark?: string
}

const TYPE_OPTIONS = (Object.values(DepartureIncomeType) as DepartureIncomeType[]).map(
  (value) => ({
    value,
    label: DEPARTURE_INCOME_TYPE_LABELS[value],
  }),
)

const INCOME_STATUS_OPTIONS = (
  Object.values(DepartureIncomeCollectionStatus) as DepartureIncomeCollectionStatus[]
).map((value) => ({
  value,
  label: DEPARTURE_INCOME_COLLECTION_STATUS_LABELS[value],
}))

const COMMISSION_STATUS_OPTIONS = (
  Object.values(DepartureIncomeCommissionStatus) as DepartureIncomeCommissionStatus[]
).map((value) => ({
  value,
  label: DEPARTURE_INCOME_COMMISSION_STATUS_LABELS[value],
}))

type IncomeRecordDrawerProps = {
  open: boolean
  editing: boolean
  form: FormInstance<IncomeRecordFormValues>
  onClose: () => void
  onSave: () => void
  saving: boolean
}

export function IncomeRecordDrawer({
  open,
  editing,
  form,
  onClose,
  onSave,
  saving,
}: IncomeRecordDrawerProps) {
  const watchedType = Form.useWatch('type', form) as DepartureIncomeType | undefined
  const amountYuan = Form.useWatch('amountYuan', form) ?? 0
  const commissionYuan = Form.useWatch('commissionYuan', form) ?? 0
  const companyYuan = Math.round((Number(amountYuan) - Number(commissionYuan)) * 100) / 100

  const [partnerSearch, setPartnerSearch] = useState('')
  const [guideSearch, setGuideSearch] = useState('')
  const deferredPartnerSearch = useDeferredValue(partnerSearch)
  const deferredGuideSearch = useDeferredValue(guideSearch)

  const partnerQuery = useQuery({
    queryKey: ['suppliers', 'income-partner', deferredPartnerSearch],
    queryFn: () =>
      listSuppliers({
        search: deferredPartnerSearch || undefined,
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open,
  })

  const guideQuery = useQuery({
    queryKey: ['suppliers', 'income-guide', ResourceKind.GUIDE, deferredGuideSearch],
    queryFn: () =>
      listSuppliers({
        search: deferredGuideSearch || undefined,
        category: ResourceKind.GUIDE,
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open,
  })

  const showPartnerHint =
    watchedType === DepartureIncomeType.SHOPPING_REBATE ||
    watchedType === DepartureIncomeType.OPTIONAL_TOUR

  return (
    <Drawer
      title={editing ? '编辑增收记录' : '新增增收记录'}
      open={open}
      onClose={onClose}
      size={480}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={onSave}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="type" label="增收类型" rules={[{ required: true }]}>
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="projectName"
          label="项目名称"
          rules={[{ required: true, max: 50, message: '必填，最多 50 字' }]}
        >
          <Input placeholder="如：干果销售、游船票" maxLength={50} />
        </Form.Item>
        <Form.Item
          name="partnerSupplierId"
          label="合作方"
          extra={showPartnerHint ? '建议填写合作方' : undefined}
        >
          <Select
            allowClear
            showSearch
            filterOption={false}
            placeholder="从供应商选择（车销可空）"
            onSearch={setPartnerSearch}
            options={(partnerQuery.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            notFoundContent={partnerQuery.isLoading ? '加载中…' : '暂无供应商'}
          />
        </Form.Item>
        <Form.Item name="occurredOn" label="发生日期" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="amountYuan"
          label="增收金额"
          extra={watchedType ? DEPARTURE_INCOME_TYPE_AMOUNT_HINTS[watchedType] : undefined}
          rules={[{ required: true, type: 'number', min: 0 }]}
        >
          <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
        </Form.Item>
        <Form.Item name="guideSupplierId" label="导游">
          <Select
            allowClear
            showSearch
            filterOption={false}
            placeholder="本团执行班组导游或导游类供应商"
            onSearch={setGuideSearch}
            options={(guideQuery.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            notFoundContent={guideQuery.isLoading ? '加载中…' : '暂无导游'}
          />
        </Form.Item>
        <Form.Item
          name="commissionYuan"
          label="导游提成"
          rules={[
            { required: true, type: 'number', min: 0 },
            {
              validator: async (_, value) => {
                if (value == null) return
                if (Number(value) > Number(amountYuan ?? 0)) {
                  throw new Error('导游提成不得大于增收金额')
                }
              },
            },
          ]}
        >
          <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
        </Form.Item>
        <Form.Item label="公司增收">
          <Typography.Text>
            {Number.isFinite(companyYuan) ? formatCents(Math.round(companyYuan * 100)) : '-'}
          </Typography.Text>
        </Form.Item>
        <Form.Item name="incomeStatus" label="收入状态" rules={[{ required: true }]}>
          <Select options={INCOME_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="commissionStatus" label="提成状态" rules={[{ required: true }]}>
          <Select options={COMMISSION_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="remark" label="备注" rules={[{ max: 200 }]}>
          <Input.TextArea rows={3} maxLength={200} showCount placeholder="人数/商品/结算约定等" />
        </Form.Item>
        {showPartnerHint ? (
          <Alert type="info" showIcon message="购物店返利/自费返利建议填写合作方，可不强制" />
        ) : null}
      </Form>
    </Drawer>
  )
}
