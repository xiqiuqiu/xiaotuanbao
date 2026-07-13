import { useCallback, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import type {
  DepartureDetail,
  ItinerarySegmentSummary,
  SegmentResourceSummary,
} from '@/types/api'
import {
  createSegmentResource,
  deleteSegmentResource,
  generatePayable,
  listSegmentResources,
  updateSegmentResource,
} from '@/services/segment-resource.service'
import {
  RESOURCE_KIND_LABELS,
  SEGMENT_PAYABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { formValuesToPayload } from '../utils/resource-form'
import { ResourceDrawer } from './ResourceDrawer'

function canGeneratePayable(record: SegmentResourceSummary): boolean {
  return record.payableStatus === SegmentPayableStatus.NOT_GENERATED
}

function payableStatusTagColor(status: string): string | undefined {
  switch (status) {
    case SegmentPayableStatus.PAID:
      return 'success'
    case SegmentPayableStatus.PARTIAL:
      return 'warning'
    case SegmentPayableStatus.PENDING:
      return 'processing'
    default:
      return 'default'
  }
}

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
    setEditingResource(resource)
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

  const onViewPayables = useCallback(
    (resource: SegmentResourceSummary) => {
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: {
          tab: 'payables',
          highlightSegmentResourceId: resource.id,
          ...(segment.id ? { segmentId: segment.id } : {}),
        },
      })
    },
    [departure.id, navigate, segment.id],
  )

  const columns: ColumnsType<SegmentResourceSummary> = [
    {
      title: '资源种类',
      dataIndex: 'resourceKind',
      width: 90,
      render: (value: string) => catalogLabel(RESOURCE_KIND_LABELS, value),
    },
    {
      title: '对手方',
      dataIndex: 'counterpartyName',
      width: 140,
    },
    {
      title: '资源项目',
      dataIndex: 'title',
      width: 140,
      render: (value: string) => value || '-',
    },
    {
      title: '资源金额',
      dataIndex: 'amountCents',
      width: 110,
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '应付状态',
      dataIndex: 'payableStatus',
      width: 100,
      render: (value: string) => (
        <Tag color={payableStatusTagColor(value)}>
          {catalogLabel(SEGMENT_PAYABLE_STATUS_LABELS, value)}
        </Tag>
      ),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      ellipsis: true,
      render: (value: string | null) => value || '-',
    },
    {
      title: '操作',
      width: 260,
      fixed: 'right',
      render: (_, record) => {
        const allowGenerate = canGeneratePayable(record)

        return (
          <Space size={0} wrap>
            <Button
              type="link"
              size="small"
              onClick={() => openEdit(record, record.amountFieldsLocked)}
            >
              {mutationLocked || record.amountFieldsLocked ? '查看' : '编辑'}
            </Button>
            {!allowGenerate ? (
              <Button type="link" size="small" onClick={() => onViewPayables(record)}>
                查看应付
              </Button>
            ) : null}
            {!mutationLocked && allowGenerate ? (
              <Button
                type="link"
                size="small"
                onClick={() => generateMutation.mutate(record.id)}
                loading={generateMutation.isPending && generateMutation.variables === record.id}
              >
                生成应付
              </Button>
            ) : null}
            {!mutationLocked && allowGenerate ? (
              <Popconfirm
                title="确定删除该资源？"
                onConfirm={() => deleteMutation.mutate(record.id)}
              >
                <Button type="link" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        )
      },
    },
  ]

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
        {!mutationLocked && !isLoading && !isError && resources.length > 0 ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            添加资源
          </Button>
        ) : null}
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
