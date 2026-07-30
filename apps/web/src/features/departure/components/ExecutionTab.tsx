import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Row,
  Spin,
  message,
  theme,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { DepartureStatus } from '@xiaotuanbao/shared'
import type {
  DepartureDetail,
  GenerateDailySegmentsMode,
  GenerateDailySegmentsResult,
  ItinerarySegmentListResult,
  ItinerarySegmentSummary,
} from '@/types/api'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import {
  createSegment,
  deleteSegment,
  generateDailySegments,
  listSegments,
  updateSegment,
} from '@/services/segment.service'
import { listSegmentResources } from '@/services/segment-resource.service'
import { listDepartureResources } from '@/services/departure-resource.service'
import {
  resolveAdjacentSegmentId,
  resolveSelectedSegmentId,
} from '../utils/execution-segment-selection'
import { summarizeExecutionCostStrip } from '../utils/execution-cost-strip-summary'
import { formValuesToPayload } from '../utils/segment-form'
import { ExecutionCostStrip } from './ExecutionCostStrip'
import { ExecutionResourcePane } from './ExecutionResourcePane'
import { DepartureResourcePane } from './DepartureResourcePane'
import { ExecutionSegmentListPane } from './ExecutionSegmentListPane'
import { SegmentDrawer } from './SegmentDrawer'
import styles from './ExecutionTab.module.css'

interface ExecutionTabProps {
  departure: DepartureDetail
  segmentId?: string
  highlightDepartureResourceId?: string
  /** 结构性只读（发团已关闭）；同时封锁编辑与生成。 */
  readOnly: boolean
  /** 是否持有 `departure:write`；财务无，仅封锁编辑，不影响生成应付。 */
  canEdit: boolean
  amountReadOnly?: boolean
}

function sortSegmentsBySortOrder(
  segments: ItinerarySegmentSummary[],
): ItinerarySegmentSummary[] {
  return [...segments].sort((a, b) => a.sortOrder - b.sortOrder)
}

interface ExecutionWorkspaceProps {
  departure: DepartureDetail
  segments: ItinerarySegmentSummary[]
  selectedSegmentId?: string
  selectedSegment: ItinerarySegmentSummary | null
  mutationLocked: boolean
  generatingDaily: boolean
  readOnly: boolean
  canEdit: boolean
  amountReadOnly: boolean
  highlightDepartureResourceId?: string
  onSelect: (segmentId: string) => void
  onEdit: (segment: ItinerarySegmentSummary) => void
  onCreate: () => void
  onGenerateDaily: () => void
  onRebuildEmpty: () => void
}

function ExecutionWorkspace({
  departure,
  segments,
  selectedSegmentId,
  selectedSegment,
  mutationLocked,
  generatingDaily,
  readOnly,
  canEdit,
  amountReadOnly,
  highlightDepartureResourceId,
  onSelect,
  onEdit,
  onCreate,
  onGenerateDaily,
  onRebuildEmpty,
}: ExecutionWorkspaceProps) {
  const { token } = theme.useToken()
  const { data: departureResourceList } = useQuery({
    queryKey: ['departure-resources', departure.id],
    queryFn: ({ signal }) => listDepartureResources(departure.id, {}, signal),
  })

  const segmentResourceQueries = useQueries({
    queries: segments.map((segment) => ({
      queryKey: ['segment-resources', segment.id] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        listSegmentResources(segment.id, {}, signal),
      ...operationalQueryOptions(),
    })),
  })

  const costStripSummary = summarizeExecutionCostStrip(
    departureResourceList?.items ?? [],
    segmentResourceQueries.flatMap((query) => query.data?.items ?? []),
    { departureSettled: departure.status === DepartureStatus.SETTLED },
  )
  const costStripReady =
    departureResourceList !== undefined &&
    (segments.length === 0 ||
      segmentResourceQueries.every((query) => !query.isPending))

  const stackTokenStyle = {
    '--execution-border': token.colorBorderSecondary,
    '--execution-fill-hover': token.colorFillQuaternary,
    '--execution-item-bg': token.colorBgContainer,
    '--execution-text': token.colorText,
    '--execution-text-secondary': token.colorTextSecondary,
    '--execution-text-tertiary': token.colorTextTertiary,
    '--execution-warning': token.colorWarning,
  } as CSSProperties

  return (
    <div className={styles.stackLayout} style={stackTokenStyle}>
      {costStripReady ? <ExecutionCostStrip summary={costStripSummary} /> : null}

      <DepartureResourcePane
        departure={departure}
        readOnly={readOnly}
        canEdit={canEdit}
        amountReadOnly={amountReadOnly}
        highlightDepartureResourceId={highlightDepartureResourceId}
      />

      <Row className={styles.panes} gutter={16} wrap={false} align="stretch">
        <ExecutionSegmentListPane
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          mutationLocked={mutationLocked}
          generatingDaily={generatingDaily}
          onSelect={onSelect}
          onEdit={onEdit}
          onCreate={onCreate}
          onGenerateDaily={onGenerateDaily}
          onRebuildEmpty={onRebuildEmpty}
        />

        <Col
          className={`${styles.paneCol} ${styles.resourcePaneCol}`}
          flex="auto"
          style={{ minWidth: 0 }}
        >
          <Card className={styles.paneCard} classNames={{ body: styles.paneCardBody }}>
            {segments.length === 0 ? (
              <Empty
                description="可按出团～回团一键生成一日一段骨架，或手工添加"
                style={{ padding: '48px 0' }}
              >
                {!mutationLocked ? (
                  <div className={styles.emptyActions}>
                    <Button
                      type="primary"
                      loading={generatingDaily}
                      onClick={onGenerateDaily}
                    >
                      一键生成一日段
                    </Button>
                    <Button icon={<PlusOutlined />} onClick={onCreate}>
                      添加行程段
                    </Button>
                  </div>
                ) : null}
              </Empty>
            ) : selectedSegment ? (
              <div key={selectedSegment.id} className={styles.resourcePaneEnter}>
                <ExecutionResourcePane
                  departure={departure}
                  segment={selectedSegment}
                  readOnly={readOnly}
                  canEdit={canEdit}
                  amountReadOnly={amountReadOnly}
                />
              </div>
            ) : null}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export function ExecutionTab({
  departure,
  segmentId,
  highlightDepartureResourceId,
  readOnly,
  canEdit,
  amountReadOnly = false,
}: ExecutionTabProps) {
  const navigate = useNavigate()
  const search = useSearch({ strict: false })
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingSegment, setEditingSegment] = useState<ItinerarySegmentSummary | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  // 行程段增删改属 departure:write：财务（无 canEdit）只读，但资源生成应付不受此限。
  const mutationLocked = readOnly || amountReadOnly || !canEdit

  const { data: listResult, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['segments', departure.id],
    queryFn: () => listSegments(departure.id),
    ...operationalQueryOptions(),
  })

  const segments = sortSegmentsBySortOrder(listResult?.items ?? [])
  const selectedSegmentId = resolveSelectedSegmentId(segments, segmentId)
  const selectedSegment =
    segments.find((segment) => segment.id === selectedSegmentId) ?? null

  useEffect(() => {
    if (!selectedSegmentId) {
      return
    }
    void queryClient.prefetchQuery({
      queryKey: ['segment-resources', selectedSegmentId],
      queryFn: ({ signal }) => listSegmentResources(selectedSegmentId, {}, signal),
    })
  }, [queryClient, selectedSegmentId])

  const listReturn =
    typeof search.listReturn === 'string' && search.listReturn
      ? search.listReturn
      : undefined

  const navigateExecution = (nextSegmentId?: string, replace = false) => {
    void navigate({
      to: '/departure/$departureId',
      params: { departureId: departure.id },
      search: {
        tab: 'execution',
        ...(nextSegmentId ? { segmentId: nextSegmentId } : {}),
        ...(listReturn ? { listReturn } : {}),
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
        ...(listReturn ? { listReturn } : {}),
      },
      replace: true,
    })
  }, [
    departure.id,
    isError,
    listReturn,
    isFetching,
    isLoading,
    navigate,
    search.tab,
    segmentId,
    segments,
    selectedSegmentId,
  ])

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
    setEditingSegment(() => segment)
    setDrawerOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof formValuesToPayload>) => {
      const editingId = editingSegment?.id ?? null
      const saved = editingId
        ? await updateSegment(editingId, payload)
        : await createSegment(departure.id, payload)
      return { saved, editingId }
    },
    onSuccess: ({ saved, editingId }) => {
      if (editingId) {
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
      invalidateSegments()
      // Drawer context may have changed while save was in flight — don't close/navigate away.
      if ((editingSegment?.id ?? null) !== editingId) {
        return
      }
      closeDrawer()
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

  const generateDailyMutation = useMutation({
    mutationFn: (mode: GenerateDailySegmentsMode) =>
      generateDailySegments(departure.id, { mode }),
    onSuccess: (result: GenerateDailySegmentsResult) => {
      if (result.mode === 'rebuild_empty') {
        message.success(
          `已重建空段：新增 ${result.createdCount} 段，清除无资源空段 ${result.removedCount} 个`,
        )
      } else if (result.createdCount > 0) {
        message.success(`已按出团～回团生成 ${result.createdCount} 个一日行程段`)
      } else {
        message.info('出团～回团各日均已有行程段覆盖，未新增；若要重铺空段请用「重建空段」')
      }
      if (result.preservedWithResources > 0) {
        message.info(`已保留 ${result.preservedWithResources} 个含资源的行程段`)
      }
      invalidateSegments()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '生成每日行程段失败')
    },
  })

  const handleGenerateDaily = () => {
    generateDailyMutation.mutate('fill_missing')
  }

  const handleRebuildEmpty = () => {
    Modal.confirm({
      title: '重建无资源空段？',
      content:
        '将删除本团全部无资源的行程段，再按出团日～回团日补齐一日一段骨架。已有资源的行程段不会被删除或覆盖。',
      okText: '重建空段',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => generateDailyMutation.mutateAsync('rebuild_empty'),
    })
  }

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

  return (
    <div className={styles.workspace} ref={workspaceRef}>
      <ExecutionWorkspace
        departure={departure}
        segments={segments}
        selectedSegmentId={selectedSegmentId}
        selectedSegment={selectedSegment}
        mutationLocked={mutationLocked}
        generatingDaily={generateDailyMutation.isPending}
        readOnly={readOnly}
        canEdit={canEdit}
        amountReadOnly={amountReadOnly}
        highlightDepartureResourceId={highlightDepartureResourceId}
        onSelect={(id) => navigateExecution(id)}
        onEdit={openEdit}
        onCreate={openCreate}
        onGenerateDaily={handleGenerateDaily}
        onRebuildEmpty={handleRebuildEmpty}
      />

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
