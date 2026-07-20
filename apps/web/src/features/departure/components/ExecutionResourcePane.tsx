import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  Form,
  Modal,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  DepartureDetail,
  ItinerarySegmentSummary,
  SegmentResourceSummary,
} from '@/types/api'
import {
  createSegmentResource,
  deleteSegmentResource,
  generatePayable,
  generatePayablesForSegment,
  listSegmentResources,
  updateSegmentResource,
} from '@/services/segment-resource.service'
import { formValuesToPayload } from '../utils/resource-form'
import {
  formatBatchFinanceGenerationConfirmContent,
  formatBatchFinanceGenerationMessage,
} from '../utils/batch-finance-generation-message'
import { segmentPayableGenerationGap } from '../utils/segment-payable-generation-gap'
import { ResourceDrawer } from './ResourceDrawer'
import { buildExecutionResourceColumns } from './execution-resource-columns'
import { counterpartyFilterFromSegmentResource } from '@/features/finance/utils/payment-schedule-view-counterparty'
import { cancelSchedule, voidResourcePayable } from '@/services/finance.service'
import {
  CloseResourcePayableModal,
  VoidResourcePayableModal,
  type CloseResourcePayableFormValues,
  type VoidResourcePayableFormValues,
} from './ResourcePayableActionModals'

function mutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

interface ExecutionResourcePaneProps {
  departure: DepartureDetail
  segment: ItinerarySegmentSummary
  readOnly: boolean
  /** 是否持有 `departure:write`；财务无，仅封锁资源编辑与作废，不影响生成应付。 */
  canEdit: boolean
  amountReadOnly?: boolean
}

interface ExecutionResourceHeaderProps {
  showBatchGenerate: boolean
  batchGenerating: boolean
  showAddResource: boolean
  onBatchGenerate: () => void
  onAddResource: () => void
}

function ExecutionResourceHeader({
  showBatchGenerate,
  batchGenerating,
  showAddResource,
  onBatchGenerate,
  onAddResource,
}: ExecutionResourceHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 16,
      }}
    >
      <Typography.Text strong>资源安排</Typography.Text>
      <Space>
        {showBatchGenerate ? (
          <Button onClick={onBatchGenerate} loading={batchGenerating}>
            批量生成应付
          </Button>
        ) : null}
        {showAddResource ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={onAddResource}>
            添加资源
          </Button>
        ) : null}
      </Space>
    </div>
  )
}

interface ExecutionResourceListProps {
  isError: boolean
  isLoading: boolean
  resources: SegmentResourceSummary[]
  resourceEditable: boolean
  columns: ColumnsType<SegmentResourceSummary>
  onRetry: () => void
  onAddResource: () => void
}

function ExecutionResourceList({
  isError,
  isLoading,
  resources,
  resourceEditable,
  columns,
  onRetry,
  onAddResource,
}: ExecutionResourceListProps) {
  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="资源列表加载失败"
        description="请稍后重试，或检查网络后再次加载。"
        action={
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        }
      />
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }

  if (resources.length === 0) {
    return (
      <Empty description="本段暂无资源" style={{ padding: '48px 0' }}>
        {resourceEditable ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={onAddResource}>
            添加资源
          </Button>
        ) : null}
      </Empty>
    )
  }

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={resources}
      pagination={false}
      scroll={{ x: 1300 }}
    />
  )
}

export function ExecutionResourcePane({
  departure,
  segment,
  readOnly,
  canEdit,
  amountReadOnly = false,
}: ExecutionResourcePaneProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mutationLocked = readOnly || amountReadOnly
  // 资源增删改与作废应付属 departure:write：财务只读，但生成应付/关闭节点不受此限。
  const resourceEditable = !mutationLocked && canEdit
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<SegmentResourceSummary | null>(null)
  const [viewOnly, setViewOnly] = useState(false)
  const [voidingResource, setVoidingResource] = useState<SegmentResourceSummary | null>(null)
  const [closingResource, setClosingResource] = useState<SegmentResourceSummary | null>(null)
  const [voidForm] = Form.useForm<VoidResourcePayableFormValues>()
  const [closeForm] = Form.useForm<CloseResourcePayableFormValues>()

  const { data: listResult, isLoading, isError, refetch } = useQuery({
    queryKey: ['segment-resources', segment.id],
    queryFn: () => listSegmentResources(segment.id),
  })

  const resources = listResult?.items ?? []
  const payableGap = segmentPayableGenerationGap(
    segment.payableGeneratedCount,
    segment.resourceCount,
  )
  const showBatchGenerate = !mutationLocked && payableGap.hasGap

  const invalidateResourceQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['segment-resources', segment.id] })
    void queryClient.invalidateQueries({ queryKey: ['segments', departure.id] })
    void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditingResource(null)
    setViewOnly(false)
  }

  const openCreate = () => {
    setEditingResource(null)
    setViewOnly(false)
    setDrawerOpen(true)
  }

  const openEdit = useCallback(
    (resource: SegmentResourceSummary, view = false) => {
      setEditingResource(() => resource)
      setViewOnly(view || resource.amountFieldsLocked)
      setDrawerOpen(true)
    },
    [],
  )

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formValuesToPayload>) => {
      if (editingResource) {
        return updateSegmentResource(editingResource.id, payload)
      }
      return createSegmentResource(segment.id, payload)
    },
    onSuccess: () => {
      message.success(editingResource ? '资源已更新' : '资源已添加')
      closeDrawer()
      invalidateResourceQueries()
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '保存资源失败'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSegmentResource(id),
    onSuccess: () => {
      message.success('资源已删除')
      invalidateResourceQueries()
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '删除资源失败'))
    },
  })

  const generateMutation = useMutation({
    mutationFn: (id: string) => generatePayable(id),
    onSuccess: (result) => {
      message.success(
        result.sourceAmountMismatch
          ? '应付已生成，存在来源金额差异，请核对'
          : '应付已生成',
      )
      invalidateResourceQueries()
      void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '生成应付失败'))
    },
  })

  const batchGenerateMutation = useMutation({
    mutationFn: () => generatePayablesForSegment(segment.id),
    onSuccess: (result) => {
      const text = formatBatchFinanceGenerationMessage(result, '应付')
      if (result.failed > 0) {
        message.warning(text)
      } else if (result.succeeded > 0) {
        message.success(text)
      } else {
        message.info(text)
      }
      invalidateResourceQueries()
      void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '批量生成应付失败'))
    },
  })

  const voidMutation = useMutation({
    mutationFn: (values: VoidResourcePayableFormValues) => {
      if (!voidingResource?.paymentScheduleId) throw new Error('未找到待作废应付节点')
      return voidResourcePayable(voidingResource.paymentScheduleId, {
        voidReason: values.voidReason.trim(),
      })
    },
    onSuccess: () => {
      message.success('应付已作废，可修正资源后重新生成')
      setVoidingResource(null)
      voidForm.resetFields()
      invalidateResourceQueries()
      void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
    },
    onError: (error) => message.error(mutationErrorMessage(error, '作废应付失败')),
  })

  const closeMutation = useMutation({
    mutationFn: (values: CloseResourcePayableFormValues) => {
      if (!closingResource?.paymentScheduleId) throw new Error('未找到待关闭应付节点')
      return cancelSchedule(closingResource.paymentScheduleId, {
        closeDisposition: values.closeDisposition,
        cancelReason: values.cancelReason.trim(),
      })
    },
    onSuccess: () => {
      message.success('应付节点已关闭')
      setClosingResource(null)
      closeForm.resetFields()
      invalidateResourceQueries()
      void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
    },
    onError: (error) => message.error(mutationErrorMessage(error, '关闭节点失败')),
  })

  const confirmBatchGenerate = () => {
    if (!payableGap.hasGap) return
    Modal.confirm({
      title: '批量生成应付',
      content: formatBatchFinanceGenerationConfirmContent(payableGap.ungenerated, '应付'),
      okText: '生成',
      cancelText: '取消',
      onOk: () => batchGenerateMutation.mutateAsync(),
    })
  }

  const onViewPayables = useCallback(
    (resource: SegmentResourceSummary) => {
      const counterparty = counterpartyFilterFromSegmentResource(resource)
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: {
          tab: 'payables',
          highlightSegmentResourceId: resource.id,
          ...(segment.id ? { segmentId: segment.id } : {}),
          ...(counterparty
            ? { counterpartyKeyword: counterparty.counterpartyKeyword }
            : {}),
        },
      })
    },
    [departure.id, navigate, segment.id],
  )

  const generatingId = generateMutation.isPending
    ? generateMutation.variables
    : undefined
  const generateResource = generateMutation.mutate
  const deleteResource = deleteMutation.mutate

  const columns = useMemo(
    () =>
      buildExecutionResourceColumns({
        mutationLocked,
        canEdit,
        generatingId,
        onEdit: openEdit,
        onViewPayables,
        onGenerate: generateResource,
        onDelete: deleteResource,
        onVoidPayable: (resource) => setVoidingResource(resource),
        onClosePayable: (resource) => setClosingResource(resource),
      }),
    [
      mutationLocked,
      canEdit,
      generatingId,
      openEdit,
      onViewPayables,
      generateResource,
      deleteResource,
    ],
  )

  return (
    <div>
      <ExecutionResourceHeader
        showBatchGenerate={showBatchGenerate}
        batchGenerating={batchGenerateMutation.isPending}
        showAddResource={
          resourceEditable && !isLoading && !isError && resources.length > 0
        }
        onBatchGenerate={confirmBatchGenerate}
        onAddResource={openCreate}
      />

      <ExecutionResourceList
        isError={isError}
        isLoading={isLoading}
        resources={resources}
        resourceEditable={resourceEditable}
        columns={columns}
        onRetry={() => void refetch()}
        onAddResource={openCreate}
      />

      <ResourceDrawer
        open={drawerOpen}
        segment={segment}
        editing={editingResource}
        readOnly={mutationLocked || viewOnly || !canEdit}
        amountReadOnly={amountReadOnly}
        loading={saveMutation.isPending}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
      <VoidResourcePayableModal
        resource={voidingResource}
        form={voidForm}
        loading={voidMutation.isPending}
        onClose={() => {
          setVoidingResource(null)
          voidForm.resetFields()
        }}
        onSubmit={(values) => voidMutation.mutate(values)}
      />
      <CloseResourcePayableModal
        resource={closingResource}
        form={closeForm}
        loading={closeMutation.isPending}
        onClose={() => {
          setClosingResource(null)
          closeForm.resetFields()
        }}
        onSubmit={(values) => closeMutation.mutate(values)}
      />
    </div>
  )
}
