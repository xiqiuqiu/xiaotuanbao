import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Form, Space, Table, Tag, Typography, message } from 'antd'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import { PaymentScheduleStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
import {
  cancelSchedule,
  confirmCollection,
  confirmPayment,
  linkPayableTransaction,
  linkReceivableTransaction,
  listDeparturePayables,
  listDepartureReceivables,
  listPayables,
  listReceivables,
  updatePayable,
  updateReceivable,
} from '@/services/finance.service'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_SCHEDULE_STATUS_COLORS,
  PAYMENT_SCHEDULE_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { PaymentScheduleFilters, type DueDateRange } from './PaymentScheduleFilters'
import { ConfirmCollectionDrawer } from './ConfirmCollectionDrawer'
import { ConfirmPaymentDrawer } from './ConfirmPaymentDrawer'
import { LinkTransactionModal } from './LinkTransactionModal'
import { CancelScheduleModal, type CancelScheduleFormValues } from './CancelScheduleModal'
import { EditScheduleDrawer } from './EditScheduleDrawer'
import {
  buildConfirmCollectionPayload,
  scheduleToConfirmCollectionValues,
  type ConfirmCollectionFormValues,
} from '../utils/confirm-collection-form'
import {
  buildConfirmPaymentPayload,
  scheduleToConfirmPaymentValues,
  type ConfirmPaymentFormValues,
} from '../utils/confirm-payment-form'
import {
  buildLinkTransactionPayload,
  scheduleToLinkTransactionValues,
  type LinkTransactionFormValues,
} from '../utils/link-transaction-form'
import {
  buildUpdateSchedulePayload,
  scheduleToEditValues,
  type EditScheduleFormValues,
} from '../utils/edit-schedule-form'

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

function isScheduleActionable(schedule: PaymentScheduleSummary): boolean {
  return schedule.status !== PaymentScheduleStatus.CANCELLED
}

function canSettle(schedule: PaymentScheduleSummary): boolean {
  return isScheduleActionable(schedule) && schedule.unsettledAmountCents > 0
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

  const [departureFilter, setDepartureFilter] = useState<string | undefined>(lockedDepartureId)
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

  const departureMap = useMemo(() => {
    const map = new Map<string, { departureNo: string; name: string }>()
    for (const departure of departuresResult?.items ?? []) {
      map.set(departure.id, { departureNo: departure.departureNo, name: departure.name })
    }
    return map
  }, [departuresResult?.items])

  const filteredItems = useMemo(
    () =>
      applyClientFilters(schedulesResult?.items ?? [], keyword, statusFilter, dueDateRange),
    [schedulesResult?.items, keyword, statusFilter, dueDateRange],
  )

  const tableItems = hasClientFilters
    ? filteredItems.slice((page - 1) * pageSize, page * pageSize)
    : filteredItems

  const tableTotal = hasClientFilters ? filteredItems.length : (schedulesResult?.total ?? 0)

  const invalidateSchedules = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [listQueryKey] })
    queryClient.invalidateQueries({ queryKey: [departureListQueryKey] })
    queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
    queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
    queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
  }, [queryClient, listQueryKey, departureListQueryKey])

  const confirmMutation = useMutation({
    mutationFn: async (values: ConfirmCollectionFormValues | ConfirmPaymentFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      if (isReceivable) {
        return confirmCollection(activeSchedule.id, buildConfirmCollectionPayload(values))
      }
      return confirmPayment(activeSchedule.id, buildConfirmPaymentPayload(values))
    },
    onSuccess: () => {
      message.success(isReceivable ? '收款已登记' : '付款已登记')
      setConfirmOpen(false)
      setActiveSchedule(null)
      confirmForm.resetFields()
      invalidateSchedules()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '操作失败')
    },
  })

  const linkMutation = useMutation({
    mutationFn: async (values: LinkTransactionFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      const payload = buildLinkTransactionPayload(values)
      return isReceivable
        ? linkReceivableTransaction(activeSchedule.id, payload)
        : linkPayableTransaction(activeSchedule.id, payload)
    },
    onSuccess: () => {
      message.success('流水已关联')
      setLinkOpen(false)
      setActiveSchedule(null)
      linkForm.resetFields()
      invalidateSchedules()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '关联失败')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (values: CancelScheduleFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      return cancelSchedule(activeSchedule.id, {
        cancelReason: values.cancelReason?.trim() || undefined,
      })
    },
    onSuccess: () => {
      message.success('节点已关闭')
      setCancelOpen(false)
      setActiveSchedule(null)
      cancelForm.resetFields()
      invalidateSchedules()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '关闭失败')
    },
  })

  const editMutation = useMutation({
    mutationFn: async (values: EditScheduleFormValues) => {
      if (!activeSchedule) {
        throw new Error('未选择节点')
      }
      const payload = buildUpdateSchedulePayload(activeSchedule, values)
      return isReceivable
        ? updateReceivable(activeSchedule.id, payload)
        : updatePayable(activeSchedule.id, payload)
    },
    onSuccess: () => {
      message.success('节点已更新')
      setEditOpen(false)
      setActiveSchedule(null)
      editForm.resetFields()
      invalidateSchedules()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '更新失败')
    },
  })

  const openConfirm = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(schedule)
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
      linkForm.setFieldsValue(scheduleToLinkTransactionValues(schedule))
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

  const columns = useMemo<ColumnsType<PaymentScheduleSummary>>(
    () => [
      {
        title: '节点编号',
        dataIndex: 'scheduleNo',
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
      },
      { title: '标题', dataIndex: 'title' },
      ...(isDepartureScope
        ? []
        : [
            {
              title: '发团',
              dataIndex: 'departureId',
              render: (departureId: string) => {
                const departure = departureMap.get(departureId)
                if (!departure) {
                  return '—'
                }
                return (
                  <Link to="/departure/$departureId" params={{ departureId }}>
                    {departure.departureNo} · {departure.name}
                  </Link>
                )
              },
            },
          ]),
      {
        title: '往来对象',
        render: (_, record) => (
          <span>
            {catalogLabel(COUNTERPARTY_TYPE_LABELS, record.counterpartyType)}
            {record.counterpartyName ? ` · ${record.counterpartyName}` : ''}
          </span>
        ),
      },
      {
        title: '金额',
        dataIndex: 'amountCents',
        render: (value: number) => formatCents(value),
      },
      {
        title: '已结清',
        dataIndex: 'settledAmountCents',
        render: (value: number) => formatCents(value),
      },
      {
        title: '未结清',
        dataIndex: 'unsettledAmountCents',
        render: (value: number) => formatCents(value),
      },
      { title: '到期日', dataIndex: 'dueDate' },
      {
        title: '状态',
        dataIndex: 'status',
        render: (status: string) => (
          <Tag color={PAYMENT_SCHEDULE_STATUS_COLORS[status]}>
            {catalogLabel(PAYMENT_SCHEDULE_STATUS_LABELS, status)}
          </Tag>
        ),
      },
      {
        title: '财务介入',
        dataIndex: 'financeTouched',
        render: (value: boolean) => (value ? <Tag color="gold">已介入</Tag> : '—'),
      },
      {
        title: '操作',
        key: 'actions',
        render: (_, record) => {
          if (readOnly) {
            return null
          }

          const actions: React.ReactNode[] = []

          if (canSettle(record)) {
            actions.push(
              <Button key="confirm" type="link" onClick={() => openConfirm(record)}>
                {isReceivable ? '登记收款' : '登记付款'}
              </Button>,
            )
            actions.push(
              <Button key="link" type="link" onClick={() => openLink(record)}>
                关联流水
              </Button>,
            )
          }

          if (isScheduleActionable(record)) {
            actions.push(
              <Button key="edit" type="link" onClick={() => openEdit(record)}>
                编辑
              </Button>,
            )
            actions.push(
              <Button key="cancel" type="link" danger onClick={() => openCancel(record)}>
                关闭节点
              </Button>,
            )
          }

          return actions.length > 0 ? <Space size={0} wrap>{actions}</Space> : '—'
        },
      },
    ],
    [departureMap, isDepartureScope, isReceivable, openCancel, openConfirm, openEdit, openLink, readOnly],
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

      {isReceivable ? (
        <ConfirmCollectionDrawer
          open={confirmOpen}
          schedule={activeSchedule}
          loading={confirmMutation.isPending}
          form={confirmForm}
          onClose={() => {
            setConfirmOpen(false)
            setActiveSchedule(null)
          }}
          onSubmit={(values) => confirmMutation.mutate(values)}
        />
      ) : (
        <ConfirmPaymentDrawer
          open={confirmOpen}
          schedule={activeSchedule}
          loading={confirmMutation.isPending}
          form={confirmForm}
          onClose={() => {
            setConfirmOpen(false)
            setActiveSchedule(null)
          }}
          onSubmit={(values) => confirmMutation.mutate(values)}
        />
      )}

      <LinkTransactionModal
        open={linkOpen}
        schedule={activeSchedule}
        loading={linkMutation.isPending}
        form={linkForm}
        onClose={() => {
          setLinkOpen(false)
          setActiveSchedule(null)
        }}
        onSubmit={(values) => linkMutation.mutate(values)}
      />

      <CancelScheduleModal
        open={cancelOpen}
        schedule={activeSchedule}
        loading={cancelMutation.isPending}
        form={cancelForm}
        onClose={() => {
          setCancelOpen(false)
          setActiveSchedule(null)
        }}
        onSubmit={(values) => cancelMutation.mutate(values)}
      />

      <EditScheduleDrawer
        open={editOpen}
        schedule={activeSchedule}
        loading={editMutation.isPending}
        form={editForm}
        onClose={() => {
          setEditOpen(false)
          setActiveSchedule(null)
        }}
        onSubmit={(values) => editMutation.mutate(values)}
      />
    </div>
  )
}
