import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Spin,
  message,
  theme,
} from 'antd'
import { AppstoreOutlined, CalendarOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { DepartureStatus } from '@xiaotuanbao/shared'
import type {
  DepartureDetail,
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
import { summarizeSegmentResourceAmounts } from '../utils/segment-resource-amount-summary'
import { formValuesToPayload } from '../utils/segment-form'
import { ExecutionDayAxis } from './ExecutionDayAxis'
import { ExecutionResourcePane } from './ExecutionResourcePane'
import { DepartureResourcePane } from './DepartureResourcePane'
import { SegmentDrawer } from './SegmentDrawer'
import styles from './ExecutionTab.module.css'

type ExecutionLayer = 'day' | 'departure'

interface ExecutionTabProps {
  departure: DepartureDetail
  segmentId?: string
  highlightDepartureResourceId?: string
  /** 结构性只读（发团已关闭）；同时封锁编辑与生成。 */
  readOnly: boolean
  /** 是否持有 `departure:write`；财务无，仅封锁编辑，不影响提交应付。 */
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
  onDelete: (segment: ItinerarySegmentSummary) => void
  onGenerateDaily: () => void
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
  onDelete,
  onGenerateDaily,
}: ExecutionWorkspaceProps) {
  const { token } = theme.useToken()
  const [selectedLayer, setSelectedLayer] = useState<ExecutionLayer>(() =>
    highlightDepartureResourceId ? 'departure' : 'day',
  )
  const layer = highlightDepartureResourceId ? 'departure' : selectedLayer

  const { data: departureResourceList } = useQuery({
    queryKey: ['departure-resources', departure.id],
    queryFn: ({ signal }) => listDepartureResources(departure.id, {}, signal),
    ...operationalQueryOptions(),
  })

  const departureSummary = useMemo(
    () =>
      summarizeSegmentResourceAmounts(departureResourceList?.items ?? [], {
        departureSettled: departure.status === DepartureStatus.SETTLED,
      }),
    [departure.status, departureResourceList?.items],
  )

  const stackTokenStyle = {
    '--execution-border': token.colorBorderSecondary,
    '--execution-fill-hover': token.colorFillQuaternary,
    '--execution-item-bg': token.colorBgContainer,
    '--execution-text': token.colorText,
    '--execution-text-secondary': token.colorTextSecondary,
    '--execution-text-tertiary': token.colorTextTertiary,
    '--execution-warning': token.colorWarning,
    '--execution-primary': token.colorPrimary,
    '--execution-primary-bg': token.colorPrimaryBg,
    '--execution-primary-border': token.colorPrimaryBorder,
  } as CSSProperties

  const onDepartureLayer = layer === 'departure'

  return (
    <div className={styles.stackLayout} style={stackTokenStyle}>
      <div className={styles.layerSwitch} role="tablist" aria-label="资源层级">
        <button
          type="button"
          role="tab"
          aria-selected={!onDepartureLayer}
          className={`${styles.layerCard} ${!onDepartureLayer ? styles.layerCardActive : ''}`}
          onClick={() => setSelectedLayer('day')}
        >
          <span className={styles.layerCardIcon} aria-hidden>
            <CalendarOutlined />
          </span>
          <span className={styles.layerCardBody}>
            <span className={styles.layerCardTitle}>按日资源</span>
            <span className={styles.layerCardMeta}>
              {segments.length > 0 ? `${segments.length} 天行程` : '尚未生成日程'}
            </span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={onDepartureLayer}
          className={`${styles.layerCard} ${onDepartureLayer ? styles.layerCardActive : ''}`}
          onClick={() => setSelectedLayer('departure')}
        >
          <span className={styles.layerCardIcon} aria-hidden>
            <AppstoreOutlined />
          </span>
          <span className={styles.layerCardBody}>
            <span className={styles.layerCardTitle}>
              发团级资源
              <span className={styles.layerCardCount}>{departureSummary.resourceCount}</span>
            </span>
            <span className={styles.layerCardMeta}>
              {departureSummary.ungeneratedPayableCount > 0 ? (
                <span className={styles.layerCardWarn}>
                  {departureSummary.ungeneratedPayableCount} 项未提交应付
                </span>
              ) : (
                '全程统一录入'
              )}
            </span>
          </span>
        </button>
      </div>

      {onDepartureLayer ? (
        <div className={styles.layerPane}>
          <DepartureResourcePane
            departure={departure}
            readOnly={readOnly}
            canEdit={canEdit}
            amountReadOnly={amountReadOnly}
            highlightDepartureResourceId={highlightDepartureResourceId}
          />
        </div>
      ) : (
        <div className={styles.dayStack}>
          <ExecutionDayAxis
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            mutationLocked={mutationLocked}
            onSelect={onSelect}
            onEdit={onEdit}
            onCreate={onCreate}
            onDelete={onDelete}
          />

          <Card className={styles.paneCard} classNames={{ body: styles.paneCardBody }}>
            {segments.length === 0 ? (
              <Empty
                description="至少保留一天行程。可按出团～回团补齐日程，或手工添加一天"
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
                      添加一天
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
        </div>
      )}
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
  // 行程段增删改属 departure:write：财务（无 canEdit）只读，但资源提交应付不受此限。
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
        message.success('行程已更新')
      } else {
        message.success('行程已添加')
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
      message.error(error instanceof Error ? error.message : '保存行程失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSegment(id),
    onSuccess: (_result, deletedId) => {
      const nextSegmentId = resolveAdjacentSegmentId(segments, deletedId)
      message.success('行程已删除')
      closeDrawer()
      invalidateSegments()
      navigateExecution(nextSegmentId)
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除行程失败')
    },
  })

  const generateDailyMutation = useMutation({
    mutationFn: () => generateDailySegments(departure.id, { mode: 'fill_missing' }),
    onSuccess: (result: GenerateDailySegmentsResult) => {
      if (result.createdCount > 0) {
        message.success(`已按出团～回团生成 ${result.createdCount} 个一日行程`)
      } else {
        message.info('出团～回团各日均已有行程覆盖，未新增')
      }
      if (result.preservedWithResources > 0) {
        message.info(`已保留 ${result.preservedWithResources} 个含资源的行程`)
      }
      invalidateSegments()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '生成每日行程失败')
    },
  })

  const handleGenerateDaily = () => {
    generateDailyMutation.mutate()
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
        title="行程加载失败"
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
        onDelete={(segment) => deleteMutation.mutate(segment.id)}
        onGenerateDaily={handleGenerateDaily}
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
          editingSegment && segments.length > 1
            ? () => deleteMutation.mutate(editingSegment.id)
            : undefined
        }
      />
    </div>
  )
}
