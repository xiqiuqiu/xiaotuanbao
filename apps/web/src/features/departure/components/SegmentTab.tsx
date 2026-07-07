import { useCallback, useMemo, useState } from 'react'
import { Button, Form, Popconfirm, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import {
  createSegment,
  deleteSegment,
  listSegments,
  updateSegment,
} from '@/services/segment.service'
import {
  SEGMENT_PAYABLE_STATUS_LABELS,
  catalogLabel,
} from '../catalog'
import { SegmentSummaryBar } from './SegmentSummaryBar'
import { SegmentDrawer } from './SegmentDrawer'
import {
  formatResourceOverview,
  formatSegmentDateRange,
  formValuesToPayload,
  type SegmentFormValues,
} from '../utils/segment-form'

interface SegmentTabProps {
  departure: DepartureDetail
  readOnly: boolean
}

export function SegmentTab({ departure, readOnly }: SegmentTabProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<SegmentFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingSegment, setEditingSegment] = useState<ItinerarySegmentSummary | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['segments', departure.id],
    queryFn: () => listSegments(departure.id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['segments', departure.id] })
    queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formValuesToPayload>) => {
      if (editingSegment) {
        return updateSegment(editingSegment.id, payload)
      }
      return createSegment(departure.id, payload)
    },
    onSuccess: () => {
      message.success(editingSegment ? '行程段已更新' : '行程段已添加')
      setDrawerOpen(false)
      setEditingSegment(null)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSegment(id),
    onSuccess: () => {
      message.success('行程段已删除')
      invalidate()
    },
  })

  const openCreate = () => {
    setEditingSegment(null)
    setViewOnly(false)
    setDrawerOpen(true)
  }

  const openEdit = (segment: ItinerarySegmentSummary, view = false) => {
    setEditingSegment(segment)
    setViewOnly(view)
    setDrawerOpen(true)
  }

  const navigateToResources = useCallback(
    (segmentId: string) => {
      navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: { tab: 'resources', segmentId },
      })
    },
    [departure.id, navigate],
  )

  const columns: ColumnsType<ItinerarySegmentSummary> = useMemo(
    () => [
      {
        title: '行程段',
        dataIndex: 'name',
        width: 160,
        render: (name: string, record) => (
          <Space size={4}>
            <span>{name}</span>
            {record.fromTemplate ? <Tag>模板带入</Tag> : null}
          </Space>
        ),
      },
      {
        title: '日期范围',
        width: 140,
        render: (_, record) => formatSegmentDateRange(record.startDate, record.endDate),
      },
      {
        title: '天数',
        dataIndex: 'dayCount',
        width: 70,
        render: (dayCount: number) => `${dayCount}天`,
      },
      {
        title: '目的地',
        dataIndex: 'destination',
        width: 120,
        render: (value: string | null) => value || '—',
      },
      {
        title: '适用人数',
        dataIndex: 'applicableGuestCount',
        width: 90,
      },
      {
        title: '资源概况',
        width: 180,
        render: (_, record) => formatResourceOverview(record),
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
            <Button type="link" size="small" onClick={() => openEdit(record, true)}>
              查看
            </Button>
            {!readOnly ? (
              <Button type="link" size="small" onClick={() => openEdit(record, false)}>
                编辑
              </Button>
            ) : null}
            <Button type="link" size="small" onClick={() => navigateToResources(record.id)}>
              资源安排
            </Button>
            {!readOnly && record.resourceCount === 0 ? (
              <Popconfirm
                title="确定删除该行程段？"
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
    ],
    [deleteMutation, navigateToResources, readOnly],
  )

  return (
    <div>
      {listResult?.summary ? (
        <SegmentSummaryBar summary={listResult.summary} readOnly={readOnly} onAdd={openCreate} />
      ) : null}

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={listResult?.items ?? []}
        pagination={false}
        scroll={{ x: 1100 }}
      />

      {!listResult?.summary && !readOnly ? (
        <div style={{ marginTop: 16 }}>
          <Button type="primary" onClick={openCreate}>
            添加行程段
          </Button>
        </div>
      ) : null}

      <SegmentDrawer
        open={drawerOpen}
        departure={departure}
        editing={editingSegment}
        readOnly={readOnly || viewOnly}
        loading={saveMutation.isPending}
        form={form}
        onClose={() => {
          setDrawerOpen(false)
          setEditingSegment(null)
          setViewOnly(false)
        }}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}
