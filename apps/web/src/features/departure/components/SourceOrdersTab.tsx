import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Alert, Button, Card, Space, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { DirectoryProfileStatus, SourceOrderReceivableStatus } from '@xiaotuanbao/shared'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { listPartners } from '@/services/partner.service'
import { listSourceOrders } from '@/services/source-order.service'
import { counterpartyFilterFromSourceOrder } from '@/features/finance/utils/payment-schedule-view-counterparty'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import {
  SOURCE_ORDER_DRAWER_PROTOTYPE_VARIANTS,
  VariantA,
  VariantB,
  VariantC,
  type SourceOrderDrawerPrototypeKey,
} from '../prototype/source-order-drawer-prototype'
import { SourceOrderDrawer } from './SourceOrderDrawer'
import { SourceOrderGuestDrawer } from './SourceOrderGuestDrawer'
import { SourceOrdersFilters } from './SourceOrdersFilters'
import { buildSourceOrdersColumns } from './source-orders-table-columns'
import { renderSourceOrdersTableSummary } from './source-orders-table-summary'
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
  const search = useSearch({ from: '/app/departure/$departureId' })
  const prototypeVariant =
    !import.meta.env.PROD &&
    (search.variant === 'A' || search.variant === 'B' || search.variant === 'C')
      ? (search.variant as SourceOrderDrawerPrototypeKey)
      : null
  const [prototypeOpen, setPrototypeOpen] = useState(Boolean(prototypeVariant))

  useEffect(() => {
    if (prototypeVariant) {
      setPrototypeOpen(true)
    }
  }, [prototypeVariant])

  const setPrototypeVariant = useCallback(
    (key: string) => {
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: (prev) => ({
          ...prev,
          tab: 'sourceOrders',
          variant: key,
        }),
        replace: true,
      })
    },
    [departure.id, navigate],
  )

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

  const {
    saveMutation,
    saveAndGenerateMutation,
    deleteMutation,
    generateMutation,
    batchGenerateMutation,
  } = useSourceOrdersTabMutations({
    departure,
    drawer,
    onCloseDrawer: closeDrawer,
  })

  const submitSourceOrder = useSourceOrderSubmit({
    editingOrder: drawer.editingOrder,
    saveMutation,
    saveAndGenerateMutation,
    impactAbortRef,
    latestEditingOrderIdRef,
  })

  const canSaveAndGenerate =
    editable &&
    (drawer.editingOrder == null ||
      drawer.editingOrder.receivableStatus === SourceOrderReceivableStatus.NOT_GENERATED)

  const pendingReceivableCount = useMemo(
    () => countPendingReceivables(allOrdersForBatchCount?.items),
    [allOrdersForBatchCount?.items],
  )
  const showBatchGenerate = !readOnly && pendingReceivableCount > 0

  const onOpen = useCallback((order: SourceOrderSummary, viewOnly: boolean) => {
    dispatchDrawer({ type: viewOnly ? 'OPEN_VIEW' : 'OPEN_EDIT', order })
  }, [])

  const onOpenGuests = useCallback((order: SourceOrderSummary) => {
    dispatchDrawer({ type: 'OPEN_GUESTS', order })
  }, [])

  const onViewReceivables = useCallback(
    (order: SourceOrderSummary) => {
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: {
          tab: 'receivables',
          highlightSourceOrderId: order.id,
          sourceId: order.id,
        },
      })
    },
    [departure.id, navigate],
  )

  const onViewRebate = useCallback(
    (order: SourceOrderSummary) => {
      const counterparty = counterpartyFilterFromSourceOrder(order)
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: {
          tab: 'payables',
          ...(order.rebateScheduleNo ? { scheduleNo: order.rebateScheduleNo } : {}),
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
        onOpen,
        onOpenGuests,
        onViewReceivables,
        onViewRebate,
      }),
    [
      deleteMutation,
      editable,
      generateMutation,
      onOpen,
      onOpenGuests,
      onViewReceivables,
      onViewRebate,
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
                  onClick={() => {
                    if (prototypeVariant) {
                      setPrototypeOpen(true)
                      return
                    }
                    dispatchDrawer({ type: 'OPEN_CREATE' })
                  }}
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
      ) : prototypeVariant === 'C' ? (
        <VariantC
          open={prototypeOpen}
          onClose={() => setPrototypeOpen(false)}
          listSlot={
            <Table
              rowKey="id"
              loading={isLoading}
              columns={columns}
              dataSource={listResult?.items ?? []}
              scroll={{ x: 2280 }}
              pagination={false}
              summary={renderSourceOrdersTableSummary}
            />
          }
        />
      ) : (
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={listResult?.items ?? []}
          scroll={{ x: 2280 }}
          pagination={false}
          summary={renderSourceOrdersTableSummary}
        />
      )}

      {prototypeVariant === 'A' ? (
        <VariantA open={prototypeOpen} onClose={() => setPrototypeOpen(false)} />
      ) : null}
      {prototypeVariant === 'B' ? (
        <VariantB open={prototypeOpen} onClose={() => setPrototypeOpen(false)} />
      ) : null}

      {prototypeVariant ? (
        <PrototypeSwitcher
          variants={[...SOURCE_ORDER_DRAWER_PROTOTYPE_VARIANTS]}
          current={prototypeVariant}
          onChange={setPrototypeVariant}
        />
      ) : null}

      <SourceOrderDrawer
        open={!prototypeVariant && drawer.drawerOpen}
        editing={drawer.editingOrder}
        readOnly={!editable || drawer.viewOnly}
        amountReadOnly={amountReadOnly}
        loading={saveMutation.isPending}
        canSaveAndGenerate={canSaveAndGenerate && !drawer.viewOnly}
        saveAndGenerateLoading={saveAndGenerateMutation.isPending}
        onClose={closeDrawer}
        onSubmit={(payload, pathBaseline, options) => {
          void submitSourceOrder(payload, pathBaseline, options)
        }}
      />

      <SourceOrderGuestDrawer
        open={!prototypeVariant && drawer.guestDrawerOpen}
        sourceOrder={drawer.guestOrder}
        readOnly={!editable}
        onClose={() => dispatchDrawer({ type: 'CLOSE_GUEST_DRAWER' })}
      />
    </div>
  )
}
