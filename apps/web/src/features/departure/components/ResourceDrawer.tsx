import { useEffect, useMemo } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import type { ItinerarySegmentSummary, SegmentResourceSummary } from '@/types/api'
import { listPartners } from '@/services/partner.service'
import { listSuppliers } from '@/services/supplier.service'
import { RESOURCE_KIND_OPTIONS } from '../catalog'
import { formatSegmentDateRange } from '../utils/segment-form'
import {
  createEmptyResourceFormValues,
  formValuesToPayload,
  isOutsourceKind,
  resourceToFormValues,
  type ResourceFormValues,
} from '../utils/resource-form'
import { resolveSupplierFilterKind } from '../utils/resource-supplier-filter'

interface ResourceDrawerProps {
  open: boolean
  segment?: ItinerarySegmentSummary
  editing: SegmentResourceSummary | null
  readOnly: boolean
  amountReadOnly?: boolean
  loading: boolean
  onClose: () => void
  onSubmit: (values: ReturnType<typeof formValuesToPayload>) => void
}

export function ResourceDrawer({
  open,
  segment,
  editing,
  readOnly,
  amountReadOnly = false,
  loading,
  onClose,
  onSubmit,
}: ResourceDrawerProps) {
  const [form] = Form.useForm<ResourceFormValues>()
  const resourceKind = Form.useWatch('resourceKind', form)
  const amountFieldsLocked = Boolean(editing?.amountFieldsLocked)
  const outsource = isOutsourceKind(resourceKind)
  const supplierFilterKind = resolveSupplierFilterKind(resourceKind)

  const formKey = editing?.id ?? 'new'
  const initialValues = useMemo(
    () => (editing ? resourceToFormValues(editing) : createEmptyResourceFormValues()),
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
    queryKey: ['partners', 'resource-select'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open && outsource,
  })

  const { data: suppliersResult } = useQuery({
    queryKey: ['suppliers', 'resource-select', supplierFilterKind],
    queryFn: () =>
      listSuppliers({
        status: DirectoryProfileStatus.ACTIVE,
        category: supplierFilterKind,
        pageSize: 100,
      }),
    enabled: open && !outsource && Boolean(supplierFilterKind),
  })

  return (
    <Drawer
      title={readOnly ? '查看资源' : editing ? '编辑资源' : '添加资源'}
      open={open}
      width={520}
      destroyOnClose
      onClose={handleClose}
      footer={
        readOnly ? (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleClose}>关闭</Button>
          </Space>
        ) : (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleClose}>取消</Button>
            <Button type="primary" loading={loading} onClick={() => form.submit()}>
              保存
            </Button>
          </Space>
        )
      }
    >
      {segment ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          {segment.name}｜{formatSegmentDateRange(segment.startDate, segment.endDate)}｜适用人数
          {segment.applicableGuestCount}人
        </Typography.Paragraph>
      ) : null}

      {editing?.hasSourceAmountMismatch ? (
        <Alert
          type="warning"
          showIcon
          message="来源差异警示"
          description="资源金额与已生成的应付节点不一致，且财务已介入，请核对后再处理。"
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
        <Form.Item
          name="resourceKind"
          label="资源种类"
          rules={[{ required: true, message: '请选择资源种类' }]}
        >
          <Select
            options={RESOURCE_KIND_OPTIONS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            disabled={readOnly || amountFieldsLocked}
            onChange={() => {
              form.setFieldsValue({
                partnerId: undefined,
                supplierId: undefined,
              })
            }}
          />
        </Form.Item>

        {outsource ? (
          <Form.Item
            name="partnerId"
            label="承接同行"
            rules={[{ required: true, message: '请选择承接同行' }]}
          >
            <Select
              showSearch
              placeholder="选择合作伙伴"
              optionFilterProp="label"
              options={partnersResult?.items.map((partner) => ({
                value: partner.id,
                label: partner.name,
              }))}
              disabled={readOnly || amountFieldsLocked}
            />
          </Form.Item>
        ) : resourceKind ? (
          <Form.Item
            name="supplierId"
            label="供应商"
            rules={[{ required: true, message: '请选择供应商' }]}
          >
            <Select
              showSearch
              placeholder="选择供应商"
              optionFilterProp="label"
              options={suppliersResult?.items.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
              }))}
              disabled={readOnly || amountFieldsLocked}
            />
          </Form.Item>
        ) : null}

        <Form.Item name="title" label="资源名称">
          <Input placeholder="如喀纳斯用车、阿勒泰拼出" disabled={readOnly} />
        </Form.Item>

        <Form.Item
          name="amountYuan"
          label="资源金额（元）"
          rules={[
            { required: true, message: '请填写资源金额' },
            {
              type: 'number',
              min: 0,
              message: '资源金额不能小于0',
            },
          ]}
        >
          <InputNumber
            min={0}
            precision={2}
            style={{ width: '100%' }}
            disabled={readOnly || amountReadOnly || amountFieldsLocked}
          />
        </Form.Item>

        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} placeholder="使用日期、数量、明细、特殊约定" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
