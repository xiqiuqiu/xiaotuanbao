import { useEffect, useMemo } from 'react'
import {
  Alert,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
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
  sourceOrderToFormValues,
  totalGuestCount,
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
    if (watched == null) {
      return null
    }
    const adult = watched.adultGuestCount ?? 0
    const child = watched.childGuestCount ?? 0
    if (adult + child < 1) {
      return null
    }
    return computeFormAmounts({
      adultGuestCount: adult,
      childGuestCount: child,
      adultUnitPriceYuan: watched.adultUnitPriceYuan,
      childUnitPriceYuan: watched.childUnitPriceYuan,
      discountType: watched.discountType ?? SourceOrderDiscountType.NONE,
      discountYuan: watched.discountYuan,
      collectionMode: watched.collectionMode ?? SourceOrderCollectionMode.GUEST_ONLY,
      partnerCollectedYuan: watched.partnerCollectedYuan,
    })
  }, [watched])

  if (!amounts) {
    return null
  }

  return (
    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
      结算金额 {formatCents(amounts.netReceivableCents)} · 我方代收{' '}
      {formatCents(amounts.guestCollectCents)}
    </Typography.Paragraph>
  )
}

function unitPriceRequiredWhenCountPositive(countField: 'adultGuestCount' | 'childGuestCount') {
  return ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
    validator(_: unknown, value: number | null | undefined) {
      const count = Number(getFieldValue(countField) ?? 0)
      if (count > 0 && (value === undefined || value === null)) {
        return Promise.reject(new Error('请输入团款单价'))
      }
      return Promise.resolve()
    },
  })
}

function totalGuestCountAtLeastOne(getFieldValue: (name: string) => unknown) {
  return async () => {
    const adult = Number(getFieldValue('adultGuestCount') ?? 0)
    const child = Number(getFieldValue('childGuestCount') ?? 0)
    if (adult + child < 1) {
      throw new Error('总人数必须大于0')
    }
  }
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
  const adultGuestCount = Form.useWatch('adultGuestCount', form) ?? 0
  const childGuestCount = Form.useWatch('childGuestCount', form) ?? 0
  const adultUnitPriceYuan = Form.useWatch('adultUnitPriceYuan', form)
  const childUnitPriceYuan = Form.useWatch('childUnitPriceYuan', form)
  const amountFieldsLocked = Boolean(editing?.amountFieldsLocked)
  const lockAmounts = readOnly || amountReadOnly || amountFieldsLocked

  const derivedTotalGuests = totalGuestCount({
    adultGuestCount,
    childGuestCount,
  })
  const derivedGrossYuan =
    computeFormAmounts({
      adultGuestCount: adultGuestCount ?? 0,
      childGuestCount: childGuestCount ?? 0,
      adultUnitPriceYuan,
      childUnitPriceYuan,
      discountType: discountType ?? SourceOrderDiscountType.NONE,
      discountYuan: undefined,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
    }).grossReceivableCents / 100

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
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="adultGuestCount"
              label="成人人数"
              rules={[
                { required: true, message: '请输入成人人数' },
                {
                  type: 'number',
                  min: 0,
                  message: '成人人数不能为负数',
                },
                ({ getFieldValue }) => ({
                  validator: totalGuestCountAtLeastOne(getFieldValue),
                }),
              ]}
              dependencies={['childGuestCount']}
            >
              <InputNumber
                min={0}
                precision={0}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="childGuestCount"
              label="儿童人数"
              rules={[
                { required: true, message: '请输入儿童人数' },
                {
                  type: 'number',
                  min: 0,
                  message: '儿童人数不能为负数',
                },
                ({ getFieldValue }) => ({
                  validator: totalGuestCountAtLeastOne(getFieldValue),
                }),
              ]}
              dependencies={['adultGuestCount']}
            >
              <InputNumber
                min={0}
                precision={0}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="总人数">
              <InputNumber
                value={derivedTotalGuests}
                precision={0}
                style={{ width: '100%' }}
                disabled
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={2} placeholder="免票、特殊要求等" />
        </Form.Item>

        <Divider />
        <Typography.Title level={5}>团款与优惠</Typography.Title>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="adultUnitPriceYuan"
              label="成人团款单价（元）"
              rules={[unitPriceRequiredWhenCountPositive('adultGuestCount')]}
              dependencies={['adultGuestCount']}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="childUnitPriceYuan"
              label="儿童团款单价（元）"
              rules={[unitPriceRequiredWhenCountPositive('childGuestCount')]}
              dependencies={['childGuestCount']}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="原始团款金额（元）">
              <InputNumber
                value={derivedGrossYuan}
                precision={2}
                style={{ width: '100%' }}
                disabled
              />
            </Form.Item>
          </Col>
        </Row>
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
          <Input.TextArea rows={2} placeholder="请输入优惠相关备注（选填）" />
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
          <Input.TextArea rows={2} placeholder="请输入结算说明（选填）" />
        </Form.Item>

        <AmountPreview form={form} />
      </Form>
    </Drawer>
  )
}
