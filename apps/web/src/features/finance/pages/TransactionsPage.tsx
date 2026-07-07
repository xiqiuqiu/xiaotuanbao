import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Form, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
import { createTransaction, listTransactions, voidTransaction } from '@/services/finance.service'
import {
  COUNTERPARTY_TYPE_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import {
  TransactionFormDrawer,
  buildCreateTransactionPayload,
  type TransactionFormValues,
} from '../components/TransactionFormDrawer'

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<TransactionFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [departureFilter, setDepartureFilter] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: transactionsResult, isLoading } = useQuery({
    queryKey: ['finance-transactions', departureFilter, page, pageSize],
    queryFn: () =>
      listTransactions({
        departureId: departureFilter,
        page,
        pageSize,
      }),
  })

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'transactions-page'],
    queryFn: () => listDepartures({ pageSize: 100 }),
  })

  const departureMap = useMemo(() => {
    const map = new Map<string, { departureNo: string; name: string }>()
    for (const departure of departuresResult?.items ?? []) {
      map.set(departure.id, { departureNo: departure.departureNo, name: departure.name })
    }
    return map
  }, [departuresResult?.items])

  const departureOptions =
    departuresResult?.items.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  const createMutation = useMutation({
    mutationFn: (values: TransactionFormValues) =>
      createTransaction(buildCreateTransactionPayload(values)),
    onSuccess: () => {
      message.success('流水已创建')
      setDrawerOpen(false)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidTransaction(id),
    onSuccess: () => {
      message.success('流水已作废')
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
      queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
      queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '作废失败')
    },
  })

  const handleVoid = useCallback(
    (transaction: FinanceTransactionSummary) => {
      Modal.confirm({
        title: '确认作废流水？',
        content: `作废后流水 ${transaction.transactionNo} 将不可再分配。`,
        okText: '作废',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => voidMutation.mutateAsync(transaction.id),
      })
    },
    [voidMutation],
  )

  const columns = useMemo<ColumnsType<FinanceTransactionSummary>>(
    () => [
      {
        title: '流水号',
        dataIndex: 'transactionNo',
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
      },
      {
        title: '方向',
        dataIndex: 'direction',
        render: (value: string) => (
          <Tag color={TRANSACTION_DIRECTION_COLORS[value]}>
            {catalogLabel(TRANSACTION_DIRECTION_LABELS, value)}
          </Tag>
        ),
      },
      {
        title: '金额',
        dataIndex: 'amountCents',
        render: (value: number) => formatCents(value),
      },
      {
        title: '已分配',
        dataIndex: 'allocatedAmountCents',
        render: (value: number) => formatCents(value),
      },
      {
        title: '未分配',
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
        title: '关联发团',
        dataIndex: 'departureId',
        render: (departureId: string | null) => {
          if (!departureId) {
            return '—'
          }
          const departure = departureMap.get(departureId)
          if (!departure) {
            return '—'
          }
          return (
            <Link to="/departure/$departureId" params={{ departureId }}>
              {departure.departureNo}
            </Link>
          )
        },
      },
      {
        title: '状态',
        render: (_, record) =>
          record.voidedAt ? <Tag color="default">已作废</Tag> : <Tag color="success">正常</Tag>,
      },
      {
        title: '操作',
        key: 'actions',
        render: (_, record) =>
          record.voidedAt ? (
            '—'
          ) : (
            <Button type="link" danger onClick={() => handleVoid(record)}>
              作废
            </Button>
          ),
      },
    ],
    [departureMap, handleVoid],
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>
          新建流水
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            allowClear
            showSearch
            placeholder="筛选发团"
            style={{ width: 280 }}
            value={departureFilter}
            onChange={(value) => {
              setDepartureFilter(value)
              setPage(1)
            }}
            options={departureOptions}
            optionFilterProp="label"
          />
          <Button
            onClick={() => {
              setDepartureFilter(undefined)
              setPage(1)
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={transactionsResult?.items ?? []}
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

      <TransactionFormDrawer
        open={drawerOpen}
        loading={createMutation.isPending}
        form={form}
        onClose={() => {
          setDrawerOpen(false)
          form.resetFields()
        }}
        onSubmit={(values) => createMutation.mutate(values)}
      />
    </div>
  )
}
