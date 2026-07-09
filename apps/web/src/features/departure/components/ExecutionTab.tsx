import { useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Space, Spin, Tag, Typography, message, theme } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import {
  createSegment,
  deleteSegment,
  listSegments,
  updateSegment,
} from '@/services/segment.service'
import {
  resolveAdjacentSegmentId,
  resolveSelectedSegmentId,
} from '../utils/execution-segment-selection'
import {
  formatResourceOverview,
  formValuesToPayload,
} from '../utils/segment-form'
import { ExecutionResourcePane } from './ExecutionResourcePane'
import { ExecutionSummaryBar } from './ExecutionSummaryBar'
import { SegmentDrawer } from './SegmentDrawer'

interface ExecutionTabProps {
  departure: DepartureDetail
  segmentId?: string
  readOnly: boolean
  amountReadOnly?: boolean
}

function formatNavDateRange(startDate: string, endDate: string, dayCount: number): string {
  const start = dayjs(startDate).format('MM-DD')
  const end = dayjs(endDate).format('MM-DD')
  return `${start}–${end} · ${dayCount}天`
}

function sortSegmentsByStartDate(
  segments: ItinerarySegmentSummary[],
): ItinerarySegmentSummary[] {
  return [...segments].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export function ExecutionTab({
  departure,
  segmentId,
  readOnly,
  amountReadOnly = false,
}: ExecutionTabProps) {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingSegment, setEditingSegment] = useState<ItinerarySegmentSummary | null>(null)
  const mutationLocked = readOnly || amountReadOnly

  const { data: listResult, isLoading, isError, refetch } = useQuery({
    queryKey: ['segments', departure.id],
    queryFn: () => listSegments(departure.id),
  })

  const segments = sortSegmentsByStartDate(listResult?.items ?? [])
  const selectedSegmentId = resolveSelectedSegmentId(segments, segmentId)
  const selectedSegment =
    segments.find((segment) => segment.id === selectedSegmentId) ?? null

  const navigateExecution = (nextSegmentId?: string, replace = false) => {
    void navigate({
      to: '/departure/$departureId',
      params: { departureId: departure.id },
      search: {
        tab: 'execution',
        ...(nextSegmentId ? { segmentId: nextSegmentId } : {}),
      },
      replace,
    })
  }

  useEffect(() => {
    if (isLoading || isError || selectedSegmentId === segmentId) {
      return
    }

    void navigate({
      to: '/departure/$departureId',
      params: { departureId: departure.id },
      search: {
        tab: 'execution',
        ...(selectedSegmentId ? { segmentId: selectedSegmentId } : {}),
      },
      replace: true,
    })
  }, [departure.id, isError, isLoading, navigate, segmentId, selectedSegmentId])

  const invalidateSegments = () => {
    void queryClient.invalidateQueries({ queryKey: ['segments', departure.id] })
    void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditingSegment(null)
  }

  const openCreate = () => {
    setEditingSegment(null)
    setDrawerOpen(true)
  }

  const openEdit = (segment: ItinerarySegmentSummary) => {
    setEditingSegment(segment)
    setDrawerOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formValuesToPayload>) => {
      if (editingSegment) {
        return updateSegment(editingSegment.id, payload)
      }
      return createSegment(departure.id, payload)
    },
    onSuccess: (saved) => {
      if (editingSegment) {
        message.success('行程段已更新')
      } else {
        message.success('行程段已添加')
        message.info('请在本段「资源安排」中添加用车、酒店、拼出等资源')
      }
      closeDrawer()
      invalidateSegments()
      navigateExecution(saved.id)
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存行程段失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSegment(id),
    onSuccess: (_result, deletedId) => {
      const nextSegmentId = resolveAdjacentSegmentId(segments, deletedId)
      message.success('行程段已删除')
      closeDrawer()
      invalidateSegments()
      navigateExecution(nextSegmentId)
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除行程段失败')
    },
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="行程段加载失败"
        description="请稍后重试，或检查网络后再次加载。"
        action={
          <Button size="small" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    )
  }

  return (
    <div>
      {listResult?.summary ? <ExecutionSummaryBar summary={listResult.summary} /> : null}

      <div
        style={{
          display: 'flex',
          minHeight: 360,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          overflow: 'hidden',
        }}
      >
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <Typography.Text strong>行程段</Typography.Text>
            {!mutationLocked ? (
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={openCreate}
              >
                添加
              </Button>
            ) : null}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {segments.length === 0 ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                暂无行程段
              </Typography.Paragraph>
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {segments.map((segment) => (
                  <SegmentNavItem
                    key={segment.id}
                    segment={segment}
                    selected={segment.id === selectedSegmentId}
                    showEdit={!mutationLocked}
                    onSelect={() => navigateExecution(segment.id)}
                    onEdit={() => openEdit(segment)}
                  />
                ))}
              </Space>
            )}
          </div>
        </aside>

        <main style={{ flex: 1, padding: 16, minWidth: 0 }}>
          {segments.length === 0 ? (
            <Empty description="请先添加行程段" style={{ padding: '48px 0' }}>
              {!mutationLocked ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreate}
                >
                  添加行程段
                </Button>
              ) : null}
            </Empty>
          ) : selectedSegment ? (
            <ExecutionResourcePane
              departure={departure}
              segment={selectedSegment}
              readOnly={readOnly}
              amountReadOnly={amountReadOnly}
            />
          ) : null}
        </main>
      </div>

      <SegmentDrawer
        open={drawerOpen}
        departure={departure}
        editing={editingSegment}
        readOnly={mutationLocked}
        loading={saveMutation.isPending}
        deleting={deleteMutation.isPending}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
        onDelete={
          editingSegment
            ? () => deleteMutation.mutate(editingSegment.id)
            : undefined
        }
      />
    </div>
  )
}

function SegmentNavItem({
  segment,
  selected,
  showEdit,
  onSelect,
  onEdit,
}: {
  segment: ItinerarySegmentSummary
  selected: boolean
  showEdit: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const { token } = theme.useToken()
  const dateRange = formatNavDateRange(segment.startDate, segment.endDate, segment.dayCount)
  const description = [dateRange, segment.destination].filter(Boolean).join(' · ')

  return (
    <Card
      size="small"
      hoverable
      onClick={onSelect}
      style={{
        borderColor: selected ? token.colorPrimary : undefined,
        background: selected ? token.colorPrimaryBg : undefined,
      }}
      title={
        <Space size={4} wrap>
          <span>{segment.name}</span>
          {segment.fromTemplate ? <Tag style={{ marginInlineEnd: 0 }}>模板</Tag> : null}
        </Space>
      }
      extra={
        showEdit ? (
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label={`编辑${segment.name}`}
            onClick={(event) => {
              event.stopPropagation()
              onEdit()
            }}
          />
        ) : null
      }
    >
      <Card.Meta
        description={
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text type="secondary">{description}</Typography.Text>
            <Typography.Text type="secondary">
              {formatResourceOverview(segment)}
            </Typography.Text>
          </Space>
        }
      />
    </Card>
  )
}
