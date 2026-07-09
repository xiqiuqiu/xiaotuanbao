import { useEffect, useState } from 'react'
import { Button, Empty, Spin, Tag, Typography, message, theme } from 'antd'
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

  const { data: listResult, isLoading } = useQuery({
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
    if (isLoading || selectedSegmentId === segmentId) {
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
  }, [departure.id, isLoading, navigate, segmentId, selectedSegmentId])

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
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
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

          <div style={{ flex: 1, overflow: 'auto' }}>
            {segments.length === 0 ? (
              <Typography.Paragraph type="secondary" style={{ margin: 16, marginBottom: 0 }}>
                暂无行程段
              </Typography.Paragraph>
            ) : (
              segments.map((segment) => (
                <SegmentNavItem
                  key={segment.id}
                  segment={segment}
                  selected={segment.id === selectedSegmentId}
                  showEdit={!mutationLocked}
                  onSelect={() => navigateExecution(segment.id)}
                  onEdit={() => openEdit(segment)}
                />
              ))
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 4,
        borderLeft: selected
          ? `2px solid ${token.colorPrimary}`
          : '2px solid transparent',
        background: selected ? token.colorPrimaryBg : 'transparent',
        paddingRight: 8,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'block',
          textAlign: 'left',
          border: 'none',
          background: 'transparent',
          padding: '12px 8px 12px 16px',
          cursor: 'pointer',
        }}
      >
        <Typography.Text strong style={{ display: 'block' }}>
          {segment.name}
          {segment.fromTemplate ? (
            <>
              {' '}
              <Tag style={{ marginInlineEnd: 0 }}>模板</Tag>
            </>
          ) : null}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
          {formatNavDateRange(segment.startDate, segment.endDate, segment.dayCount)}
        </Typography.Text>
        {segment.destination ? (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
            {segment.destination}
          </Typography.Text>
        ) : null}
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
          {formatResourceOverview(segment)}
        </Typography.Text>
      </button>
      {showEdit ? (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          aria-label={`编辑${segment.name}`}
          onClick={onEdit}
          style={{ marginTop: 8 }}
        />
      ) : null}
    </div>
  )
}
