import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { Alert, Button, Card, Space, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { listPartners } from '@/services/partner.service'
import { listSourceOrders } from '@/services/source-order.service'
import { counterpartyFilterFromSourceOrder } from '@/features/finance/utils/payment-schedule-view-counterparty'
import { SourceOrderDrawer } from './SourceOrderDrawer'
import { SourceOrderGuestDrawer } from './SourceOrderGuestDrawer'
import { SourceOrdersFilters } from './SourceOrdersFilters'
import { buildSourceOrdersColumns } from './source-orders-table-columns'
import {
  drawerReducer,
  filterReducer,
  initialDrawerState,
} from './source-orders-tab-state'
import { EMPTY_SOURCE_ORDER_FILTERS } from '../utils/source-order-filter-state'
import {
  confirmBatchGenerateReceivables,
  countPendingReceivables,
  useSourceOrderSubmit,
  useSourceOrdersTabMutations,
} from '../hooks/useSourceOrdersTabMutations'

interface SourceOrdersTabProps {
  departure: DepartureDetail
  /** 结构性只读（发团已关闭）；同时封锁编辑与生成。 */
  readOnly: boolean
  /** 是否持有 `departure:write`；财务无，仅封锁编辑，不影响生成应收。 */
  canEdit: boolean
  amountReadOnly?: boolean
}

export function SourceOrdersTab({
  departure,
  readOnly,
  canEdit,
  amountReadOnly = false,
}: SourceOrdersTabProps) {
  const editable = !readOnly && canEdit
  const navigate = useNavigate()
  const [filters, dispatchFilters] = useReducer(filterReducer, {
    draft: EMPTY_SOURCE_ORDER_FILTERS,
    applied: EMPTY_SOURCE_ORDER_FILTERS,
  })
  const [drawer, dispatchDrawer] = useReducer(drawerReducer, initialDrawerState)
  const impactAbortRef = useRef<AbortController | null>(null)
  const latestEditingOrderIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    latestEditingOrderIdRef.current = drawer.editingOrder?.id
  }, [drawer.editingOrder?.id])

  useEffect(() => {
    if (!drawer.drawerOpen) {
      impactAbortRef.current?.abort()
      impactAbortRef.current = null
    }
  }, [drawer.drawerOpen])

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'source-order-filter'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
  })

  const {
    data: listResult,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['source-orders', departure.id, filters.applied],
    queryFn: ({ signal }) =>
      listSourceOrders(
        departure.id,
        {
          partnerId: filters.applied.partnerId,
          collectionMode: filters.applied.collectionMode,
          hasDiscount: filters.applied.hasDiscount,
          keyword: filters.applied.keyword || undefined,
        },
        signal,
      ),
    ...operationalQueryOptions(),
  })

  /** 批量生成按全团未生成客源单的有效应收路径计数；与筛选列表解耦。 */
  const { data: allOrdersForBatchCount } = useQuery({
    queryKey: ['source-orders', departure.id, EMPTY_SOURCE_ORDER_FILTERS],
    queryFn: ({ signal }) =>
      listSourceOrders(
        departure.id,
        {
          partnerId: EMPTY_SOURCE_ORDER_FILTERS.partnerId,
          collectionMode: EMPTY_SOURCE_ORDER_FILTERS.collectionMode,
          hasDiscount: EMPTY_SOURCE_ORDER_FILTERS.hasDiscount,
          keyword: EMPTY_SOURCE_ORDER_FILTERS.keyword || undefined,
        },
        signal,
      ),
    ...operationalQueryOptions(),
  })

  const closeDrawer = useCallback(() => {
    dispatchDrawer({ type: 'CLOSE_DRAWER' })
  }, [])

  const { saveMutation, deleteMutation, generateMutation, batchGenerateMutation } =
    useSourceOrdersTabMutations({
      departure,
      drawer,
      onCloseDrawer: closeDrawer,
    })

  const submitSourceOrder = useSourceOrderSubmit({
    editingOrder: drawer.editingOrder,
    saveMutation,
    impactAbortRef,
    latestEditingOrderIdRef,
  })

  const pendingReceivableCount = useMemo(
    () => countPendingReceivables(allOrdersForBatchCount?.items),
    [allOrdersForBatchCount?.items],
  )
  const showBatchGenerate = !readOnly && pendingReceivableCount > 0

  const onView = useCallback((order: SourceOrderSummary) => {
    dispatchDrawer({ type: 'OPEN_VIEW', order })
  }, [])

  const onEdit = useCallback((order: SourceOrderSummary) => {
    dispatchDrawer({ type: 'OPEN_EDIT', order })
  }, [])

  const onOpenGuests = useCallback((order: SourceOrderSummary) => {
    dispatchDrawer({ type: 'OPEN_GUESTS', order })
  }, [])

  const onViewReceivables = useCallback(
    (order: SourceOrderSummary) => {
      const counterparty = counterpartyFilterFromSourceOrder(order)
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: {
          tab: 'receivables',
          highlightSourceOrderId: order.id,
          ...(counterparty ? { counterpartyKeyword: counterparty.counterpartyKeyword } : {}),
        },
      })
    },
    [departure.id, navigate],
  )

  const columns = useMemo(
    () =>
      buildSourceOrdersColumns({
        canEdit: editable,
        canGenerate: !readOnly,
        deleteMutation,
        generateMutation,
        onView,
        onEdit,
        onOpenGuests,
        onViewReceivables,
      }),
    [
      deleteMutation,
      editable,
      generateMutation,
      onEdit,
      onOpenGuests,
      onView,
      onViewReceivables,
      readOnly,
    ],
  )

  const partnerOptions =
    partnersResult?.items.map((partner) => ({
      value: partner.id,
      label: partner.name,
    })) ?? []

  return (
    <div>
      <SourceOrdersFilters
        draft={filters.draft}
        partnerOptions={partnerOptions}
        onDraftChange={(draft) => dispatchFilters({ type: 'SET_DRAFT', draft })}
        onApply={() => dispatchFilters({ type: 'APPLY' })}
        onReset={() => dispatchFilters({ type: 'RESET' })}
        extra={
          showBatchGenerate || editable ? (
            <Space>
              {showBatchGenerate ? (
                <Button
                  onClick={() =>
                    confirmBatchGenerateReceivables(pendingReceivableCount, batchGenerateMutation)
                  }
                  loading={batchGenerateMutation.isPending}
                >
                  批量生成应收
                </Button>
              ) : null}
              {editable ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => dispatchDrawer({ type: 'OPEN_CREATE' })}
                >
                  添加客源单
                </Button>
              ) : null}
            </Space>
          ) : undefined
        }
      />

      {isError && !listResult ? (
        <Card>
          <Alert
            type="error"
            showIcon
            title="客源单加载失败"
            description={
              error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'
            }
            action={
              <Button size="small" onClick={() => void refetch()}>
                重试
              </Button>
            }
          />
        </Card>
      ) : (
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={listResult?.items ?? []}
          scroll={{ x: 1760 }}
          pagination={false}
        />
      )}

      <SourceOrderDrawer
        open={drawer.drawerOpen}
        editing={drawer.editingOrder}
        readOnly={!editable || drawer.viewOnly}
        amountReadOnly={amountReadOnly}
        loading={saveMutation.isPending}
        onClose={closeDrawer}
        onSubmit={(payload, pathBaseline) => {
          void submitSourceOrder(payload, pathBaseline)
        }}
      />

      <SourceOrderGuestDrawer
        open={drawer.guestDrawerOpen}
        sourceOrder={drawer.guestOrder}
        readOnly={!editable}
        onClose={() => dispatchDrawer({ type: 'CLOSE_GUEST_DRAWER' })}
      />
    </div>
  )
}
