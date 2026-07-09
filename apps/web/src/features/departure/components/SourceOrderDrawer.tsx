import { useEffect, useMemo } from 'react'
import {
  Alert,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
  Button,
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
  DirectoryProfileStatus,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import { listPartners } from '@/services/partner.service'
import {
  SOURCE_ORDER_COLLECTION_OPTIONS,
  SOURCE_ORDER_DISCOUNT_OPTIONS,
  formatCents,
} from '../catalog'
import {
  computeFormAmounts,
  createEmptySourceOrderFormValues,
  formValuesToPayload,
  legacyFormValuesToAmountInput,
  sourceOrderToFormValues,
  type SourceOrderFormValues,
} from '../utils/source-order-form'

interface SourceOrderDrawerProps {
  open: boolean
  editing: SourceOrderSummary | null
  readOnly: boolean
  amountReadOnly?: boolean
  loading: boolean
  onClose: () => void
  onSubmit: (values: ReturnType<typeof formValuesToPayload>) => void
}

function AmountPreview({ form }: { form: ReturnType<typeof Form.useForm<SourceOrderFormValues>>[0] }) {
  const watched = Form.useWatch([], form)
  const amounts = useMemo(() => {
    if (!watched?.guestCount || !watched?.unitPriceYuan) {
      return null
    }
    // #67: amount helper is adult/child; drawer fields stay legacy until #69
    return computeFormAmounts(
      legacyFormValuesToAmountInput({
        guestCount: watched.guestCount,
        unitPriceYuan: watched.unitPriceYuan,
        discountType: watched.discountType ?? SourceOrderDiscountType.NONE,
        discountYuan: watched.discountYuan,
        collectionMode: watched.collectionMode ?? SourceOrderCollectionMode.GUEST_ONLY,
        partnerCollectedYuan: watched.partnerCollectedYuan,
      }),
    )
  }, [watched])

  if (!amounts) {
    return null
  }

  return (
    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
      原始应收 {formatCents(amounts.grossReceivableCents)} · 结算金额{' '}
      {formatCents(amounts.netReceivableCents)} · 我方代收{' '}
      {formatCents(amounts.guestCollectCents)}
    </Typography.Paragraph>
  )
}

export function SourceOrderDrawer({
  open,
  editing,
  readOnly,
  amountReadOnly = false,
  loading,
  onClose,
  onSubmit,
}: SourceOrderDrawerProps) {
  const [form] = Form.useForm<SourceOrderFormValues>()
  const discountType = Form.useWatch('discountType', form)
  const collectionMode = Form.useWatch('collectionMode', form)
  const amountFieldsLocked = Boolean(editing?.amountFieldsLocked)
  const lockAmounts = readOnly || amountReadOnly || amountFieldsLocked

  const formKey = editing?.id ?? 'new'
  const initialValues = useMemo(
    () => (editing ? sourceOrderToFormValues(editing) : createEmptySourceOrderFormValues()),
    [editing],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
  }, [form, initialValues, open])

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'source-order-select'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open,
  })

  return (
    <Drawer
      title={readOnly ? '查看客源单' : editing ? '编辑客源单' : '添加客源单'}
      open={open}
      width={560}
      onClose={handleClose}
      destroyOnClose
      footer={
        readOnly ? (
          <Button onClick={handleClose}>关闭</Button>
        ) : (
          <Space style={{ float: 'right' }}>
            <Button onClick={handleClose}>取消</Button>
            <Button type="primary" loading={loading} onClick={() => form.submit()}>
              保存
            </Button>
          </Space>
        )
      }
    >
      {editing?.hasSourceAmountMismatch ? (
        <Alert
          type="warning"
          showIcon
          message="来源差异警示"
          description="客源单金额与已生成的应收节点不一致，且财务已介入，请核对后再处理。"
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Form
        key={formKey}
        form={form}
        layout="vertical"
        disabled={readOnly}
        initialValues={initialValues}
        onFinish={(values) => onSubmit(formValuesToPayload(values))}
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          基础信息
        </Typography.Title>
        <Form.Item
          name="partnerId"
          label="客户"
          rules={[{ required: true, message: '请选择客户' }]}
        >
          <Select
            showSearch
            placeholder="选择合作伙伴"
            optionFilterProp="label"
            options={partnersResult?.items.map((partner) => ({
              value: partner.id,
              label: partner.name,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="guestCount"
          label="客人人数"
          rules={[{ required: true, message: '请输入客人人数' }]}
        >
          <InputNumber
            min={1}
            precision={0}
            style={{ width: '100%' }}
            disabled={lockAmounts}
          />
        </Form.Item>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={2} placeholder="儿童、免票、特殊要求等" />
        </Form.Item>

        <Divider />
        <Typography.Title level={5}>团款与优惠</Typography.Title>
        <Form.Item
          name="unitPriceYuan"
          label="原始团款单价（元）"
          rules={[{ required: true, message: '请输入单价' }]}
        >
          <InputNumber
            min={0}
            precision={2}
            style={{ width: '100%' }}
            disabled={lockAmounts}
          />
        </Form.Item>
        <Form.Item
          name="discountType"
          label="优惠方式"
          rules={[{ required: true, message: '请选择优惠方式' }]}
        >
          <Select
            options={[...SOURCE_ORDER_DISCOUNT_OPTIONS]}
            disabled={lockAmounts}
          />
        </Form.Item>
        {discountType === SourceOrderDiscountType.LUMP_SUM ? (
          <Form.Item
            name="discountYuan"
            label="优惠金额（元）"
            rules={[{ required: true, message: '请输入优惠金额' }]}
          >
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              disabled={lockAmounts}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="discountNotes" label="优惠备注">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Divider />
        <Typography.Title level={5}>收款信息</Typography.Title>
        <Form.Item
          name="collectionMode"
          label="收款方式"
          rules={[{ required: true, message: '请选择收款方式' }]}
        >
          <Select
            options={[...SOURCE_ORDER_COLLECTION_OPTIONS]}
            disabled={lockAmounts}
          />
        </Form.Item>
        {collectionMode === SourceOrderCollectionMode.SPLIT ? (
          <Form.Item
            name="partnerCollectedYuan"
            label="客户已收金额（元）"
            rules={[{ required: true, message: '请输入客户已收金额' }]}
          >
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              disabled={lockAmounts}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="settlementNotes" label="结算说明">
          <Input.TextArea rows={2} />
        </Form.Item>

        <AmountPreview form={form} />
      </Form>
    </Drawer>
  )
}
