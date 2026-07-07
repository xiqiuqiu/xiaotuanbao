import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ResourceKind,
  SegmentPayableStatus,
} from '@xiaotuanbao/shared'
import type { DepartureDetail, ItinerarySegmentSummary, SegmentResourceSummary } from '@/types/api'
import { getSegment } from '@/services/segment.service'
import {
  createSegmentResource,
  deleteSegmentResource,
  generatePayable,
  listSegmentResources,
  updateSegmentResource,
} from '@/services/segment-resource.service'
import {
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_OPTIONS,
  SEGMENT_PAYABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { formatSegmentDateRange } from '../utils/segment-form'
import { ResourceDrawer } from './ResourceDrawer'
import { formValuesToPayload, type ResourceFormValues } from '../utils/resource-form'

interface ResourcesTabProps {
  departure: DepartureDetail
  segmentId?: string
  readOnly: boolean
  amountReadOnly?: boolean
}

export function ResourcesTab({ departure, segmentId, readOnly, amountReadOnly = false }: ResourcesTabProps) {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ResourceFormValues>()
  const [resourceKindFilter, setResourceKindFilter] = useState<ResourceKind>()
  const [payableStatusFilter, setPayableStatusFilter] = useState<SegmentPayableStatus>()
  const [keyword, setKeyword] = useState('')
  const [appliedFilters, setAppliedFilters] = useState({
    resourceKind: undefined as ResourceKind | undefined,
    payableStatus: undefined as SegmentPayableStatus | undefined,
    keyword: '',
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<SegmentResourceSummary | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

  const { data: segment, isLoading: segmentLoading } = useQuery({
    queryKey: ['segment', segmentId],
    queryFn: () => getSegment(segmentId!),
    enabled: Boolean(segmentId),
  })

  const { data: listResult, isLoading: resourcesLoading } = useQuery({
    queryKey: ['segment-resources', segmentId, appliedFilters],
    queryFn: () =>
      listSegmentResources(segmentId!, {
        resourceKind: appliedFilters.resourceKind,
        payableStatus: appliedFilters.payableStatus,
        keyword: appliedFilters.keyword || undefined,
      }),
    enabled: Boolean(segmentId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['segment-resources', segmentId] })
    queryClient.invalidateQueries({ queryKey: ['segments', departure.id] })
    queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formValuesToPayload>) => {
      if (editingResource) {
        return updateSegmentResource(editingResource.id, payload)
      }
      return createSegmentResource(segmentId!, payload)
    },
    onSuccess: () => {
      message.success(editingResource ? '资源已更新' : '资源已添加')
      setDrawerOpen(false)
      setEditingResource(null)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSegmentResource(id),
    onSuccess: () => {
      message.success('资源已删除')
      invalidate()
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
      invalidate()
    },
  })

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

  const applyFilters = () => {
    setAppliedFilters({
      resourceKind: resourceKindFilter,
      payableStatus: payableStatusFilter,
      keyword: keyword.trim(),
    })
  }

  const resetFilters = () => {
    setResourceKindFilter(undefined)
    setPayableStatusFilter(undefined)
    setKeyword('')
    setAppliedFilters({
      resourceKind: undefined,
      payableStatus: undefined,
      keyword: '',
    })
  }

  const columns: ColumnsType<SegmentResourceSummary> = useMemo(
    () => [
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
              {record.amountFieldsLocked ? '查看' : '编辑'}
            </Button>
            {!readOnly && !record.hasPaymentSchedule ? (
              <Button
                type="link"
                size="small"
                onClick={() => generateMutation.mutate(record.id)}
                loading={generateMutation.isPending}
              >
                生成应付
              </Button>
            ) : null}
            {!readOnly && record.hasPaymentSchedule && !record.amountFieldsLocked ? (
              <Button
                type="link"
                size="small"
                onClick={() => generateMutation.mutate(record.id)}
                loading={generateMutation.isPending}
              >
                重新生成
              </Button>
            ) : null}
            {!readOnly && !record.hasPaymentSchedule ? (
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
    ],
    [deleteMutation, generateMutation, readOnly],
  )

  if (!segmentId) {
    return (
      <Alert
        type="info"
        showIcon
        message="请从行程段列表进入资源安排"
        description={
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            资源安排需锁定行程段上下文。请前往{' '}
            <Link
              to="/departure/$departureId"
              params={{ departureId: departure.id }}
              search={{ tab: 'segments' }}
            >
              行程段
            </Link>{' '}
            Tab，点击「资源安排」进入。
          </Typography.Paragraph>
        }
      />
    )
  }

  return (
    <div>
      {segment ? (
        <Alert
          type="info"
          showIcon
          message={
            <span>
              当前行程段：<strong>{segment.name}</strong>｜
              {formatSegmentDateRange(segment.startDate, segment.endDate)}｜适用人数：
              {segment.applicableGuestCount}人
            </span>
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="资源种类"
          style={{ width: 120 }}
          value={resourceKindFilter}
          onChange={setResourceKindFilter}
          options={RESOURCE_KIND_OPTIONS.map((item) => ({
            value: item.value,
            label: item.label,
          }))}
        />
        <Select
          allowClear
          placeholder="应付状态"
          style={{ width: 120 }}
          value={payableStatusFilter}
          onChange={setPayableStatusFilter}
          options={Object.entries(SEGMENT_PAYABLE_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Input
          allowClear
          placeholder="搜索名称、对手方、备注"
          style={{ width: 200 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={applyFilters}
        />
        <Button onClick={applyFilters}>查询</Button>
        <Button onClick={resetFilters}>重置</Button>
        {!readOnly ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            添加资源
          </Button>
        ) : null}
      </Space>

      <Table
        rowKey="id"
        loading={segmentLoading || resourcesLoading}
        columns={columns}
        dataSource={listResult?.items ?? []}
        pagination={false}
        scroll={{ x: 1000 }}
      />

      <ResourceDrawer
        open={drawerOpen}
        segment={segment as ItinerarySegmentSummary | undefined}
        editing={editingResource}
        readOnly={readOnly || viewOnly}
        amountReadOnly={amountReadOnly}
        loading={saveMutation.isPending}
        form={form}
        onClose={() => {
          setDrawerOpen(false)
          setEditingResource(null)
          setViewOnly(false)
        }}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}
