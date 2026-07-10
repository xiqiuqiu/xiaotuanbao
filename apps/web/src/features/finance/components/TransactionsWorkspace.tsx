import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Button, Card, Form, Table, Tag, Tooltip, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormInstance } from 'antd/es/form'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import {
  deriveTransactionWriteoffStatus,
  TransactionDirection,
  TransactionWriteoffStatus,
} from '@xiaotuanbao/shared'
import {
  createTransaction,
  createVerification,
  listTransactions,
  updateTransaction,
  voidTransaction,
} from '@/services/finance.service'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_WRITEOFF_STATUS_COLORS,
  TRANSACTION_WRITEOFF_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { TransactionFilters } from './TransactionFilters'
import {
  getDefaultTransactionDateRange,
  type TransactionDateRange,
} from '../utils/date-ranges'
import { TransactionFormDrawer } from './TransactionFormDrawer'
import { TransactionDetailDrawer } from './TransactionDetailDrawer'
import { CreateVerificationDrawer } from './CreateVerificationDrawer'
import {
  VoidTransactionModal,
  type VoidTransactionFormValues,
} from './VoidTransactionModal'
import {
  buildCreateTransactionPayload,
  buildUpdateTransactionPayload,
  type TransactionFormValues,
} from '../utils/transaction-form'
import {
  buildCreateVerificationPayload,
  type CreateVerificationFormValues,
} from '../utils/verification-form'
import { applyTransactionListDeepLink } from '../utils/transaction-list-deep-link'

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export type TransactionsWorkspaceProps = {
  scope: 'global' | 'departure'
  departureId?: string
  readOnly?: boolean
  /** Departure-tab deep link: optional direction filter from overview「查看流水」. */
  initialDirection?: TransactionDirection
  /** Global-page URL deep link (departureId + direction). */
  deepLinkSearch?: {
    departureId?: string
    direction?: string
  }
  pageHeader?: {
    title: string
    description: string
  }
}

type TransactionListState = {
  dateRange: TransactionDateRange
  direction?: TransactionDirection
  partnerKeyword: string
  writeoffStatus?: TransactionWriteoffStatus
  transactionNo: string
  departureFilter?: string
  statusFilter?: 'normal' | 'voided'
  page: number
  pageSize: number
}

type TransactionListAction =
  | { type: 'setDateRange'; value: TransactionDateRange }
  | { type: 'setDirection'; value?: TransactionDirection }
  | { type: 'setPartnerKeyword'; value: string }
  | { type: 'setWriteoffStatus'; value?: TransactionWriteoffStatus }
  | { type: 'setTransactionNo'; value: string }
  | { type: 'setDepartureFilter'; value?: string }
  | { type: 'setStatusFilter'; value?: 'normal' | 'voided' }
  | { type: 'setPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'resetFilters' }
  | { type: 'applyDeepLink'; value: TransactionListState }

/** Exported for unit tests — departure scope has no default date window. */
export function createInitialTransactionListState(options: {
  scope: 'global' | 'departure'
  direction?: TransactionDirection
}): TransactionListState {
  const isDepartureScope = options.scope === 'departure'
  const [start, end] = getDefaultTransactionDateRange()
  return {
    dateRange: isDepartureScope ? null : [start, end],
    direction: options.direction,
    partnerKeyword: '',
    writeoffStatus: undefined,
    transactionNo: '',
    departureFilter: undefined,
    statusFilter: undefined,
    page: 1,
    pageSize: 10,
  }
}

function createTransactionListReducer(scope: 'global' | 'departure') {
  return function transactionListReducer(
    state: TransactionListState,
    action: TransactionListAction,
  ): TransactionListState {
    switch (action.type) {
      case 'setDateRange':
        return { ...state, dateRange: action.value, page: 1 }
      case 'setDirection':
        return { ...state, direction: action.value, page: 1 }
      case 'setPartnerKeyword':
        return { ...state, partnerKeyword: action.value, page: 1 }
      case 'setWriteoffStatus':
        return { ...state, writeoffStatus: action.value, page: 1 }
      case 'setTransactionNo':
        return { ...state, transactionNo: action.value, page: 1 }
      case 'setDepartureFilter':
        return { ...state, departureFilter: action.value, page: 1 }
      case 'setStatusFilter':
        return { ...state, statusFilter: action.value, page: 1 }
      case 'setPage':
        return { ...state, page: action.value }
      case 'setPageSize':
        return { ...state, pageSize: action.value }
      case 'resetFilters':
        return createInitialTransactionListState({ scope })
      case 'applyDeepLink':
        return { ...state, ...action.value }
      default:
        return state
    }
  }
}

function buildTransactionColumns({
  isDepartureScope,
  readOnly,
  onOpenDetail,
  onOpenVerify,
  onEdit,
  onOpenVoidModal,
  onViewVerifications,
}: {
  isDepartureScope: boolean
  readOnly: boolean
  onOpenDetail: (id: string) => void
  onOpenVerify: (transaction: FinanceTransactionSummary) => void
  onEdit: (transaction: FinanceTransactionSummary) => void
  onOpenVoidModal: (transaction: FinanceTransactionSummary) => void
  onViewVerifications: (transaction: FinanceTransactionSummary) => void
}): ColumnsType<FinanceTransactionSummary> {
  const columns: ColumnsType<FinanceTransactionSummary> = [
    {
      title: '流水号',
      dataIndex: 'transactionNo',
      render: (value: string, record) => (
        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => onOpenDetail(record.id)}>
          <Typography.Text code>{value}</Typography.Text>
        </Button>
      ),
    },
    {
      title: '收支方向',
      dataIndex: 'direction',
      render: (value: string) => (
        <Tag color={TRANSACTION_DIRECTION_COLORS[value]}>
          {catalogLabel(TRANSACTION_DIRECTION_LABELS, value)}
        </Tag>
      ),
    },
    {
      title: '流水金额',
      dataIndex: 'amountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '已核销',
      dataIndex: 'allocatedAmountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '未核销',
      dataIndex: 'unallocatedAmountCents',
      render: (value: number) => formatCents(value),
    },
    { title: '交易日期', dataIndex: 'transactionDate' },
    {
      title: '往来对象',
      render: (_, record) => (
        <span>
          {catalogLabel(COUNTERPARTY_TYPE_LABELS, record.counterpartyType)}
          {record.counterpartyName ? ` · ${record.counterpartyName}` : ''}
        </span>
      ),
    },
  ]

  if (!isDepartureScope) {
    columns.push({
      title: '关联发团',
      dataIndex: 'departureNo',
      render: (value: string | null, record) => {
        if (!value) {
          return '—'
        }
        return <Tooltip title={record.departureName ?? undefined}>{value}</Tooltip>
      },
    })
  }

  columns.push(
    {
      title: '收付款通道',
      dataIndex: 'paymentChannel',
      render: (value: string) => catalogLabel(PAYMENT_CHANNEL_LABELS, value),
    },
    {
      title: '核销状态',
      render: (_, record) => {
        const writeoff = deriveTransactionWriteoffStatus(
          record.amountCents,
          record.allocatedAmountCents,
        )
        return (
          <Tag color={TRANSACTION_WRITEOFF_STATUS_COLORS[writeoff.status]}>
            {TRANSACTION_WRITEOFF_STATUS_LABELS[writeoff.status]}
          </Tag>
        )
      },
    },
    {
      title: '流水状态',
      render: (_, record) => (
        <Tag color={record.voidedAt ? 'default' : 'success'}>
          {record.voidedAt ? TRANSACTION_STATUS_LABELS.voided : TRANSACTION_STATUS_LABELS.normal}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      render: (_, record) => {
        if (record.voidedAt || readOnly) {
          return (
            <Button type="link" onClick={() => onOpenDetail(record.id)}>
              查看
            </Button>
          )
        }

        const writeoff = deriveTransactionWriteoffStatus(
          record.amountCents,
          record.allocatedAmountCents,
        )

        if (writeoff.status === 'none') {
          return (
            <>
              <Button type="link" onClick={() => onOpenVerify(record)}>
                去核销
              </Button>
              <Button type="link" onClick={() => onEdit(record)}>
                编辑
              </Button>
              <Button type="link" danger onClick={() => onOpenVoidModal(record)}>
                作废
              </Button>
            </>
          )
        }

        if (writeoff.status === 'partial') {
          return (
            <>
              <Button type="link" onClick={() => onOpenVerify(record)}>
                去核销
              </Button>
              <Button type="link" onClick={() => onViewVerifications(record)}>
                查看核销
              </Button>
            </>
          )
        }

        return (
          <Button type="link" onClick={() => onViewVerifications(record)}>
            查看核销
          </Button>
        )
      },
    },
  )

  return columns
}

interface TransactionDialogsProps {
  voidModalOpen: boolean
  voidingTransaction: FinanceTransactionSummary | null
  voidLoading: boolean
  voidForm: FormInstance<VoidTransactionFormValues>
  onCloseVoid: () => void
  onSubmitVoid: (values: VoidTransactionFormValues) => void
  drawerOpen: boolean
  drawerMode: 'create' | 'edit'
  editingTransaction: FinanceTransactionSummary | null
  transactionLoading: boolean
  transactionForm: FormInstance<TransactionFormValues>
  lockedDepartureId?: string
  onCloseTransaction: () => void
  onSubmitTransaction: (values: TransactionFormValues) => void
  detailTransactionId: string | null
  onCloseDetail: () => void
  verifyTransaction: FinanceTransactionSummary | null
  verifyLoading: boolean
  verifyForm: FormInstance<CreateVerificationFormValues>
  onCloseVerify: () => void
  onSubmitVerify: (values: CreateVerificationFormValues) => void
}

function TransactionDialogs({
  voidModalOpen,
  voidingTransaction,
  voidLoading,
  voidForm,
  onCloseVoid,
  onSubmitVoid,
  drawerOpen,
  drawerMode,
  editingTransaction,
  transactionLoading,
  transactionForm,
  lockedDepartureId,
  onCloseTransaction,
  onSubmitTransaction,
  detailTransactionId,
  onCloseDetail,
  verifyTransaction,
  verifyLoading,
  verifyForm,
  onCloseVerify,
  onSubmitVerify,
}: TransactionDialogsProps) {
  return (
    <>
      <VoidTransactionModal
        open={voidModalOpen}
        transaction={voidingTransaction}
        loading={voidLoading}
        form={voidForm}
        onClose={onCloseVoid}
        onSubmit={onSubmitVoid}
      />

      <TransactionFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        editingTransaction={editingTransaction}
        loading={transactionLoading}
        form={transactionForm}
        lockedDepartureId={lockedDepartureId}
        onClose={onCloseTransaction}
        onSubmit={onSubmitTransaction}
      />

      <TransactionDetailDrawer
        open={Boolean(detailTransactionId)}
        transactionId={detailTransactionId}
        onClose={onCloseDetail}
      />

      {verifyTransaction ? (
        <CreateVerificationDrawer
          key={verifyTransaction.id}
          open={Boolean(verifyTransaction)}
          initialTransaction={verifyTransaction}
          lockedDepartureId={lockedDepartureId}
          loading={verifyLoading}
          form={verifyForm}
          onClose={onCloseVerify}
          onSubmit={onSubmitVerify}
        />
      ) : null}
    </>
  )
}

export function TransactionsWorkspace({
  scope,
  departureId: lockedDepartureId,
  readOnly = false,
  initialDirection,
  deepLinkSearch,
  pageHeader,
}: TransactionsWorkspaceProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isDepartureScope = scope === 'departure'
  const listQueryKey = isDepartureScope ? 'departure-transactions' : 'finance-transactions'
  const reducer = useMemo(() => createTransactionListReducer(scope), [scope])

  const [form] = Form.useForm<TransactionFormValues>()
  const [voidForm] = Form.useForm<VoidTransactionFormValues>()
  const [verifyForm] = Form.useForm<CreateVerificationFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransactionSummary | null>(
    null,
  )
  const [voidModalOpen, setVoidModalOpen] = useState(false)
  const [voidingTransaction, setVoidingTransaction] = useState<FinanceTransactionSummary | null>(
    null,
  )
  const [detailTransactionId, setDetailTransactionId] = useState<string | null>(null)
  const [verifyTransaction, setVerifyTransaction] = useState<FinanceTransactionSummary | null>(null)
  const [listState, dispatchList] = useReducer(reducer, undefined, () =>
    createInitialTransactionListState({
      scope,
      direction: isDepartureScope ? initialDirection : undefined,
    }),
  )
  const appliedDeepLinkKey = useRef<string | null>(null)
  const appliedDepartureDirectionKey = useRef<string | null>(null)

  useEffect(() => {
    if (isDepartureScope || !deepLinkSearch) {
      return
    }
    const deepLink = applyTransactionListDeepLink(deepLinkSearch)
    if (!deepLink) {
      appliedDeepLinkKey.current = null
      return
    }
    const key = [deepLink.departureFilter, deepLink.direction ?? ''].join('|')
    if (appliedDeepLinkKey.current === key) {
      return
    }
    appliedDeepLinkKey.current = key
    dispatchList({ type: 'applyDeepLink', value: deepLink })
  }, [deepLinkSearch, isDepartureScope])

  // Keep direction in sync when overview/header「查看流水」updates the URL while
  // this tab is already mounted (destroyOnHidden does not remount in that case).
  useEffect(() => {
    if (!isDepartureScope) {
      return
    }
    const key = initialDirection ?? ''
    if (appliedDepartureDirectionKey.current === key) {
      return
    }
    appliedDepartureDirectionKey.current = key
    dispatchList({ type: 'setDirection', value: initialDirection })
  }, [initialDirection, isDepartureScope])

  const {
    dateRange,
    direction,
    partnerKeyword,
    writeoffStatus,
    transactionNo,
    departureFilter,
    statusFilter,
    page,
    pageSize,
  } = listState

  const effectiveDepartureId = isDepartureScope ? lockedDepartureId : departureFilter

  const { data: transactionsResult, isLoading } = useQuery({
    queryKey: [
      listQueryKey,
      lockedDepartureId,
      dateRange,
      direction,
      partnerKeyword,
      writeoffStatus,
      transactionNo,
      effectiveDepartureId,
      statusFilter,
      page,
      pageSize,
    ],
    queryFn: () =>
      listTransactions({
        dateStart: dateRange?.[0],
        dateEnd: dateRange?.[1],
        direction,
        partnerKeyword: partnerKeyword || undefined,
        writeoffStatus,
        transactionNo: transactionNo || undefined,
        departureId: effectiveDepartureId,
        status: statusFilter,
        page,
        pageSize,
      }),
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
  })

  const invalidateLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
    queryClient.invalidateQueries({ queryKey: ['departure-transactions'] })
    queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
    queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
    queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
    queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
    queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
    queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
    if (lockedDepartureId) {
      queryClient.invalidateQueries({ queryKey: ['departure', lockedDepartureId] })
    }
  }, [lockedDepartureId, queryClient])

  const handleOpenDetail = useCallback((id: string) => {
    setDetailTransactionId(id)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setDetailTransactionId(null)
  }, [])

  const createMutation = useMutation({
    mutationFn: (values: TransactionFormValues) =>
      createTransaction(buildCreateTransactionPayload(values)),
    onSuccess: () => {
      message.success('流水已创建')
      setDrawerOpen(false)
      setEditingTransaction(null)
      form.resetFields()
      invalidateLists()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (values: TransactionFormValues) => {
      if (!editingTransaction) {
        throw new Error('未选择流水')
      }
      return updateTransaction(editingTransaction.id, buildUpdateTransactionPayload(values))
    },
    onSuccess: () => {
      message.success('流水已更新')
      setDrawerOpen(false)
      setEditingTransaction(null)
      form.resetFields()
      invalidateLists()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '更新失败')
    },
  })

  const voidMutation = useMutation({
    mutationFn: ({ id, voidReason }: { id: string; voidReason: string }) =>
      voidTransaction(id, { voidReason }),
    onSuccess: () => {
      message.success('流水已作废')
      setVoidModalOpen(false)
      setVoidingTransaction(null)
      voidForm.resetFields()
      invalidateLists()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '作废失败')
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (values: CreateVerificationFormValues) =>
      createVerification(buildCreateVerificationPayload(values)),
    onSuccess: () => {
      message.success('核销已创建')
      setVerifyTransaction(null)
      verifyForm.resetFields()
      invalidateLists()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '核销失败')
    },
  })

  const handleOpenVerify = useCallback((transaction: FinanceTransactionSummary) => {
    setVerifyTransaction(transaction)
  }, [])

  const handleCloseVerify = useCallback(() => {
    setVerifyTransaction(null)
    verifyForm.resetFields()
  }, [verifyForm])

  const handleViewVerifications = useCallback(
    (record: FinanceTransactionSummary) => {
      if (isDepartureScope && lockedDepartureId) {
        void navigate({
          to: '/departure/$departureId',
          params: { departureId: lockedDepartureId },
          search: {
            tab: 'verifications',
            transactionNo: record.transactionNo,
          },
        })
        return
      }
      void navigate({
        to: '/finance/verification',
        search: { transactionNo: record.transactionNo },
      })
    },
    [isDepartureScope, lockedDepartureId, navigate],
  )

  const handleOpenVoidModal = useCallback((transaction: FinanceTransactionSummary) => {
    setVoidingTransaction(transaction)
    setVoidModalOpen(true)
  }, [])

  const handleCloseVoidModal = useCallback(() => {
    setVoidModalOpen(false)
    setVoidingTransaction(null)
    voidForm.resetFields()
  }, [voidForm])

  const handleEdit = useCallback((transaction: FinanceTransactionSummary) => {
    setDrawerMode('edit')
    setEditingTransaction(transaction)
    setDrawerOpen(true)
  }, [])

  const handleCreate = useCallback(() => {
    setDrawerMode('create')
    setEditingTransaction(null)
    setDrawerOpen(true)
  }, [])

  const handleResetFilters = useCallback(() => {
    dispatchList({ type: 'resetFilters' })
    if (isDepartureScope && lockedDepartureId) {
      appliedDepartureDirectionKey.current = null
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: lockedDepartureId },
        search: { tab: 'transactions' },
        replace: true,
      })
    }
  }, [isDepartureScope, lockedDepartureId, navigate])

  const columns = useMemo(
    () =>
      buildTransactionColumns({
        isDepartureScope,
        readOnly,
        onOpenDetail: handleOpenDetail,
        onOpenVerify: handleOpenVerify,
        onEdit: handleEdit,
        onOpenVoidModal: handleOpenVoidModal,
        onViewVerifications: handleViewVerifications,
      }),
    [
      handleEdit,
      handleOpenDetail,
      handleOpenVerify,
      handleOpenVoidModal,
      handleViewVerifications,
      isDepartureScope,
      readOnly,
    ],
  )

  const createButton =
    !readOnly ? (
      <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
        新建流水
      </Button>
    ) : null

  return (
    <div>
      {pageHeader ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
              {pageHeader.title}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {pageHeader.description}
            </Typography.Paragraph>
          </div>
          {createButton}
        </div>
      ) : createButton ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          {createButton}
        </div>
      ) : null}

      <TransactionFilters
        scope={scope}
        dateRange={dateRange}
        direction={direction}
        partnerKeyword={partnerKeyword}
        writeoffStatus={writeoffStatus}
        transactionNo={transactionNo}
        departureId={departureFilter}
        status={statusFilter}
        onDateRangeChange={(value) => {
          dispatchList({ type: 'setDateRange', value })
        }}
        onDirectionChange={(value) => {
          dispatchList({ type: 'setDirection', value })
        }}
        onPartnerKeywordChange={(value) => {
          dispatchList({ type: 'setPartnerKeyword', value })
        }}
        onWriteoffStatusChange={(value) => {
          dispatchList({ type: 'setWriteoffStatus', value })
        }}
        onTransactionNoChange={(value) => {
          dispatchList({ type: 'setTransactionNo', value })
        }}
        onDepartureChange={(value) => {
          dispatchList({ type: 'setDepartureFilter', value })
        }}
        onStatusChange={(value) => {
          dispatchList({ type: 'setStatusFilter', value })
        }}
        onReset={handleResetFilters}
      />

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={transactionsResult?.items ?? []}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize,
            total: transactionsResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage, nextPageSize) => {
              dispatchList({ type: 'setPage', value: nextPage })
              dispatchList({ type: 'setPageSize', value: nextPageSize })
            },
          }}
        />
      </Card>

      <TransactionDialogs
        voidModalOpen={voidModalOpen}
        voidingTransaction={voidingTransaction}
        voidLoading={voidMutation.isPending}
        voidForm={voidForm}
        onCloseVoid={handleCloseVoidModal}
        onSubmitVoid={(values) => {
          if (!voidingTransaction) {
            return
          }
          voidMutation.mutate({
            id: voidingTransaction.id,
            voidReason: values.voidReason,
          })
        }}
        drawerOpen={drawerOpen}
        drawerMode={drawerMode}
        editingTransaction={editingTransaction}
        transactionLoading={createMutation.isPending || updateMutation.isPending}
        transactionForm={form}
        lockedDepartureId={isDepartureScope ? lockedDepartureId : undefined}
        onCloseTransaction={() => {
          setDrawerOpen(false)
          setEditingTransaction(null)
          form.resetFields()
        }}
        onSubmitTransaction={(values) => {
          if (drawerMode === 'edit') {
            updateMutation.mutate(values)
            return
          }
          createMutation.mutate(values)
        }}
        detailTransactionId={detailTransactionId}
        onCloseDetail={handleCloseDetail}
        verifyTransaction={verifyTransaction}
        verifyLoading={verifyMutation.isPending}
        verifyForm={verifyForm}
        onCloseVerify={handleCloseVerify}
        onSubmitVerify={(values) => verifyMutation.mutate(values)}
      />
    </div>
  )
}
