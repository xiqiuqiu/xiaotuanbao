import { useEffect, useState } from 'react'
import { Button, Empty, Spin, Tag, Typography, message, theme } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import { createSegment, listSegments } from '@/services/segment.service'
import { listSegmentResources } from '@/services/segment-resource.service'
import { resolveSelectedSegmentId } from '../utils/execution-segment-selection'
import {
  formatResourceOverview,
  formValuesToPayload,
} from '../utils/segment-form'
import { RESOURCE_KIND_LABELS, catalogLabel, formatCents } from '../catalog'
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

  const { data: resourceList, isLoading: resourcesLoading } = useQuery({
    queryKey: ['segment-resources', selectedSegmentId],
    queryFn: () => listSegmentResources(selectedSegmentId!),
    enabled: Boolean(selectedSegmentId),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formValuesToPayload>) =>
      createSegment(departure.id, payload),
    onSuccess: (created) => {
      message.success('行程段已添加')
      setDrawerOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['segments', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
      navigateExecution(created.id)
    },
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }

  const resources = resourceList?.items ?? []

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
                onClick={() => setDrawerOpen(true)}
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
                  onSelect={() => navigateExecution(segment.id)}
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
                  onClick={() => setDrawerOpen(true)}
                >
                  添加行程段
                </Button>
              ) : null}
            </Empty>
          ) : selectedSegment && resourcesLoading ? (
            <div>
              <ResourcePaneHeader segment={selectedSegment} />
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <Spin />
              </div>
            </div>
          ) : selectedSegment && resources.length === 0 ? (
            <div>
              <ResourcePaneHeader segment={selectedSegment} resourceCount={0} />
              <Empty description="本段暂无资源" style={{ padding: '48px 0' }} />
            </div>
          ) : selectedSegment ? (
            <div>
              <ResourcePaneHeader
                segment={selectedSegment}
                resourceCount={resources.length}
              />
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {resources.map((resource) => (
                  <li key={resource.id}>
                    <Typography.Text>
                      {catalogLabel(RESOURCE_KIND_LABELS, resource.resourceKind)}
                      {' · '}
                      {resource.title}
                      {resource.amountCents > 0 ? ` · ${formatCents(resource.amountCents)}` : null}
                    </Typography.Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </main>
      </div>

      <SegmentDrawer
        open={drawerOpen}
        departure={departure}
        editing={null}
        readOnly={mutationLocked}
        loading={saveMutation.isPending}
        onClose={() => setDrawerOpen(false)}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}

function ResourcePaneHeader({
  segment,
  resourceCount,
}: {
  segment: ItinerarySegmentSummary
  resourceCount?: number
}) {
  const count = resourceCount ?? segment.resourceCount

  return (
    <div style={{ marginBottom: 16 }}>
      <Typography.Text strong>资源安排</Typography.Text>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
        {segment.name} · 适用 {segment.applicableGuestCount} 人 · {count} 项
      </Typography.Paragraph>
    </div>
  )
}

function SegmentNavItem({
  segment,
  selected,
  onSelect,
}: {
  segment: ItinerarySegmentSummary
  selected: boolean
  onSelect: () => void
}) {
  const { token } = theme.useToken()

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        borderLeft: selected
          ? `2px solid ${token.colorPrimary}`
          : '2px solid transparent',
        background: selected ? token.colorPrimaryBg : 'transparent',
        padding: '12px 16px',
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
  )
}
