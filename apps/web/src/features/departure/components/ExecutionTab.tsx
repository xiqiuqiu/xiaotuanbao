import { useEffect, useState, type CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Spin,
  Tag,
  Typography,
  message,
  theme,
} from 'antd'
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
import styles from './ExecutionTab.module.css'

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

  const segmentTokenStyle = {
    '--execution-border': token.colorBorderSecondary,
    '--execution-fill-hover': token.colorFillTertiary,
    '--execution-primary-bg': token.colorPrimaryBg,
    '--execution-primary-border': token.colorPrimaryBorder,
            '--execution-item-bg': token.colorBgContainer,
            '--execution-item-border': token.colorBorderSecondary,
    '--execution-radius': `${token.borderRadiusLG}px`,
    '--execution-font-sm': `${token.fontSizeSM}px`,
    '--execution-font-strong': String(token.fontWeightStrong),
    '--execution-text': token.colorText,
    '--execution-text-secondary': token.colorTextSecondary,
    '--execution-text-tertiary': token.colorTextTertiary,
  } as CSSProperties

  return (
    <div>
      {listResult?.summary ? <ExecutionSummaryBar summary={listResult.summary} /> : null}

      <Row gutter={16} wrap={false} align="stretch">
        <Col flex="280px" style={{ maxWidth: 280 }}>
          <Card
            title="行程段"
            extra={
              !mutationLocked ? (
                <Button
                  type="link"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={openCreate}
                >
                  添加
                </Button>
              ) : null
            }
            styles={{ body: { padding: 12 } }}
            style={{ height: '100%', minHeight: 360 }}
          >
            <div className={styles.segmentList} style={segmentTokenStyle}>
              {segments.length === 0 ? (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
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
          </Card>
        </Col>

        <Col flex="auto" style={{ minWidth: 0 }}>
          <Card style={{ height: '100%', minHeight: 360 }}>
            {segments.length === 0 ? (
              <Empty description="请先添加行程段" style={{ padding: '48px 0' }}>
                {!mutationLocked ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
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
          </Card>
        </Col>
      </Row>

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
  const dateRange = formatNavDateRange(segment.startDate, segment.endDate, segment.dayCount)
  const meta = [dateRange, segment.destination].filter(Boolean).join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.segmentItem}${selected ? ` ${styles.segmentItemSelected}` : ''}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <div className={styles.segmentItemHeader}>
        <div className={styles.segmentItemTitle}>
          <span>{segment.name}</span>
          {segment.fromTemplate ? <Tag style={{ marginInlineEnd: 0 }}>模板</Tag> : null}
        </div>
        {showEdit ? (
          <Button
            type="text"
            size="small"
            className={styles.segmentItemEdit}
            icon={<EditOutlined />}
            aria-label={`编辑${segment.name}`}
            onClick={(event) => {
              event.stopPropagation()
              onEdit()
            }}
          />
        ) : null}
      </div>
      <span className={styles.segmentItemMeta}>{meta}</span>
      <span className={styles.segmentItemOverview}>{formatResourceOverview(segment)}</span>
    </div>
  )
}
