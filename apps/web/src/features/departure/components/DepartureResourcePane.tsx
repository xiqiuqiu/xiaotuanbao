import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Empty,
  Flex,
  Form,
  Space,
  Spin,
  Table,
  Typography,
  theme,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DepartureStatus, SegmentPayableStatus } from '@xiaotuanbao/shared'
import type { DepartureDetail, DepartureResourceSummary } from '@/types/api'
import { formatCents } from '../catalog'
import {
  formatBatchFinanceGenerationConfirmContent,
  formatBatchFinanceGenerationMessage,
} from '../utils/batch-finance-generation-message'
import { generateDeparturePayablesBatch } from '../utils/generate-departure-payables-batch'
import { summarizeSegmentResourceAmounts } from '../utils/segment-resource-amount-summary'
import {
  createDepartureResource,
  deleteDepartureResource,
  generateDeparturePayable,
  listDepartureResources,
  updateDepartureResource,
} from '@/services/departure-resource.service'
import { formValuesToPayload } from '../utils/resource-form'
import { ResourceDrawer } from './ResourceDrawer'
import { buildExecutionResourceColumns } from './execution-resource-columns'
import { renderExecutionResourceTableSummary } from './execution-resource-table-summary'
import { counterpartyFilterFromSegmentResource } from '@/features/finance/utils/payment-schedule-view-counterparty'
import { canMutateFinance } from '@/features/finance/utils/finance-permission'
import { useAuthStore } from '@/app/store/auth.store'
import { cancelSchedule, voidResourcePayable } from '@/services/finance.service'
import {
  CloseResourcePayableModal,
  VoidResourcePayableModal,
  type CloseResourcePayableFormValues,
  type VoidResourcePayableFormValues,
} from './ResourcePayableActionModals'
import styles from './DepartureResourcePane.module.css'

function mutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

interface DepartureResourcePaneProps {
  departure: DepartureDetail
  readOnly: boolean
  /** 是否持有 `departure:write`；财务无，仅封锁资源编辑与作废，不影响提交应付。 */
  canEdit: boolean
  amountReadOnly?: boolean
  highlightDepartureResourceId?: string
}

interface DepartureResourceSummaryMetaProps {
  amountSummary: ReturnType<typeof summarizeSegmentResourceAmounts>
}

function DepartureResourceSummaryMeta({ amountSummary }: DepartureResourceSummaryMetaProps) {
  const { token } = theme.useToken()
  if (amountSummary.resourceCount === 0) {
    return null
  }

  return (
    <Typography.Text type="secondary" aria-label="发团级资源金额汇总">
      资源 {amountSummary.resourceCount} 项 ｜ 资源金额{' '}
      <Typography.Text strong>
        {formatCents(amountSummary.resourceAmountCents)}
      </Typography.Text>
      {amountSummary.ungeneratedPayableCents > 0 ? (
        <>
          {' ｜ 尚未提交应付 '}
          <Typography.Text strong style={{ color: token.colorWarning }}>
            {formatCents(amountSummary.ungeneratedPayableCents)}
          </Typography.Text>
        </>
      ) : null}
    </Typography.Text>
  )
}

interface DepartureResourceHeaderActionsProps {
  showBatchGenerate: boolean
  batchGenerating: boolean
  showAddResource: boolean
  onBatchGenerate: () => void
  onAddResource: () => void
}

function DepartureResourceHeaderActions({
  showBatchGenerate,
  batchGenerating,
  showAddResource,
  onBatchGenerate,
  onAddResource,
}: DepartureResourceHeaderActionsProps) {
  if (!showBatchGenerate && !showAddResource) {
    return null
  }

  return (
    <Space>
      {showBatchGenerate ? (
        <Button onClick={onBatchGenerate} loading={batchGenerating}>
          批量提交应付
        </Button>
      ) : null}
      {showAddResource ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddResource}>
          添加资源
        </Button>
      ) : null}
    </Space>
  )
}

interface DepartureResourceListProps {
  isError: boolean
  isLoading: boolean
  resources: DepartureResourceSummary[]
  resourceEditable: boolean
  columns: ColumnsType<DepartureResourceSummary>
  highlightResourceId?: string
  onRetry: () => void
  onAddResource: () => void
}

function DepartureResourceList({
  isError,
  isLoading,
  resources,
  resourceEditable,
  columns,
  highlightResourceId,
  onRetry,
  onAddResource,
}: DepartureResourceListProps) {
  const [highlightActive, setHighlightActive] = useState(false)

  useEffect(() => {
    if (!highlightResourceId || !resources.some((item) => item.id === highlightResourceId)) {
      setHighlightActive(false)
      return
    }
    setHighlightActive(true)
    const timer = window.setTimeout(() => setHighlightActive(false), 2400)
    return () => window.clearTimeout(timer)
  }, [highlightResourceId, resources])

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
      <Empty description="暂无发团级资源" style={{ padding: '32px 0' }}>
        {resourceEditable ? (
          <Button icon={<PlusOutlined />} onClick={onAddResource}>
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
      summary={renderExecutionResourceTableSummary}
      rowClassName={(record) =>
        highlightActive && record.id === highlightResourceId ? styles.locateFlash : ''
      }
    />
  )
}

interface SaveResourceMutationsOptions {
  editingResource: DepartureResourceSummary | null
  departureId: string
  closeDrawer: () => void
  invalidateResourceQueries: () => void
  invalidatePayableQueries: () => void
}

function useSaveResourceMutations({
  editingResource,
  departureId,
  closeDrawer,
  invalidateResourceQueries,
  invalidatePayableQueries,
}: SaveResourceMutationsOptions) {
  const { message } = App.useApp()
  const saveMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof formValuesToPayload>) => {
      const editingId = editingResource?.id ?? null
      const saved = editingId
        ? await updateDepartureResource(editingId, payload)
        : await createDepartureResource(departureId, payload)
      return { saved, editingId }
    },
    onSuccess: ({ editingId }) => {
      message.success(editingId ? '资源已更新' : '资源已添加')
      invalidateResourceQueries()
      if ((editingResource?.id ?? null) !== editingId) {
        return
      }
      closeDrawer()
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '保存资源失败'))
    },
  })

  const saveAndGenerateMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof formValuesToPayload>) => {
      const editingId = editingResource?.id ?? null
      const saved = editingId
        ? await updateDepartureResource(editingId, payload)
        : await createDepartureResource(departureId, payload)
      try {
        const generateResult = await generateDeparturePayable(saved.id)
        return { saved, editingId, generateOk: true as const, generateResult }
      } catch (error) {
        return { saved, editingId, generateOk: false as const, generateError: error }
      }
    },
    onSuccess: (result) => {
      invalidateResourceQueries()
      if ((editingResource?.id ?? null) !== result.editingId) {
        return
      }
      if (!result.generateOk) {
        message.warning(
          `资源已保存，但提交应付失败：${mutationErrorMessage(
            result.generateError,
            '请稍后在列表中重试',
          )}`,
        )
        closeDrawer()
        return
      }
      message.success(
        result.generateResult.sourceAmountMismatch
          ? '已保存并提交应付，存在来源金额差异，请核对'
          : '已保存并提交应付',
      )
      invalidatePayableQueries()
      closeDrawer()
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '保存资源失败'))
    },
  })

  return { saveMutation, saveAndGenerateMutation }
}

export function DepartureResourcePane({
  departure,
  readOnly,
  canEdit,
  amountReadOnly = false,
  highlightDepartureResourceId,
}: DepartureResourcePaneProps) {
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const menuKeys = useAuthStore((state) => state.menuKeys)
  const canCloseFinance = canMutateFinance(menuKeys)
  const mutationLocked = readOnly || amountReadOnly
  const resourceEditable = !mutationLocked && canEdit
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<DepartureResourceSummary | null>(null)
  const [viewOnly, setViewOnly] = useState(false)
  const [voidingResource, setVoidingResource] = useState<DepartureResourceSummary | null>(null)
  const [closingResource, setClosingResource] = useState<DepartureResourceSummary | null>(null)
  const [voidForm] = Form.useForm<VoidResourcePayableFormValues>()
  const [closeForm] = Form.useForm<CloseResourcePayableFormValues>()

  const { data: listResult, isLoading, isError, refetch } = useQuery({
    queryKey: ['departure-resources', departure.id],
    queryFn: ({ signal }) => listDepartureResources(departure.id, {}, signal),
  })

  const resources = listResult?.items ?? []
  const amountSummary = useMemo(
    () =>
      summarizeSegmentResourceAmounts(listResult?.items ?? [], {
        departureSettled: departure.status === DepartureStatus.SETTLED,
      }),
    [departure.status, listResult?.items],
  )
  const showBatchGenerate =
    !mutationLocked && amountSummary.ungeneratedPayableCount > 0

  const invalidateResourceQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['departure-resources', departure.id] })
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

  const openEdit = useCallback((resource: DepartureResourceSummary, view = false) => {
    setEditingResource(() => resource)
    setViewOnly(view || resource.amountFieldsLocked)
    setDrawerOpen(true)
  }, [])

  const invalidatePayableQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
  }

  const { saveMutation, saveAndGenerateMutation } = useSaveResourceMutations({
    editingResource,
    departureId: departure.id,
    closeDrawer,
    invalidateResourceQueries,
    invalidatePayableQueries,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDepartureResource(id),
    onSuccess: () => {
      message.success('资源已删除')
      invalidateResourceQueries()
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '删除资源失败'))
    },
  })

  const generateMutation = useMutation({
    mutationFn: (id: string) => generateDeparturePayable(id),
    onSuccess: (result) => {
      message.success(
        result.sourceAmountMismatch
          ? '应付已提交，存在来源金额差异，请核对'
          : '应付已提交',
      )
      invalidateResourceQueries()
      invalidatePayableQueries()
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '提交应付失败'))
    },
  })

  const batchGenerateMutation = useMutation({
    mutationFn: () => generateDeparturePayablesBatch(resources),
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
      invalidatePayableQueries()
    },
    onError: (error) => {
      message.error(mutationErrorMessage(error, '批量提交应付失败'))
    },
  })

  const confirmBatchGenerate = () => {
    modal.confirm({
      title: '批量提交应付',
      content: formatBatchFinanceGenerationConfirmContent(
        amountSummary.ungeneratedPayableCount,
        '应付',
      ),
      okText: '提交',
      cancelText: '取消',
      onOk: () => batchGenerateMutation.mutateAsync(),
    })
  }

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
      invalidatePayableQueries()
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
      invalidatePayableQueries()
    },
    onError: (error) => message.error(mutationErrorMessage(error, '关闭节点失败')),
  })

  const onViewPayables = useCallback(
    (resource: DepartureResourceSummary) => {
      const counterparty = counterpartyFilterFromSegmentResource(resource)
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: {
          tab: 'payables',
          highlightSegmentResourceId: resource.id,
          ...(counterparty
            ? { counterpartyKeyword: counterparty.counterpartyKeyword }
            : {}),
        },
      })
    },
    [departure.id, navigate],
  )

  const generatingId = generateMutation.isPending ? generateMutation.variables : undefined
  const generateResource = generateMutation.mutate
  const deleteResource = deleteMutation.mutate

  const columns = useMemo(
    () =>
      buildExecutionResourceColumns<DepartureResourceSummary>({
        mutationLocked,
        canEdit,
        canMutateFinance: canCloseFinance,
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
      canCloseFinance,
      generatingId,
      openEdit,
      onViewPayables,
      generateResource,
      deleteResource,
    ],
  )

  return (
    <div className={styles.pane}>
      <Flex
        align="center"
        justify="space-between"
        gap={16}
        wrap="wrap"
        className={styles.flatHeader}
      >
        <Flex align="baseline" gap={16} wrap="wrap">
          <Typography.Text strong>发团级资源</Typography.Text>
          <DepartureResourceSummaryMeta amountSummary={amountSummary} />
        </Flex>
        <DepartureResourceHeaderActions
          showBatchGenerate={showBatchGenerate}
          batchGenerating={batchGenerateMutation.isPending}
          showAddResource={resourceEditable && !isLoading && !isError}
          onBatchGenerate={confirmBatchGenerate}
          onAddResource={openCreate}
        />
      </Flex>
      <div className={styles.flatBody}>
        <DepartureResourceList
          isError={isError}
          isLoading={isLoading}
          resources={resources}
          resourceEditable={resourceEditable}
          columns={columns}
          highlightResourceId={highlightDepartureResourceId}
          onRetry={() => void refetch()}
          onAddResource={openCreate}
        />
      </div>

      <ResourceDrawer
        open={drawerOpen}
        editing={editingResource}
        readOnly={mutationLocked || viewOnly || !canEdit}
        amountReadOnly={amountReadOnly}
        loading={saveMutation.isPending}
        canSaveAndGenerate={
          resourceEditable &&
          !viewOnly &&
          !mutationLocked &&
          (editingResource == null ||
            editingResource.payableStatus === SegmentPayableStatus.NOT_GENERATED)
        }
        saveAndGenerateLoading={saveAndGenerateMutation.isPending}
        onClose={closeDrawer}
        onSubmit={(values, options) => {
          if (options?.generatePayable) {
            saveAndGenerateMutation.mutate(values)
            return
          }
          saveMutation.mutate(values)
        }}
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
