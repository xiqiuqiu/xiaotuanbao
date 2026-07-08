import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Form, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import { deriveTransactionWriteoffStatus, TransactionDirection, TransactionWriteoffStatus } from '@xiaotuanbao/shared'
import { createTransaction, listTransactions, updateTransaction, voidTransaction } from '@/services/finance.service'
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
  getDefaultTransactionDateRange,
  TransactionFilters,
  type TransactionDateRange,
} from '../components/TransactionFilters'
import { TransactionFormDrawer } from '../components/TransactionFormDrawer'
import {
  VoidTransactionModal,
  type VoidTransactionFormValues,
} from '../components/VoidTransactionModal'
import {
  buildCreateTransactionPayload,
  buildUpdateTransactionPayload,
  type TransactionFormValues,
} from '../utils/transaction-form'

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<TransactionFormValues>()
  const [voidForm] = Form.useForm<VoidTransactionFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransactionSummary | null>(null)
  const [voidModalOpen, setVoidModalOpen] = useState(false)
  const [voidingTransaction, setVoidingTransaction] = useState<FinanceTransactionSummary | null>(null)
  const [dateRange, setDateRange] = useState<TransactionDateRange>(() => {
    const [start, end] = getDefaultTransactionDateRange()
    return [start, end]
  })
  const [direction, setDirection] = useState<TransactionDirection | undefined>()
  const [partnerKeyword, setPartnerKeyword] = useState('')
  const [writeoffStatus, setWriteoffStatus] = useState<TransactionWriteoffStatus | undefined>()
  const [transactionNo, setTransactionNo] = useState('')
  const [departureFilter, setDepartureFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<'normal' | 'voided' | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

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
    const [start, end] = getDefaultTransactionDateRange()
    setDateRange([start, end])
    setDirection(undefined)
    setPartnerKeyword('')
    setWriteoffStatus(undefined)
    setTransactionNo('')
    setDepartureFilter(undefined)
    setStatusFilter(undefined)
    setPage(1)
  }, [])

  const columns = useMemo<ColumnsType<FinanceTransactionSummary>>(
    () => [
      {
        title: '流水号',
        dataIndex: 'transactionNo',
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
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
        render: (_, record) => {
          if (record.voidedAt) {
            return '—'
          }

          const writeoff = deriveTransactionWriteoffStatus(
            record.amountCents,
            record.allocatedAmountCents,
          )
          const canEdit = writeoff.status === 'none'
          const canVoid = writeoff.status === 'none'

          if (!canEdit && !canVoid) {
            return '—'
          }

          return (
            <>
              {canEdit ? (
                <Button type="link" onClick={() => handleEdit(record)}>
                  编辑
                </Button>
              ) : null}
              {canVoid ? (
                <Button type="link" danger onClick={() => handleOpenVoidModal(record)}>
                  作废
                </Button>
              ) : null}
            </>
          )
        },
      },
    ],
    [handleEdit, handleOpenVoidModal],
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            财务流水
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            登记实际收付款流水，供账款节点关联核销
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建流水
        </Button>
      </div>

      <TransactionFilters
        dateRange={dateRange}
        direction={direction}
        partnerKeyword={partnerKeyword}
        writeoffStatus={writeoffStatus}
        transactionNo={transactionNo}
        departureId={departureFilter}
        status={statusFilter}
        onDateRangeChange={(value) => {
          setDateRange(value)
          setPage(1)
        }}
        onDirectionChange={(value) => {
          setDirection(value)
          setPage(1)
        }}
        onPartnerKeywordChange={(value) => {
          setPartnerKeyword(value)
          setPage(1)
        }}
        onWriteoffStatusChange={(value) => {
          setWriteoffStatus(value)
          setPage(1)
        }}
        onTransactionNoChange={(value) => {
          setTransactionNo(value)
          setPage(1)
        }}
        onDepartureChange={(value) => {
          setDepartureFilter(value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatusFilter(value)
          setPage(1)
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
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>

      <VoidTransactionModal
        open={voidModalOpen}
        transaction={voidingTransaction}
        loading={voidMutation.isPending}
        form={voidForm}
        onClose={handleCloseVoidModal}
        onSubmit={(values) => {
          if (!voidingTransaction) {
            return
          }
          voidMutation.mutate({
            id: voidingTransaction.id,
            voidReason: values.voidReason,
          })
        }}
      />

      <TransactionFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        editingTransaction={editingTransaction}
        loading={createMutation.isPending || updateMutation.isPending}
        form={form}
        onClose={() => {
          setDrawerOpen(false)
          setEditingTransaction(null)
          form.resetFields()
        }}
        onSubmit={(values) => {
          if (drawerMode === 'edit') {
            updateMutation.mutate(values)
            return
          }
          createMutation.mutate(values)
        }}
      />
    </div>
  )
}
