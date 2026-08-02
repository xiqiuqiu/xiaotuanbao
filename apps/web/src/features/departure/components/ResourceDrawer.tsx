import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CounterpartyType, DirectoryProfileStatus, ResourceKind } from '@xiaotuanbao/shared'
import type { ItinerarySegmentSummary, SupplierSummary } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import {
  getSupplier,
  listSuppliers,
} from '@/services/supplier.service'
import { canEditSupplier } from '@/features/supplier/utils/supplier-permission'
import { RESOURCE_KIND_LABELS, RESOURCE_KIND_OPTIONS } from '../catalog'
import { formatSegmentDateRange } from '../utils/segment-form'
import {
  createEmptyResourceFormValues,
  formValuesToPayload,
  resourceToFormValues,
  type ResourceFormPayload,
  type ResourceFormValues,
  type ResourceSummaryForForm,
} from '../utils/resource-form'
import {
  resolveSupplierFilterKind,
  resolveSupplierIdAfterKindChange,
} from '../utils/resource-supplier-filter'
import {
  createOrResolveSupplierByName,
  duplicateSupplierWarningMessage,
  RESOURCE_SUPPLIER_CREATE_OPTION_VALUE,
  formatResourceSupplierCreateOptionLabel,
  resolveDuplicateSupplierSelection,
  shouldShowResourceSupplierCreateOption,
} from '../utils/resource-supplier-quick-create'

interface ResourceDrawerProps {
  open: boolean
  segment?: ItinerarySegmentSummary
  editing: ResourceSummaryForForm | null
  readOnly: boolean
  amountReadOnly?: boolean
  loading: boolean
  /** 未提交应付时可展示「保存并提交应付」。 */
  canSaveAndGenerate?: boolean
  saveAndGenerateLoading?: boolean
  onClose: () => void
  onSubmit: (
    values: ResourceFormPayload,
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
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ResourceFormValues>()
  const submitIntentRef = useRef<'save' | 'saveAndGenerate'>('save')
  const resourceKind = Form.useWatch('resourceKind', form)
  const actionsBusy = loading || saveAndGenerateLoading
  const amountFieldsLocked = Boolean(editing?.amountFieldsLocked)
  const supplierFilterKind = resolveSupplierFilterKind(resourceKind)
  const supplierCategoriesByIdRef = useRef<Map<string, string[]>>(new Map())
  const [supplierSearch, setSupplierSearch] = useState('')
  const [createdSupplierOption, setCreatedSupplierOption] = useState<{
    id: string
    name: string
  } | null>(null)
  const canWriteSupplier = canEditSupplier(useAuthStore((state) => state.actionKeys) ?? [])
  /** 历史 Partner 拼出行：无 supplierId，可继续编辑；改选供应商则迁移。 */
  const isHistoricalPartnerResource = Boolean(
    editing &&
      editing.counterpartyType === CounterpartyType.PARTNER &&
      !editing.supplierId,
  )
  const supplierRequired = !(
    isHistoricalPartnerResource && resourceKind === ResourceKind.OUTSOURCE
  )

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
    : '发团级资源'

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
    setSupplierSearch('')
    setCreatedSupplierOption(null)
  }, [form, initialValues, open])

  const handleClose = () => {
    resetSubmitIntent()
    form.resetFields()
    setSupplierSearch('')
    setCreatedSupplierOption(null)
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

  const supplierOptions = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>()
    for (const supplier of suppliersResult?.items ?? []) {
      byId.set(supplier.id, { value: supplier.id, label: supplier.name })
    }
    if (editingSupplier && !byId.has(editingSupplier.id)) {
      byId.set(editingSupplier.id, {
        value: editingSupplier.id,
        label: editingSupplier.name,
      })
    }
    if (createdSupplierOption && !byId.has(createdSupplierOption.id)) {
      byId.set(createdSupplierOption.id, {
        value: createdSupplierOption.id,
        label: createdSupplierOption.name,
      })
    }

    const options = [...byId.values()]
    if (
      shouldShowResourceSupplierCreateOption({
        canWriteSupplier,
        resourceKind,
        searchText: supplierSearch,
        suppliers: options.map((item) => ({ name: item.label })),
      })
    ) {
      const name = supplierSearch.trim()
      options.push({
        value: RESOURCE_SUPPLIER_CREATE_OPTION_VALUE,
        label: formatResourceSupplierCreateOptionLabel(name),
      })
    }
    return options
  }, [
    canWriteSupplier,
    createdSupplierOption,
    editingSupplier,
    resourceKind,
    supplierSearch,
    suppliersResult?.items,
  ])

  const selectExistingSupplier = (supplier: Pick<SupplierSummary, 'id' | 'name' | 'categories'>) => {
    supplierCategoriesByIdRef.current.set(supplier.id, supplier.categories)
    setCreatedSupplierOption({ id: supplier.id, name: supplier.name })
    form.setFieldsValue({ supplierId: supplier.id })
    setSupplierSearch('')
  }

  const applyDuplicateSupplier = (supplier: SupplierSummary, kind: ResourceKind) => {
    const resolved = resolveDuplicateSupplierSelection({
      supplier,
      resourceKind: kind,
    })
    if (!resolved.ok) {
      message.warning(
        resolved.reason === 'missing_category'
          ? '供应商已存在，但未包含当前资源种类，请到供应商管理补充类别或另选'
          : duplicateSupplierWarningMessage(resolved.reason),
      )
      return false
    }
    selectExistingSupplier(supplier)
    message.info('供应商已存在，已自动选中')
    return true
  }

  const quickCreateMutation = useMutation({
    mutationFn: async (name: string) => {
      const kind = resourceKind
      if (!kind) {
        throw new Error('请先选择资源种类')
      }

      return createOrResolveSupplierByName({
        name,
        category: kind,
        localCandidates: [
          ...(suppliersResult?.items ?? []),
          ...(editingSupplier ? [editingSupplier] : []),
          ...(createdSupplierOption
            ? [{ id: createdSupplierOption.id, name: createdSupplierOption.name }]
            : []),
        ],
        resolveLocal: async (id) => {
          const fromList = suppliersResult?.items.find((item) => item.id === id)
          if (fromList) {
            return fromList
          }
          if (editingSupplier?.id === id) {
            return editingSupplier
          }
          return undefined
        },
      })
    },
    onSuccess: (result) => {
      if (result.kind === 'created') {
        selectExistingSupplier(result.supplier)
        message.success('供应商已创建')
        void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
        return
      }
      applyDuplicateSupplier(result.supplier, resourceKind!)
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建供应商失败')
    },
  })

  const handleSupplierSelectValue = (value: string | null | undefined) => {
    if (value !== RESOURCE_SUPPLIER_CREATE_OPTION_VALUE) {
      return value ?? undefined
    }
    const name = supplierSearch.trim()
    if (name && !quickCreateMutation.isPending) {
      quickCreateMutation.mutate(name)
    }
    return form.getFieldValue('supplierId') as string | undefined
  }

  return (
    <Drawer
      title={
        <Space orientation="vertical" size={token.marginXXS}>
          <span>{drawerTitle}</span>
          <Typography.Text type="secondary" style={{ fontWeight: 'normal' }}>
            {segmentContext}
          </Typography.Text>
        </Space>
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
                保存并提交应付
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

      {isHistoricalPartnerResource && !readOnly ? (
        <Alert
          type="info"
          showIcon
          title="历史承接方资源"
          description={`当前对手方为承接方「${editing?.counterpartyName ?? '-'}」。可继续编辑；若选择供应商将改为供应商对手方。`}
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
          label="资源种类"
          rules={[{ required: true, message: '请选择资源种类' }]}
        >
          <Select
            options={(
              resourceKind === ResourceKind.SHOP ||
              resourceKind === ResourceKind.ENTERTAINMENT
                ? [
                    ...RESOURCE_KIND_OPTIONS,
                    {
                      value: resourceKind,
                      label: RESOURCE_KIND_LABELS[resourceKind],
                    },
                  ]
                : [...RESOURCE_KIND_OPTIONS]
            ).map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            disabled={readOnly || amountFieldsLocked}
            onChange={(nextKind) => {
              const currentSupplierId = form.getFieldValue('supplierId') as string | undefined
              const nextSupplierId = resolveSupplierIdAfterKindChange({
                nextKind,
                currentSupplierId,
                currentSupplierCategories: currentSupplierId
                  ? supplierCategoriesByIdRef.current.get(currentSupplierId)
                  : undefined,
              })
              form.setFieldsValue({
                partnerId: undefined,
                supplierId: nextSupplierId,
              })
              setSupplierSearch('')
              if (!nextSupplierId) {
                setCreatedSupplierOption(null)
              }
            }}
          />
        </Form.Item>

        {resourceKind ? (
          <Form.Item
            name="supplierId"
            label="供应商"
            rules={
              supplierRequired ? [{ required: true, message: '请选择供应商' }] : undefined
            }
            getValueFromEvent={handleSupplierSelectValue}
          >
            <Select
              allowClear={!supplierRequired}
              showSearch={{ optionFilterProp: 'label' }}
              searchValue={supplierSearch}
              onSearch={setSupplierSearch}
              placeholder={
                supplierRequired ? '选择供应商' : '可选：改选供应商以迁移对手方'
              }
              options={supplierOptions}
              disabled={readOnly || amountFieldsLocked || quickCreateMutation.isPending}
              loading={quickCreateMutation.isPending}
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
