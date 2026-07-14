import { useCallback, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  Modal,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
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
import { formatBatchFinanceGenerationMessage } from '../utils/batch-finance-generation-message'
import { segmentPayableGenerationGap } from '../utils/segment-payable-generation-gap'
import { ResourceDrawer } from './ResourceDrawer'
import { buildExecutionResourceColumns } from './execution-resource-columns'
import { counterpartyFilterFromSegmentResource } from '@/features/finance/utils/payment-schedule-view-counterparty'

function mutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

interface ExecutionResourcePaneProps {
  departure: DepartureDetail
  segment: ItinerarySegmentSummary
  readOnly: boolean
  amountReadOnly?: boolean
}

export function ExecutionResourcePane({
  departure,
  segment,
  readOnly,
  amountReadOnly = false,
}: ExecutionResourcePaneProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mutationLocked = readOnly || amountReadOnly
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<SegmentResourceSummary | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

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

  const openEdit = (resource: SegmentResourceSummary, view = false) => {
    setEditingResource(() => resource)
    setViewOnly(view || resource.amountFieldsLocked)
    setDrawerOpen(true)
  }

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

  const confirmBatchGenerate = () => {
    Modal.confirm({
      title: '批量生成应付',
      content: '将为本段所有尚未生成应付的资源生成应付，是否继续？',
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

  const columns = buildExecutionResourceColumns({
    mutationLocked,
    generatingId: generateMutation.isPending ? generateMutation.variables : undefined,
    onEdit: openEdit,
    onViewPayables,
    onGenerate: (id) => generateMutation.mutate(id),
    onDelete: (id) => deleteMutation.mutate(id),
  })

  return (
    <div>
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
            <Button
              onClick={confirmBatchGenerate}
              loading={batchGenerateMutation.isPending}
            >
              批量生成应付
            </Button>
          ) : null}
          {!mutationLocked && !isLoading && !isError && resources.length > 0 ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              添加资源
            </Button>
          ) : null}
        </Space>
      </div>

      {isError ? (
        <Alert
          type="error"
          showIcon
          title="资源列表加载失败"
          description="请稍后重试，或检查网络后再次加载。"
          action={
            <Button size="small" onClick={() => void refetch()}>
              重试
            </Button>
          }
        />
      ) : isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : resources.length === 0 ? (
        <Empty description="本段暂无资源" style={{ padding: '48px 0' }}>
          {!mutationLocked ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              添加资源
            </Button>
          ) : null}
        </Empty>
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={resources}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      )}

      <ResourceDrawer
        open={drawerOpen}
        segment={segment}
        editing={editingResource}
        readOnly={mutationLocked || viewOnly}
        amountReadOnly={amountReadOnly}
        loading={saveMutation.isPending}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}
