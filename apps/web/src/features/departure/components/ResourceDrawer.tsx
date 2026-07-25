import { useEffect, useMemo, useRef } from 'react'
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
  theme,
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import type { ItinerarySegmentSummary, SegmentResourceSummary } from '@/types/api'
import { getSupplier, listSuppliers } from '@/services/supplier.service'
import { RESOURCE_KIND_OPTIONS } from '../catalog'
import { formatSegmentDateRange } from '../utils/segment-form'
import {
  createEmptyResourceFormValues,
  formValuesToPayload,
  resourceToFormValues,
  type ResourceFormValues,
} from '../utils/resource-form'
import {
  resolveSupplierFilterKind,
  resolveSupplierIdAfterKindChange,
} from '../utils/resource-supplier-filter'

interface ResourceDrawerProps {
  open: boolean
  segment?: ItinerarySegmentSummary
  editing: SegmentResourceSummary | null
  readOnly: boolean
  amountReadOnly?: boolean
  loading: boolean
  /** 未生成应付时可展示「保存并生成应付」。 */
  canSaveAndGenerate?: boolean
  saveAndGenerateLoading?: boolean
  onClose: () => void
  onSubmit: (
    values: ReturnType<typeof formValuesToPayload>,
    options?: { generatePayable?: boolean },
  ) => void
}

export function ResourceDrawer({
  open,
  segment,
  editing,
  readOnly,
  amountReadOnly = false,
  loading,
  canSaveAndGenerate = false,
  saveAndGenerateLoading = false,
  onClose,
  onSubmit,
}: ResourceDrawerProps) {
  const { token } = theme.useToken()
  const [form] = Form.useForm<ResourceFormValues>()
  const submitIntentRef = useRef<'save' | 'saveAndGenerate'>('save')
  const resourceKind = Form.useWatch('resourceKind', form)
  const actionsBusy = loading || saveAndGenerateLoading
  const amountFieldsLocked = Boolean(editing?.amountFieldsLocked)
  const supplierFilterKind = resolveSupplierFilterKind(resourceKind)
  const supplierCategoriesByIdRef = useRef<Map<string, string[]>>(new Map())

  const formKey = editing?.id ?? 'new'
  const initialValues = useMemo(
    () => (editing ? resourceToFormValues(editing) : createEmptyResourceFormValues()),
    [editing],
  )

  const drawerTitle = readOnly ? '查看资源' : editing ? '编辑资源' : '添加资源'
  const segmentContext = segment
    ? [segment.name, formatSegmentDateRange(segment.startDate, segment.endDate)]
        .filter(Boolean)
        .join('｜')
    : null

  const resetSubmitIntent = () => {
    submitIntentRef.current = 'save'
  }

  useEffect(() => {
    if (!open) {
      resetSubmitIntent()
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
  }, [form, initialValues, open])

  const handleClose = () => {
    resetSubmitIntent()
    form.resetFields()
    onClose()
  }

  const { data: suppliersResult } = useQuery({
    queryKey: ['suppliers', 'resource-select', supplierFilterKind],
    queryFn: () =>
      listSuppliers({
        status: DirectoryProfileStatus.ACTIVE,
        category: supplierFilterKind,
        pageSize: 100,
      }),
    enabled: open && Boolean(supplierFilterKind),
  })

  const editingSupplierId = editing?.supplierId ?? undefined
  const { data: editingSupplier } = useQuery({
    queryKey: ['suppliers', 'resource-edit', editingSupplierId],
    queryFn: () => getSupplier(editingSupplierId!),
    enabled: open && Boolean(editingSupplierId),
  })

  useEffect(() => {
    if (!open) {
      return
    }
    supplierCategoriesByIdRef.current = new Map()
  }, [open, formKey])

  useEffect(() => {
    if (editingSupplier) {
      supplierCategoriesByIdRef.current.set(editingSupplier.id, editingSupplier.categories)
    }
    for (const item of suppliersResult?.items ?? []) {
      supplierCategoriesByIdRef.current.set(item.id, item.categories)
    }
  }, [editingSupplier, suppliersResult])

  return (
    <Drawer
      title={
        segmentContext ? (
          <Space orientation="vertical" size={token.marginXXS}>
            <span>{drawerTitle}</span>
            <Typography.Text type="secondary" style={{ fontWeight: 'normal' }}>
              {segmentContext}
            </Typography.Text>
          </Space>
        ) : (
          drawerTitle
        )
      }
      open={open}
      size="min(480px, 100vw)"
      destroyOnHidden
      onClose={handleClose}
      styles={{ footer: { paddingBlock: token.paddingMD } }}
      footer={
        readOnly ? (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleClose}>关闭</Button>
          </Space>
        ) : (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleClose} disabled={actionsBusy}>
              取消
            </Button>
            {canSaveAndGenerate ? (
              <Button
                loading={saveAndGenerateLoading}
                disabled={actionsBusy}
                onClick={() => {
                  submitIntentRef.current = 'saveAndGenerate'
                  form.submit()
                }}
              >
                保存并生成应付
              </Button>
            ) : null}
            <Button
              type="primary"
              loading={loading}
              disabled={saveAndGenerateLoading}
              onClick={() => {
                submitIntentRef.current = 'save'
                form.submit()
              }}
            >
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
          title="来源差异警示"
          description="资源金额与已生成的应付节点不一致，且财务已介入，请核对后再处理。"
          style={{ marginBottom: token.marginMD }}
        />
      ) : null}

      <Form
        key={formKey}
        form={form}
        layout="vertical"
        disabled={readOnly}
        initialValues={initialValues}
        onFinish={(values) => {
          const generatePayable = submitIntentRef.current === 'saveAndGenerate'
          resetSubmitIntent()
          onSubmit(formValuesToPayload(values), { generatePayable })
        }}
        onFinishFailed={resetSubmitIntent}
      >
        <Form.Item
          name="resourceKind"
          label="资源类型"
          rules={[{ required: true, message: '请选择资源类型' }]}
        >
          <Select
            options={RESOURCE_KIND_OPTIONS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            disabled={readOnly || amountFieldsLocked}
            onChange={(nextKind) => {
              const currentSupplierId = form.getFieldValue('supplierId') as string | undefined
              form.setFieldsValue({
                partnerId: undefined,
                supplierId: resolveSupplierIdAfterKindChange({
                  nextKind,
                  currentSupplierId,
                  currentSupplierCategories: currentSupplierId
                    ? supplierCategoriesByIdRef.current.get(currentSupplierId)
                    : undefined,
                }),
              })
            }}
          />
        </Form.Item>

        {resourceKind ? (
          <Form.Item
            name="supplierId"
            label="供应商"
            rules={[{ required: true, message: '请选择供应商' }]}
          >
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="选择供应商"
              options={suppliersResult?.items.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
              }))}
              disabled={readOnly || amountFieldsLocked}
            />
          </Form.Item>
        ) : null}

        <Form.Item
          name="title"
          label="资源名称"
          rules={[{ required: true, whitespace: true, message: '请填写资源名称' }]}
        >
          <Input placeholder="如喀纳斯用车、阿勒泰拼出、贾登峪住宿" disabled={readOnly} />
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

        <Form.Item name="notes" label="备注" style={{ marginBottom: 0 }}>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="使用日期、数量、明细、特殊约定"
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
