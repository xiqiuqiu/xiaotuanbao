import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Spin,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import dayjs from 'dayjs'
import type {
  DepartureDetail,
  ItinerarySegmentListResult,
  ItinerarySegmentSummary,
} from '@/types/api'
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
import { segmentPayableGenerationGap } from '../utils/segment-payable-generation-gap'
import { ExecutionResourcePane } from './ExecutionResourcePane'
import { SegmentDrawer } from './SegmentDrawer'
import styles from './ExecutionTab.module.css'

interface ExecutionTabProps {
  departure: DepartureDetail
  segmentId?: string
  readOnly: boolean
  amountReadOnly?: boolean
}

function formatNavDateRange(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (!startDate || !endDate) {
    return null
  }

  const start = dayjs(startDate).format('MM-DD')
  const end = dayjs(endDate).format('MM-DD')
  return `${start}–${end}`
}

function sortSegmentsBySortOrder(
  segments: ItinerarySegmentSummary[],
): ItinerarySegmentSummary[] {
  return [...segments].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function ExecutionTab({
  departure,
  segmentId,
  readOnly,
  amountReadOnly = false,
}: ExecutionTabProps) {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const search = useSearch({ strict: false })
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingSegment, setEditingSegment] = useState<ItinerarySegmentSummary | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const segmentListRef = useRef<HTMLDivElement>(null)
  const mutationLocked = readOnly || amountReadOnly

  const { data: listResult, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['segments', departure.id],
    queryFn: () => listSegments(departure.id),
  })

  const segments = sortSegmentsBySortOrder(listResult?.items ?? [])
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

  useLayoutEffect(() => {
    const el = workspaceRef.current
    if (!el) {
      return
    }

    const syncHeight = () => {
      const top = el.getBoundingClientRect().top
      // Match AppLayout content bottom margin (16).
      const next = Math.max(360, Math.floor(window.innerHeight - top - 16))
      el.style.height = `${next}px`
    }

    syncHeight()
    window.addEventListener('resize', syncHeight)
    return () => window.removeEventListener('resize', syncHeight)
  }, [isLoading, isError, listResult])

  useEffect(() => {
    // Only canonicalize segmentId while execution owns the URL. Otherwise a
    // still-mounted pane (destroyOnHidden lag) can yank "查看应付" back here
    // after search drops segmentId.
    if (search.tab !== 'execution') {
      return
    }
    if (isLoading || isError || selectedSegmentId === segmentId) {
      return
    }
    // After create, URL already has the new id while the list query may still
    // be stale/refetching. Falling back to the first segment here would undo
    // the intentional selection — wait until fetch settles.
    if (
      segmentId &&
      isFetching &&
      !segments.some((segment) => segment.id === segmentId)
    ) {
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
  }, [
    departure.id,
    isError,
    isFetching,
    isLoading,
    navigate,
    search.tab,
    segmentId,
    segments,
    selectedSegmentId,
  ])

  useEffect(() => {
    if (!selectedSegmentId || !segmentListRef.current) {
      return
    }
    const selectedNode = segmentListRef.current.querySelector(
      `[data-segment-id="${selectedSegmentId}"]`,
    )
    if (
      selectedNode instanceof HTMLElement &&
      typeof selectedNode.scrollIntoView === 'function'
    ) {
      selectedNode.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [selectedSegmentId, segments.length])

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
        // Seed the list cache before URL sync so resolveSelectedSegmentId does
        // not treat the new id as missing and fall back to the first segment.
        queryClient.setQueryData(
          ['segments', departure.id],
          (prev: ItinerarySegmentListResult | undefined) => {
            if (!prev) {
              return prev
            }
            if (prev.items.some((item) => item.id === saved.id)) {
              return prev
            }
            return {
              ...prev,
              items: [...prev.items, saved],
              total: prev.total + 1,
              summary: prev.summary
                ? {
                    ...prev.summary,
                    segmentCount: prev.summary.segmentCount + 1,
                  }
                : prev.summary,
            }
          },
        )
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
        title="行程段加载失败"
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
    <div className={styles.workspace} ref={workspaceRef}>
      <Row className={styles.panes} gutter={16} wrap={false} align="stretch">
        <Col
          className={`${styles.paneCol} ${styles.segmentPaneCol}`}
          flex="280px"
          style={{ maxWidth: 280 }}
        >
          <Card
            className={styles.paneCard}
            classNames={{ body: styles.paneCardBody }}
            title="行程段"
            styles={{ body: { padding: 12 } }}
          >
            <div className={styles.segmentPane} style={segmentTokenStyle}>
              <div ref={segmentListRef} className={styles.segmentList}>
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
                {!mutationLocked ? (
                  <>
                    <div className={styles.segmentListGrow} aria-hidden />
                    <div className={styles.segmentListFooter}>
                      <Button
                        block
                        icon={<PlusOutlined />}
                        aria-label="添加"
                        onClick={openCreate}
                      >
                        添加
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        </Col>

        <Col
          className={`${styles.paneCol} ${styles.resourcePaneCol}`}
          flex="auto"
          style={{ minWidth: 0 }}
        >
          <Card
            className={styles.paneCard}
            classNames={{ body: styles.paneCardBody }}
          >
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
  const { token } = theme.useToken()
  const dateRange = formatNavDateRange(segment.startDate, segment.endDate)
  const meta = dateRange
  const gap = segmentPayableGenerationGap(
    segment.payableGeneratedCount,
    segment.resourceCount,
  )

  return (
    <div
      role="button"
      tabIndex={0}
      data-segment-id={segment.id}
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
      {meta ? <span className={styles.segmentItemMeta}>{meta}</span> : null}
      <div className={styles.segmentItemOverviewRow}>
        <span className={styles.segmentItemOverview}>
          {formatResourceOverview(segment)}
        </span>
        {gap.hasGap ? (
          <Tooltip title={`本段还有 ${gap.ungenerated} 项资源未生成应付`}>
            <span
              className={styles.segmentPayableGap}
              aria-label={`生成 ${gap.generated}/${gap.total}`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <span
                className={styles.segmentPayableRing}
                style={
                  {
                    '--ring-progress': `${gap.percent}%`,
                    '--ring-color': token.colorPrimary,
                    '--ring-track': token.colorFillSecondary,
                  } as CSSProperties
                }
                aria-hidden
              />
              <span aria-hidden>
                生成 {gap.generated}/{gap.total}
              </span>
            </span>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}
