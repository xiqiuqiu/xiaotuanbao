import { useCallback, useMemo, useReducer, useState } from 'react'
import { Button, Card, Form, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormInstance } from 'antd/es/form'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import { deriveTransactionWriteoffStatus, TransactionDirection, TransactionWriteoffStatus } from '@xiaotuanbao/shared'
import { createTransaction, createVerification, listTransactions, updateTransaction, voidTransaction } from '@/services/finance.service'
import { listDepartures } from '@/services/departure.service'
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
import {
  TransactionFilters,
} from '../components/TransactionFilters'
import {
  getDefaultTransactionDateRange,
  type TransactionDateRange,
} from '../utils/date-ranges'
import { TransactionFormDrawer } from '../components/TransactionFormDrawer'
import { TransactionDetailDrawer } from '../components/TransactionDetailDrawer'
import { CreateVerificationDrawer } from '../components/CreateVerificationDrawer'
import {
  VoidTransactionModal,
  type VoidTransactionFormValues,
} from '../components/VoidTransactionModal'
import {
  buildCreateTransactionPayload,
  buildUpdateTransactionPayload,
  type TransactionFormValues,
} from '../utils/transaction-form'
import {
  buildCreateVerificationPayload,
  type CreateVerificationFormValues,
} from '../utils/verification-form'

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildTransactionColumns({
  onOpenDetail,
  onOpenVerify,
  onEdit,
  onOpenVoidModal,
  onViewVerifications,
}: {
  onOpenDetail: (id: string) => void
  onOpenVerify: (transaction: FinanceTransactionSummary) => void
  onEdit: (transaction: FinanceTransactionSummary) => void
  onOpenVoidModal: (transaction: FinanceTransactionSummary) => void
  onViewVerifications: (transaction: FinanceTransactionSummary) => void
}): ColumnsType<FinanceTransactionSummary> {
  return [
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
        if (record.voidedAt) {
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
  ]
}

interface TransactionsTableProps {
  loading: boolean
  columns: ColumnsType<FinanceTransactionSummary>
  items: FinanceTransactionSummary[]
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number, pageSize: number) => void
}

function TransactionsTable({
  loading,
  columns,
  items,
  page,
  pageSize,
  total,
  onPageChange,
}: TransactionsTableProps) {
  return (
    <Card>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count) => `共 ${count} 条`,
          onChange: onPageChange,
        }}
      />
    </Card>
  )
}

interface TransactionsHeaderProps {
  onCreate: () => void
}

function TransactionsHeader({ onCreate }: TransactionsHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <div>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          财务流水
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          登记实际收付款流水，供账款节点关联核销
        </Typography.Paragraph>
      </div>
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        新建流水
      </Button>
    </div>
  )
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
  onCloseTransaction: () => void
  onSubmitTransaction: (values: TransactionFormValues) => void
  detailTransactionId: string | null
  departureMap: Map<string, { departureNo: string; name: string }>
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
  onCloseTransaction,
  onSubmitTransaction,
  detailTransactionId,
  departureMap,
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
        onClose={onCloseTransaction}
        onSubmit={onSubmitTransaction}
      />

      <TransactionDetailDrawer
        open={Boolean(detailTransactionId)}
        transactionId={detailTransactionId}
        departureMap={departureMap}
        onClose={onCloseDetail}
      />

      {verifyTransaction ? (
        <CreateVerificationDrawer
          key={verifyTransaction.id}
          open={Boolean(verifyTransaction)}
          initialTransaction={verifyTransaction}
          loading={verifyLoading}
          form={verifyForm}
          onClose={onCloseVerify}
          onSubmit={onSubmitVerify}
        />
      ) : null}
    </>
  )
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

function createInitialTransactionListState(): TransactionListState {
  const [start, end] = getDefaultTransactionDateRange()
  return {
    dateRange: [start, end],
    direction: undefined,
    partnerKeyword: '',
    writeoffStatus: undefined,
    transactionNo: '',
    departureFilter: undefined,
    statusFilter: undefined,
    page: 1,
    pageSize: 10,
  }
}

function transactionListReducer(
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
      return createInitialTransactionListState()
    default:
      return state
  }
}

interface TransactionFiltersPanelProps {
  state: TransactionListState
  onAction: (action: TransactionListAction) => void
  onReset: () => void
}

function TransactionFiltersPanel({
  state,
  onAction,
  onReset,
}: TransactionFiltersPanelProps) {
  return (
    <TransactionFilters
      dateRange={state.dateRange}
      direction={state.direction}
      partnerKeyword={state.partnerKeyword}
      writeoffStatus={state.writeoffStatus}
      transactionNo={state.transactionNo}
      departureId={state.departureFilter}
      status={state.statusFilter}
      onDateRangeChange={(value) => {
        onAction({ type: 'setDateRange', value })
      }}
      onDirectionChange={(value) => {
        onAction({ type: 'setDirection', value })
      }}
      onPartnerKeywordChange={(value) => {
        onAction({ type: 'setPartnerKeyword', value })
      }}
      onWriteoffStatusChange={(value) => {
        onAction({ type: 'setWriteoffStatus', value })
      }}
      onTransactionNoChange={(value) => {
        onAction({ type: 'setTransactionNo', value })
      }}
      onDepartureChange={(value) => {
        onAction({ type: 'setDepartureFilter', value })
      }}
      onStatusChange={(value) => {
        onAction({ type: 'setStatusFilter', value })
      }}
      onReset={onReset}
    />
  )
}

export function TransactionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<TransactionFormValues>()
  const [voidForm] = Form.useForm<VoidTransactionFormValues>()
  const [verifyForm] = Form.useForm<CreateVerificationFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransactionSummary | null>(null)
  const [voidModalOpen, setVoidModalOpen] = useState(false)
  const [voidingTransaction, setVoidingTransaction] = useState<FinanceTransactionSummary | null>(null)
  const [detailTransactionId, setDetailTransactionId] = useState<string | null>(null)
  const [verifyTransaction, setVerifyTransaction] = useState<FinanceTransactionSummary | null>(null)
  const [listState, dispatchList] = useReducer(
    transactionListReducer,
    undefined,
    createInitialTransactionListState,
  )
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

  const { data: transactionsResult, isLoading } = useQuery({
    queryKey: [
      'finance-transactions',
      dateRange,
      direction,
      partnerKeyword,
      writeoffStatus,
      transactionNo,
      departureFilter,
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
        departureId: departureFilter,
        status: statusFilter,
        page,
        pageSize,
      }),
  })

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'transaction-detail-map'],
    queryFn: () => listDepartures({ pageSize: 100 }),
  })

  const departureMap = useMemo(() => {
    const map = new Map<string, { departureNo: string; name: string }>()
    for (const departure of departuresResult?.items ?? []) {
      map.set(departure.id, { departureNo: departure.departureNo, name: departure.name })
    }
    return map
  }, [departuresResult?.items])

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
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
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
      return updateTransaction(
        editingTransaction.id,
        buildUpdateTransactionPayload(values),
      )
    },
    onSuccess: () => {
      message.success('流水已更新')
      setDrawerOpen(false)
      setEditingTransaction(null)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
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
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
      queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
      queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
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
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
      queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
      queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
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
      void navigate({
        to: '/finance/verification',
        search: { transactionId: record.id },
      })
    },
    [navigate],
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
  }, [])

  const columns = useMemo(
    () =>
      buildTransactionColumns({
        onOpenDetail: handleOpenDetail,
        onOpenVerify: handleOpenVerify,
        onEdit: handleEdit,
        onOpenVoidModal: handleOpenVoidModal,
        onViewVerifications: handleViewVerifications,
      }),
    [handleEdit, handleOpenDetail, handleOpenVerify, handleOpenVoidModal, handleViewVerifications],
  )

  return (
    <div>
      <TransactionsHeader onCreate={handleCreate} />

      <TransactionFiltersPanel
        state={listState}
        onAction={dispatchList}
        onReset={handleResetFilters}
      />

      <TransactionsTable
        loading={isLoading}
        columns={columns}
        items={transactionsResult?.items ?? []}
        page={page}
        pageSize={pageSize}
        total={transactionsResult?.total ?? 0}
        onPageChange={(nextPage, nextPageSize) => {
          dispatchList({ type: 'setPage', value: nextPage })
          dispatchList({ type: 'setPageSize', value: nextPageSize })
        }}
      />

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
        departureMap={departureMap}
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
