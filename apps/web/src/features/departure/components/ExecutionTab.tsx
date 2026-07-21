import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Spin,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type {
  DepartureDetail,
  ItinerarySegmentListResult,
  ItinerarySegmentSummary,
} from '@/types/api'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import {
  createSegment,
  deleteSegment,
  listSegments,
  updateSegment,
} from '@/services/segment.service'
import { listSegmentResources } from '@/services/segment-resource.service'
import {
  resolveAdjacentSegmentId,
  resolveSelectedSegmentId,
} from '../utils/execution-segment-selection'
import { formValuesToPayload } from '../utils/segment-form'
import { ExecutionResourcePane } from './ExecutionResourcePane'
import { ExecutionSegmentListPane } from './ExecutionSegmentListPane'
import { SegmentDrawer } from './SegmentDrawer'
import styles from './ExecutionTab.module.css'

interface ExecutionTabProps {
  departure: DepartureDetail
  segmentId?: string
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

export function ExecutionTab({
  departure,
  segmentId,
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
      <Row className={styles.panes} gutter={16} wrap={false} align="stretch">
        <ExecutionSegmentListPane
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          mutationLocked={mutationLocked}
          onSelect={(id) => navigateExecution(id)}
          onEdit={openEdit}
          onCreate={openCreate}
        />

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
