import { useState } from 'react'
import { Button, Empty, Popconfirm, Space, Spin, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
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
  const queryClient = useQueryClient()
  const mutationLocked = readOnly || amountReadOnly
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<SegmentResourceSummary | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['segment-resources', segment.id],
    queryFn: () => listSegmentResources(segment.id),
  })

  const resources = listResult?.items ?? []
  const resourceCount = isLoading ? segment.resourceCount : resources.length

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
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSegmentResource(id),
    onSuccess: () => {
      message.success('资源已删除')
      invalidateResourceQueries()
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
    },
  })

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
      title: '资源名称',
      dataIndex: 'title',
      width: 140,
      render: (value: string) => value || '—',
    },
    {
      title: '资源金额',
      dataIndex: 'amountCents',
      width: 110,
      render: (value: number) => formatCents(value),
    },
    {
      title: '应付状态',
      dataIndex: 'payableStatus',
      width: 100,
      render: (value: string) => catalogLabel(SEGMENT_PAYABLE_STATUS_LABELS, value),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      ellipsis: true,
      render: (value: string | null) => value || '—',
    },
    {
      title: '操作',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} wrap>
          <Button
            type="link"
            size="small"
            onClick={() => openEdit(record, record.amountFieldsLocked)}
          >
            {mutationLocked || record.amountFieldsLocked ? '查看' : '编辑'}
          </Button>
          {!mutationLocked && !record.hasPaymentSchedule ? (
            <Button
              type="link"
              size="small"
              onClick={() => generateMutation.mutate(record.id)}
              loading={generateMutation.isPending && generateMutation.variables === record.id}
            >
              生成应付
            </Button>
          ) : null}
          {!mutationLocked && record.hasPaymentSchedule && !record.amountFieldsLocked ? (
            <Button
              type="link"
              size="small"
              onClick={() => generateMutation.mutate(record.id)}
              loading={generateMutation.isPending && generateMutation.variables === record.id}
            >
              重新生成
            </Button>
          ) : null}
          {!mutationLocked && !record.hasPaymentSchedule ? (
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
      ),
    },
  ]

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <Typography.Text strong>资源安排</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
            {segment.name} · 适用 {segment.applicableGuestCount} 人 · {resourceCount} 项
          </Typography.Paragraph>
        </div>
        {!mutationLocked && !isLoading && resources.length > 0 ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            添加资源
          </Button>
        ) : null}
      </div>

      {isLoading ? (
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
