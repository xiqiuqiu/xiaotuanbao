import { useCallback, useMemo, useReducer } from 'react'
import { Button, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import { listPartners } from '@/services/partner.service'
import {
  createSourceOrder,
  deleteSourceOrder,
  generateReceivables,
  listSourceOrders,
  updateSourceOrder,
} from '@/services/source-order.service'
import { formatCents } from '../catalog'
import { SourceOrderDrawer } from './SourceOrderDrawer'
import { SourceOrderGuestDrawer } from './SourceOrderGuestDrawer'
import { SourceOrdersFilters } from './SourceOrdersFilters'
import { buildSourceOrdersColumns } from './source-orders-table-columns'
import { formValuesToPayload } from '../utils/source-order-form'
import {
  EMPTY_SOURCE_ORDER_FILTERS,
  type SourceOrderFilterDraft,
} from '../utils/source-order-filter-state'

interface SourceOrdersTabProps {
  departure: DepartureDetail
  readOnly: boolean
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

export function SourceOrdersTab({ departure, readOnly, amountReadOnly = false }: SourceOrdersTabProps) {
  const queryClient = useQueryClient()
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
    },
  })

  const onView = useCallback((order: SourceOrderSummary) => {
    dispatchDrawer({ type: 'OPEN_VIEW', order })
  }, [])

  const onEdit = useCallback((order: SourceOrderSummary) => {
    dispatchDrawer({ type: 'OPEN_EDIT', order })
  }, [])

  const onOpenGuests = useCallback((order: SourceOrderSummary) => {
    dispatchDrawer({ type: 'OPEN_GUESTS', order })
  }, [])

  const columns = useMemo(
    () =>
      buildSourceOrdersColumns({
        readOnly,
        deleteMutation,
        generateMutation,
        onView,
        onEdit,
        onOpenGuests,
      }),
    [deleteMutation, generateMutation, onEdit, onOpenGuests, onView, readOnly],
  )

  const partnerOptions =
    partnersResult?.items.map((partner) => ({
      value: partner.id,
      label: partner.name,
    })) ?? []

  const summary = listResult?.summary

  return (
    <div>
      {summary ? (
        <Typography.Paragraph style={{ marginBottom: 16 }}>
          <Typography.Text strong>
            客源{summary.orderCount}单
          </Typography.Text>
          {' · '}
          总人数{summary.totalGuests}人
          {' · '}
          客户{summary.partnerCount}家
          {' · '}
          优惠 {formatCents(summary.totalDiscountCents)}
          {' · '}
          结算金额 {formatCents(summary.totalNetReceivableCents)}
          {' · '}
          我方代收 {formatCents(summary.totalGuestCollectCents)}
        </Typography.Paragraph>
      ) : null}

      <SourceOrdersFilters
        draft={filters.draft}
        partnerOptions={partnerOptions}
        onDraftChange={(draft) => dispatchFilters({ type: 'SET_DRAFT', draft })}
        onApply={() => dispatchFilters({ type: 'APPLY' })}
        onReset={() => dispatchFilters({ type: 'RESET' })}
      />

      {!readOnly ? (
        <div style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => dispatchDrawer({ type: 'OPEN_CREATE' })}
          >
            添加客源单
          </Button>
        </div>
      ) : null}

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={listResult?.items ?? []}
        scroll={{ x: 1600 }}
        pagination={false}
      />

      <SourceOrderDrawer
        open={drawer.drawerOpen}
        editing={drawer.editingOrder}
        readOnly={readOnly || drawer.viewOnly}
        amountReadOnly={amountReadOnly}
        loading={saveMutation.isPending}
        onClose={() => dispatchDrawer({ type: 'CLOSE_DRAWER' })}
        onSubmit={(payload) => saveMutation.mutate(payload)}
      />

      <SourceOrderGuestDrawer
        open={drawer.guestDrawerOpen}
        sourceOrder={drawer.guestOrder}
        readOnly={readOnly}
        onClose={() => dispatchDrawer({ type: 'CLOSE_GUEST_DRAWER' })}
        onSynced={() => {
          void queryClient.invalidateQueries({ queryKey: ['source-orders', departure.id] })
          void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
        }}
      />
    </div>
  )
}
