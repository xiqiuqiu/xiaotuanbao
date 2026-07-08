import { useCallback, useMemo, useState } from 'react'
import { Card, Form, Table } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PaymentScheduleStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { listDepartures, getDeparture } from '@/services/departure.service'
import {
  listDeparturePayables,
  listDepartureReceivables,
  listPayables,
  listReceivables,
} from '@/services/finance.service'
import { PaymentScheduleFilters, type DueDateRange } from './PaymentScheduleFilters'
import { PaymentScheduleActionDialogs } from './PaymentScheduleActionDialogs'
import { buildPaymentScheduleColumns } from './payment-schedule-table-columns'
import { usePaymentScheduleMutations } from '../hooks/usePaymentScheduleMutations'
import {
  scheduleToConfirmCollectionValues,
  type ConfirmCollectionFormValues,
} from '../utils/confirm-collection-form'
import {
  scheduleToConfirmPaymentValues,
  type ConfirmPaymentFormValues,
} from '../utils/confirm-payment-form'
import {
  scheduleToLinkTransactionValues,
  type LinkTransactionFormValues,
} from '../utils/link-transaction-form'
import {
  scheduleToEditValues,
  type EditScheduleFormValues,
} from '../utils/edit-schedule-form'
import type { CancelScheduleFormValues } from './CancelScheduleModal'

export type PaymentScheduleWorkspaceProps = {
  scope: 'global' | 'departure'
  direction: 'receivable' | 'payable'
  departureId?: string
  readOnly?: boolean
}

function applyClientFilters(
  items: PaymentScheduleSummary[],
  keyword: string,
  statusFilter?: PaymentScheduleStatus,
  dueDateRange?: DueDateRange,
): PaymentScheduleSummary[] {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return items.filter((item) => {
    if (statusFilter && item.status !== statusFilter) {
      return false
    }

    if (normalizedKeyword) {
      const haystack = `${item.scheduleNo} ${item.title}`.toLowerCase()
      if (!haystack.includes(normalizedKeyword)) {
        return false
      }
    }

    if (dueDateRange?.[0] && item.dueDate < dueDateRange[0]) {
      return false
    }

    if (dueDateRange?.[1] && item.dueDate > dueDateRange[1]) {
      return false
    }

    return true
  })
}

export function PaymentScheduleWorkspace({
  scope,
  direction,
  departureId: lockedDepartureId,
  readOnly = false,
}: PaymentScheduleWorkspaceProps) {
  const queryClient = useQueryClient()
  const isReceivable = direction === 'receivable'
  const isDepartureScope = scope === 'departure'
  const listQueryKey = isReceivable ? 'finance-receivables' : 'finance-payables'
  const departureListQueryKey = isReceivable
    ? 'departure-receivables'
    : 'departure-payables'

  const [departureFilter, setDepartureFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<PaymentScheduleStatus | undefined>()
  const [keyword, setKeyword] = useState('')
  const [dueDateRange, setDueDateRange] = useState<DueDateRange>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [confirmForm] = Form.useForm<ConfirmCollectionFormValues | ConfirmPaymentFormValues>()
  const [linkForm] = Form.useForm<LinkTransactionFormValues>()
  const [cancelForm] = Form.useForm<CancelScheduleFormValues>()
  const [editForm] = Form.useForm<EditScheduleFormValues>()

  const [activeSchedule, setActiveSchedule] = useState<PaymentScheduleSummary | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const effectiveDepartureId = scope === 'departure' ? lockedDepartureId : departureFilter
  const hasClientFilters = Boolean(keyword.trim() || statusFilter || dueDateRange)
  const fetchPageSize = hasClientFilters ? 100 : pageSize

  const { data: schedulesResult, isLoading } = useQuery({
    queryKey: [
      isDepartureScope ? departureListQueryKey : listQueryKey,
      effectiveDepartureId,
      page,
      fetchPageSize,
      hasClientFilters,
    ],
    queryFn: () => {
      if (isDepartureScope) {
        if (!lockedDepartureId) {
          throw new Error('发团 ID 缺失')
        }
        const listFn = isReceivable ? listDepartureReceivables : listDeparturePayables
        return listFn(lockedDepartureId, {
          page: hasClientFilters ? 1 : page,
          pageSize: fetchPageSize,
        })
      }
      return (isReceivable ? listReceivables : listPayables)({
        departureId: effectiveDepartureId,
        page: hasClientFilters ? 1 : page,
        pageSize: fetchPageSize,
      })
    },
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
  })

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'finance-schedule-map'],
    queryFn: () => listDepartures({ pageSize: 100 }),
    enabled: !isDepartureScope,
  })

  const { data: lockedDeparture } = useQuery({
    queryKey: ['departure', lockedDepartureId, 'finance-schedule-map'],
    queryFn: () => {
      if (!lockedDepartureId) {
        throw new Error('发团 ID 缺失')
      }
      return getDeparture(lockedDepartureId)
    },
    enabled: isDepartureScope && Boolean(lockedDepartureId),
  })

  const departureMap = useMemo(() => {
    const map = new Map<string, { departureNo: string; name: string }>()
    for (const departure of departuresResult?.items ?? []) {
      map.set(departure.id, { departureNo: departure.departureNo, name: departure.name })
    }
    if (lockedDeparture) {
      map.set(lockedDeparture.id, {
        departureNo: lockedDeparture.departureNo,
        name: lockedDeparture.name,
      })
    }
    return map
  }, [departuresResult?.items, lockedDeparture])

  const filteredItems = useMemo(
    () =>
      applyClientFilters(schedulesResult?.items ?? [], keyword, statusFilter, dueDateRange),
    [schedulesResult?.items, keyword, statusFilter, dueDateRange],
  )

  const tableItems = hasClientFilters
    ? filteredItems.slice((page - 1) * pageSize, page * pageSize)
    : filteredItems

  const tableTotal = hasClientFilters ? filteredItems.length : (schedulesResult?.total ?? 0)

  const closeConfirm = useCallback(() => {
    confirmForm.resetFields()
    setConfirmOpen(false)
    setActiveSchedule(null)
  }, [confirmForm])

  const closeLink = useCallback(() => {
    linkForm.resetFields()
    setLinkOpen(false)
    setActiveSchedule(null)
  }, [linkForm])

  const closeCancel = useCallback(() => {
    cancelForm.resetFields()
    setCancelOpen(false)
    setActiveSchedule(null)
  }, [cancelForm])

  const closeEdit = useCallback(() => {
    editForm.resetFields()
    setEditOpen(false)
    setActiveSchedule(null)
  }, [editForm])

  const { confirmMutation, linkMutation, cancelMutation, editMutation } =
    usePaymentScheduleMutations({
      queryClient,
      isReceivable,
      listQueryKey,
      departureListQueryKey,
      activeSchedule,
      confirmForm,
      linkForm,
      cancelForm,
      editForm,
      onConfirmSuccess: closeConfirm,
      onLinkSuccess: closeLink,
      onCancelSuccess: closeCancel,
      onEditSuccess: closeEdit,
    })

  const openConfirm = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(schedule)
      confirmForm.resetFields()
      if (isReceivable) {
        confirmForm.setFieldsValue(scheduleToConfirmCollectionValues(schedule))
      } else {
        confirmForm.setFieldsValue(scheduleToConfirmPaymentValues(schedule))
      }
      setConfirmOpen(true)
    },
    [confirmForm, isReceivable],
  )

  const openLink = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(schedule)
      linkForm.resetFields()
      linkForm.setFieldsValue(scheduleToLinkTransactionValues())
      setLinkOpen(true)
    },
    [linkForm],
  )

  const openCancel = useCallback((schedule: PaymentScheduleSummary) => {
    setActiveSchedule(schedule)
    cancelForm.resetFields()
    setCancelOpen(true)
  }, [cancelForm])

  const openEdit = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(schedule)
      editForm.resetFields()
      editForm.setFieldsValue(scheduleToEditValues(schedule))
      setEditOpen(true)
    },
    [editForm],
  )

  const resetFilters = useCallback(() => {
    if (scope === 'global') {
      setDepartureFilter(undefined)
    }
    setStatusFilter(undefined)
    setKeyword('')
    setDueDateRange(null)
    setPage(1)
  }, [scope])

  const columns = useMemo(
    () =>
      buildPaymentScheduleColumns({
        isDepartureScope,
        isReceivable,
        readOnly,
        departureMap,
        onConfirm: openConfirm,
        onLink: openLink,
        onEdit: openEdit,
        onCancel: openCancel,
      }),
    [
      departureMap,
      isDepartureScope,
      isReceivable,
      openCancel,
      openConfirm,
      openEdit,
      openLink,
      readOnly,
    ],
  )

  return (
    <div>
      <PaymentScheduleFilters
        departureId={effectiveDepartureId}
        statusFilter={statusFilter}
        keyword={keyword}
        dueDateRange={dueDateRange}
        showDepartureFilter={scope === 'global'}
        onDepartureChange={(value) => {
          setDepartureFilter(value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatusFilter(value)
          setPage(1)
        }}
        onKeywordChange={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        onDueDateRangeChange={(value) => {
          setDueDateRange(value)
          setPage(1)
        }}
        onReset={resetFilters}
      />

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={tableItems}
          pagination={{
            current: page,
            pageSize,
            total: tableTotal,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>

      <PaymentScheduleActionDialogs
        isReceivable={isReceivable}
        activeSchedule={activeSchedule}
        departureMap={departureMap}
        confirmOpen={confirmOpen}
        linkOpen={linkOpen}
        cancelOpen={cancelOpen}
        editOpen={editOpen}
        confirmForm={confirmForm}
        linkForm={linkForm}
        cancelForm={cancelForm}
        editForm={editForm}
        confirmMutation={confirmMutation}
        linkMutation={linkMutation}
        cancelMutation={cancelMutation}
        editMutation={editMutation}
        onCloseConfirm={closeConfirm}
        onCloseLink={closeLink}
        onCloseCancel={closeCancel}
        onCloseEdit={closeEdit}
      />
    </div>
  )
}
