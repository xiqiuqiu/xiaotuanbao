import { useCallback, useMemo, useReducer } from 'react'
import { Button, Modal, Space, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import {
  didSourceAmountPathChange,
  DirectoryProfileStatus,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { listPartners } from '@/services/partner.service'
import {
  createSourceOrder,
  deleteSourceOrder,
  generateReceivables,
  generateReceivablesForDeparture,
  getGuestCollectionChangeImpact,
  listSourceOrders,
  updateSourceOrder,
} from '@/services/source-order.service'
import { formatCents } from '../catalog'
import { SourceOrderDrawer } from './SourceOrderDrawer'
import { SourceOrderGuestDrawer } from './SourceOrderGuestDrawer'
import { SourceOrdersFilters } from './SourceOrdersFilters'
import { buildSourceOrdersColumns } from './source-orders-table-columns'
import {
  formValuesToPayload,
  resolvePathAmountsFromPayload,
} from '../utils/source-order-form'
import {
  EMPTY_SOURCE_ORDER_FILTERS,
  type SourceOrderFilterDraft,
} from '../utils/source-order-filter-state'
import { counterpartyFilterFromSourceOrder } from '@/features/finance/utils/payment-schedule-view-counterparty'
import {
  formatBatchFinanceGenerationConfirmContent,
  formatBatchFinanceGenerationMessage,
} from '../utils/batch-finance-generation-message'

interface SourceOrdersTabProps {
  departure: DepartureDetail
  /** 结构性只读（发团已关闭）；同时封锁编辑与生成。 */
  readOnly: boolean
  /** 是否持有 `departure:write`；财务无，仅封锁编辑，不影响生成应收。 */
  canEdit: boolean
  amountReadOnly?: boolean
}

interface FilterState {
  draft: SourceOrderFilterDraft
  applied: SourceOrderFilterDraft
}

type FilterAction =
  | { type: 'SET_DRAFT'; draft: SourceOrderFilterDraft }
  | { type: 'APPLY' }
  | { type: 'RESET' }

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_DRAFT':
      return { ...state, draft: action.draft }
    case 'APPLY':
      return {
        ...state,
        applied: {
          ...state.draft,
          keyword: state.draft.keyword.trim(),
        },
      }
    case 'RESET':
      return {
        draft: EMPTY_SOURCE_ORDER_FILTERS,
        applied: EMPTY_SOURCE_ORDER_FILTERS,
      }
  }
}

interface DrawerState {
  drawerOpen: boolean
  guestDrawerOpen: boolean
  editingOrder: SourceOrderSummary | null
  viewOnly: boolean
  guestOrder: SourceOrderSummary | null
}

type DrawerAction =
  | { type: 'OPEN_CREATE' }
  | { type: 'OPEN_VIEW'; order: SourceOrderSummary }
  | { type: 'OPEN_EDIT'; order: SourceOrderSummary }
  | { type: 'OPEN_GUESTS'; order: SourceOrderSummary }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'CLOSE_GUEST_DRAWER' }

const initialDrawerState: DrawerState = {
  drawerOpen: false,
  guestDrawerOpen: false,
  editingOrder: null,
  viewOnly: false,
  guestOrder: null,
}

function drawerReducer(state: DrawerState, action: DrawerAction): DrawerState {
  switch (action.type) {
    case 'OPEN_CREATE':
      return {
        ...state,
        drawerOpen: true,
        editingOrder: null,
        viewOnly: false,
      }
    case 'OPEN_VIEW':
      return {
        ...state,
        drawerOpen: true,
        editingOrder: action.order,
        viewOnly: true,
      }
    case 'OPEN_EDIT':
      return {
        ...state,
        drawerOpen: true,
        editingOrder: action.order,
        viewOnly: false,
      }
    case 'OPEN_GUESTS':
      return {
        ...state,
        guestDrawerOpen: true,
        guestOrder: action.order,
      }
    case 'CLOSE_DRAWER':
      return {
        ...state,
        drawerOpen: false,
        editingOrder: null,
        viewOnly: false,
      }
    case 'CLOSE_GUEST_DRAWER':
      return {
        ...state,
        guestDrawerOpen: false,
        guestOrder: null,
      }
  }
}

export function SourceOrdersTab({
  departure,
  readOnly,
  canEdit,
  amountReadOnly = false,
}: SourceOrdersTabProps) {
  const editable = !readOnly && canEdit
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [filters, dispatchFilters] = useReducer(filterReducer, {
    draft: EMPTY_SOURCE_ORDER_FILTERS,
    applied: EMPTY_SOURCE_ORDER_FILTERS,
  })
  const [drawer, dispatchDrawer] = useReducer(drawerReducer, initialDrawerState)

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'source-order-filter'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
  })

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['source-orders', departure.id, filters.applied],
    queryFn: () =>
      listSourceOrders(departure.id, {
        partnerId: filters.applied.partnerId,
        collectionMode: filters.applied.collectionMode,
        hasDiscount: filters.applied.hasDiscount,
        keyword: filters.applied.keyword || undefined,
      }),
    ...operationalQueryOptions(),
  })

  /** 批量生成按全团未生成客源单的有效应收路径计数；与筛选列表解耦。 */
  const { data: allOrdersForBatchCount } = useQuery({
    queryKey: ['source-orders', departure.id, EMPTY_SOURCE_ORDER_FILTERS],
    queryFn: () =>
      listSourceOrders(departure.id, {
        partnerId: EMPTY_SOURCE_ORDER_FILTERS.partnerId,
        collectionMode: EMPTY_SOURCE_ORDER_FILTERS.collectionMode,
        hasDiscount: EMPTY_SOURCE_ORDER_FILTERS.hasDiscount,
        keyword: EMPTY_SOURCE_ORDER_FILTERS.keyword || undefined,
      }),
    ...operationalQueryOptions(),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formValuesToPayload>) => {
      if (drawer.editingOrder) {
        return updateSourceOrder(drawer.editingOrder.id, payload)
      }
      return createSourceOrder(departure.id, payload)
    },
    onSuccess: () => {
      message.success(drawer.editingOrder ? '客源单已更新' : '客源单已添加')
      dispatchDrawer({ type: 'CLOSE_DRAWER' })
      void queryClient.invalidateQueries({ queryKey: ['source-orders', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
    },
  })

  const submitSourceOrder = async (payload: ReturnType<typeof formValuesToPayload>) => {
    const editingOrder = drawer.editingOrder
    if (!editingOrder) {
      saveMutation.mutate(payload)
      return
    }

    const nextPath = resolvePathAmountsFromPayload(payload)
    const pathChanged = didSourceAmountPathChange(
      {
        guestCollectCents: editingOrder.guestCollectCents,
        partnerCollectedCents: editingOrder.partnerCollectedCents,
      },
      nextPath,
    )
    if (!pathChanged) {
      saveMutation.mutate(payload)
      return
    }

    const impact = await getGuestCollectionChangeImpact(editingOrder.id)
    if (impact.affectedTransactionCount <= 0) {
      saveMutation.mutate(payload)
      return
    }

    Modal.confirm({
      title: '关联流水金额可能受影响',
      content: (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <span>
            我方代收 {formatCents(editingOrder.guestCollectCents)} →{' '}
            {formatCents(nextPath.guestCollectCents)}
            {editingOrder.partnerCollectedCents !== nextPath.partnerCollectedCents
              ? `；客户已收 ${formatCents(editingOrder.partnerCollectedCents)} → ${formatCents(nextPath.partnerCollectedCents)}`
              : ''}
          </span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            本单有 {impact.affectedTransactionCount}{' '}
            笔未核销游客代收流水创建于变更前，保存后将标记「客源金额已变更」。确认继续？
          </Typography.Text>
        </Space>
      ),
      okText: '仍要保存',
      cancelText: '取消',
      onOk: () => saveMutation.mutateAsync(payload),
    })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSourceOrder(id),
    onSuccess: () => {
      message.success('客源单已删除')
      void queryClient.invalidateQueries({ queryKey: ['source-orders', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: (id: string) => generateReceivables(id),
    onSuccess: (result) => {
      message.success(
        result.sourceAmountMismatch
          ? '应收已生成，存在来源金额差异，请核对'
          : '应收已生成',
      )
      void queryClient.invalidateQueries({ queryKey: ['source-orders', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
    },
  })

  const batchGenerateMutation = useMutation({
    mutationFn: () => generateReceivablesForDeparture(departure.id),
    onSuccess: (result) => {
      const text = formatBatchFinanceGenerationMessage(result, '应收')
      if (result.failed > 0) {
        message.warning(text)
      } else if (result.succeeded > 0) {
        message.success(text)
      } else {
        message.info(text)
      }
      void queryClient.invalidateQueries({ queryKey: ['source-orders', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '批量生成应收失败')
    },
  })

  const pendingReceivableCount = useMemo(
    () =>
      (allOrdersForBatchCount?.items ?? []).reduce((count, order) => {
        if (order.receivableStatus !== SourceOrderReceivableStatus.NOT_GENERATED) {
          return count
        }
        return (
          count +
          Number(order.partnerCollectedCents > 0) +
          Number(order.guestCollectCents > 0)
        )
      }, 0),
    [allOrdersForBatchCount?.items],
  )
  const showBatchGenerate = !readOnly && pendingReceivableCount > 0

  const confirmBatchGenerate = () => {
    if (pendingReceivableCount <= 0) return
    Modal.confirm({
      title: '批量生成应收',
      content: (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <span>{formatBatchFinanceGenerationConfirmContent(pendingReceivableCount, '应收')}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            收款方式为「客户已收 + 我方代收」的客源单会拆分为两条应收记录。
          </Typography.Text>
        </Space>
      ),
      okText: '生成',
      cancelText: '取消',
      onOk: () => batchGenerateMutation.mutateAsync(),
    })
  }

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
                <Button onClick={confirmBatchGenerate} loading={batchGenerateMutation.isPending}>
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

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={listResult?.items ?? []}
        scroll={{ x: 1760 }}
        pagination={false}
      />

      <SourceOrderDrawer
        open={drawer.drawerOpen}
        editing={drawer.editingOrder}
        readOnly={!editable || drawer.viewOnly}
        amountReadOnly={amountReadOnly}
        loading={saveMutation.isPending}
        onClose={() => dispatchDrawer({ type: 'CLOSE_DRAWER' })}
        onSubmit={(payload) => {
          void submitSourceOrder(payload)
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
