import { useCallback, useMemo, useReducer, useState } from 'react'
import { Button, Card, Form, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import {
  VerificationStatus,
  type FinanceVerificationListItem,
} from '@xiaotuanbao/shared'
import {
  cancelVerification,
  createVerification,
  listDepartureVerifications,
  listVerifications,
} from '@/services/finance.service'
import {
  COUNTERPARTY_TYPE_LABELS,
  VERIFICATION_DIRECTION_LABELS,
  VERIFICATION_STATUS_COLORS,
  VERIFICATION_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { CreateVerificationDrawer } from './CreateVerificationDrawer'
import {
  CancelVerificationModal,
  type CancelVerificationFormValues,
} from './CancelVerificationModal'
import {
  VerificationFilters,
} from './VerificationFilters'
import { VerificationDetailDrawer } from './VerificationDetailDrawer'
import {
  buildCreateVerificationPayload,
  type CreateVerificationFormValues,
} from '../utils/verification-form'
import {
  getDefaultVerificationDateRange,
  type VerificationDateRange,
} from '../utils/date-ranges'

export type VerificationsWorkspaceProps = {
  scope: 'global' | 'departure'
  departureId?: string
  readOnly?: boolean
  initialPaymentScheduleId?: string
  initialTransactionId?: string
  /** When set, renders the standard list page header (title + secondary + primary). */
  pageHeader?: {
    title: string
    description: string
  }
}

type VerificationListState = {
  page: number
  pageSize: number
  dateRange: VerificationDateRange
  direction?: string
  status?: string
  transactionNo: string
  scheduleNo: string
  departureKeyword: string
}

type VerificationListAction =
  | { type: 'setDateRange'; value: VerificationDateRange }
  | { type: 'setDirection'; value?: string }
  | { type: 'setStatus'; value?: string }
  | { type: 'setTransactionNo'; value: string }
  | { type: 'setScheduleNo'; value: string }
  | { type: 'setDepartureKeyword'; value: string }
  | { type: 'setPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'resetFilters' }

function createInitialVerificationListState(): VerificationListState {
  return {
    page: 1,
    pageSize: 10,
    dateRange: getDefaultVerificationDateRange(),
    direction: undefined,
    status: undefined,
    transactionNo: '',
    scheduleNo: '',
    departureKeyword: '',
  }
}

function verificationListReducer(
  state: VerificationListState,
  action: VerificationListAction,
): VerificationListState {
  switch (action.type) {
    case 'setDateRange':
      return { ...state, dateRange: action.value, page: 1 }
    case 'setDirection':
      return { ...state, direction: action.value, page: 1 }
    case 'setStatus':
      return { ...state, status: action.value, page: 1 }
    case 'setTransactionNo':
      return { ...state, transactionNo: action.value, page: 1 }
    case 'setScheduleNo':
      return { ...state, scheduleNo: action.value, page: 1 }
    case 'setDepartureKeyword':
      return { ...state, departureKeyword: action.value, page: 1 }
    case 'setPage':
      return { ...state, page: action.value }
    case 'setPageSize':
      return { ...state, pageSize: action.value }
    case 'resetFilters':
      return createInitialVerificationListState()
    default:
      return state
  }
}

function formatCounterpartyLabel(
  counterpartyType: string,
  counterpartyName: string | null,
): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, counterpartyType)
  return counterpartyName ? `${typeLabel} · ${counterpartyName}` : typeLabel
}

function buildVerificationColumns({
  readOnly,
  onOpenDetail,
  onOpenCancelModal,
}: {
  readOnly: boolean
  onOpenDetail: (verificationId: string) => void
  onOpenCancelModal: (verification: FinanceVerificationListItem) => void
}): ColumnsType<FinanceVerificationListItem> {
  return [
    {
      title: '核销单号',
      dataIndex: 'verificationNo',
      render: (value: string, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => onOpenDetail(record.id)}>
          <Typography.Text code>{value}</Typography.Text>
        </Button>
      ),
    },
    {
      title: '核销日期',
      dataIndex: 'verificationDate',
    },
    {
      title: '核销方向',
      dataIndex: 'direction',
      render: (value: string) => catalogLabel(VERIFICATION_DIRECTION_LABELS, value),
    },
    {
      title: '往来对象',
      key: 'counterparty',
      render: (_: unknown, record) =>
        formatCounterpartyLabel(record.counterpartyType, record.counterpartyName),
    },
    {
      title: '关联发团',
      dataIndex: 'departureNo',
      render: (value: string, record) => (
        <Tooltip title={record.departureName}>
          <span>{value}</span>
        </Tooltip>
      ),
    },
    {
      title: '流水号',
      dataIndex: 'transactionNo',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: '收付款节点编号',
      dataIndex: 'scheduleNo',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: '本次核销金额',
      dataIndex: 'amountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '核销后未结金额',
      dataIndex: 'billUnsettledAfterCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (itemStatus: string) => (
        <Tag color={VERIFICATION_STATUS_COLORS[itemStatus]}>
          {catalogLabel(VERIFICATION_STATUS_LABELS, itemStatus)}
        </Tag>
      ),
    },
    {
      title: '核销人',
      dataIndex: 'createdByName',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (value: string) => new Date(value).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      render: (_: unknown, record: FinanceVerificationListItem) => (
        <Space>
          <Button type="link" onClick={() => onOpenDetail(record.id)}>
            查看
          </Button>
          {!readOnly && record.status === VerificationStatus.NORMAL ? (
            <Button type="link" danger onClick={() => onOpenCancelModal(record)}>
              撤销核销
            </Button>
          ) : null}
        </Space>
      ),
    },
  ]
}

interface VerificationTableProps {
  loading: boolean
  columns: ColumnsType<FinanceVerificationListItem>
  items: FinanceVerificationListItem[]
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number, pageSize: number) => void
}

function VerificationTable({
  loading,
  columns,
  items,
  page,
  pageSize,
  total,
  onPageChange,
}: VerificationTableProps) {
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

export function VerificationsWorkspace({
  scope,
  departureId: lockedDepartureId,
  readOnly = false,
  initialPaymentScheduleId,
  initialTransactionId,
  pageHeader,
}: VerificationsWorkspaceProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<CreateVerificationFormValues>()
  const [cancelForm] = Form.useForm<CancelVerificationFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [detailVerificationId, setDetailVerificationId] = useState<string | null>(null)
  const [cancellingVerification, setCancellingVerification] =
    useState<FinanceVerificationListItem | null>(null)
  const [listState, dispatchList] = useReducer(
    verificationListReducer,
    undefined,
    createInitialVerificationListState,
  )
  const {
    page,
    pageSize,
    dateRange,
    direction,
    status,
    transactionNo,
    scheduleNo,
    departureKeyword,
  } = listState

  const isDepartureScope = scope === 'departure'
  const listQueryKey = isDepartureScope ? 'departure-verifications' : 'finance-verifications'

  const listParams = useMemo(
    () => ({
      page,
      pageSize,
      verificationDateStart: dateRange?.[0],
      verificationDateEnd: dateRange?.[1],
      direction,
      status,
      transactionNo: transactionNo.trim() || undefined,
      scheduleNo: scheduleNo.trim() || undefined,
      departureKeyword: departureKeyword.trim() || undefined,
      paymentScheduleId: initialPaymentScheduleId,
      transactionId: initialTransactionId,
    }),
    [
      page,
      pageSize,
      dateRange,
      direction,
      status,
      transactionNo,
      scheduleNo,
      departureKeyword,
      initialPaymentScheduleId,
      initialTransactionId,
    ],
  )

  const { data: verificationsResult, isLoading } = useQuery({
    queryKey: [
      listQueryKey,
      lockedDepartureId,
      listParams,
    ],
    queryFn: () => {
      if (isDepartureScope) {
        if (!lockedDepartureId) {
          throw new Error('发团 ID 缺失')
        }
        return listDepartureVerifications(lockedDepartureId, listParams)
      }
      return listVerifications(listParams)
    },
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
  })

  const handleOpenDetail = useCallback((verificationId: string) => {
    setDetailVerificationId(verificationId)
    setDetailDrawerOpen(true)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setDetailDrawerOpen(false)
    setDetailVerificationId(null)
  }, [])

  const handleResetFilters = useCallback(() => {
    dispatchList({ type: 'resetFilters' })
  }, [])

  const clearPaymentScheduleFilter = useCallback(() => {
    dispatchList({ type: 'setPage', value: 1 })
    void navigate({
      to: '/finance/verification',
      search: { transactionId: initialTransactionId },
    })
  }, [initialTransactionId, navigate])

  const clearTransactionFilter = useCallback(() => {
    dispatchList({ type: 'setPage', value: 1 })
    void navigate({
      to: '/finance/verification',
      search: { paymentScheduleId: initialPaymentScheduleId },
    })
  }, [initialPaymentScheduleId, navigate])

  const createMutation = useMutation({
    mutationFn: (values: CreateVerificationFormValues) =>
      createVerification(buildCreateVerificationPayload(values)),
    onSuccess: () => {
      message.success('核销已创建')
      setModalOpen(false)
      form.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, cancelReason }: { id: string; cancelReason: string }) =>
      cancelVerification(id, { cancelReason }),
    onSuccess: () => {
      message.success('核销已撤销')
      setCancelModalOpen(false)
      setCancellingVerification(null)
      cancelForm.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-verification'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '撤销失败')
    },
  })

  const handleOpenCancelModal = useCallback((verification: FinanceVerificationListItem) => {
    setCancellingVerification(verification)
    setCancelModalOpen(true)
  }, [])

  const handleCloseCancelModal = useCallback(() => {
    setCancelModalOpen(false)
    setCancellingVerification(null)
    cancelForm.resetFields()
  }, [cancelForm])

  const columns = useMemo(
    () =>
      buildVerificationColumns({
        readOnly,
        onOpenDetail: handleOpenDetail,
        onOpenCancelModal: handleOpenCancelModal,
      }),
    [handleOpenCancelModal, handleOpenDetail, readOnly],
  )

  const createButton = !readOnly ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => {
        setModalOpen(true)
      }}
    >
      新增核销
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

      <VerificationFilters
        scope={scope}
        dateRange={dateRange}
        direction={direction}
        status={status}
        transactionNo={transactionNo}
        scheduleNo={scheduleNo}
        departureKeyword={departureKeyword}
        onDateRangeChange={(value) => {
          dispatchList({ type: 'setDateRange', value })
        }}
        onDirectionChange={(value) => {
          dispatchList({ type: 'setDirection', value })
        }}
        onStatusChange={(value) => {
          dispatchList({ type: 'setStatus', value })
        }}
        onTransactionNoChange={(value) => {
          dispatchList({ type: 'setTransactionNo', value })
        }}
        onScheduleNoChange={(value) => {
          dispatchList({ type: 'setScheduleNo', value })
        }}
        onDepartureKeywordChange={(value) => {
          dispatchList({ type: 'setDepartureKeyword', value })
        }}
        onReset={handleResetFilters}
      />

      {!isDepartureScope && (initialPaymentScheduleId || initialTransactionId) ? (
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <Typography.Text type="secondary">当前筛选：</Typography.Text>
            {initialPaymentScheduleId ? (
              <Tag closable onClose={clearPaymentScheduleFilter}>
                收付款节点 {initialPaymentScheduleId.slice(0, 8)}…
              </Tag>
            ) : null}
            {initialTransactionId ? (
              <Tag closable onClose={clearTransactionFilter}>
                当前流水 {initialTransactionId.slice(0, 8)}…
              </Tag>
            ) : null}
          </Space>
        </div>
      ) : null}

      <VerificationTable
        loading={isLoading}
        columns={columns}
        items={verificationsResult?.items ?? []}
        page={page}
        pageSize={pageSize}
        total={verificationsResult?.total ?? 0}
        onPageChange={(nextPage, nextPageSize) => {
          dispatchList({ type: 'setPage', value: nextPage })
          dispatchList({ type: 'setPageSize', value: nextPageSize })
        }}
      />

      <VerificationDetailDrawer
        open={detailDrawerOpen}
        verificationId={detailVerificationId}
        onClose={handleCloseDetail}
      />

      {!readOnly && modalOpen ? (
        <CreateVerificationDrawer
          key="create-verification"
          open={modalOpen}
          loading={createMutation.isPending}
          form={form}
          lockedDepartureId={isDepartureScope ? lockedDepartureId : undefined}
          onClose={() => {
            setModalOpen(false)
            form.resetFields()
          }}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      ) : null}

      {!readOnly ? (
        <CancelVerificationModal
          open={cancelModalOpen}
          verification={cancellingVerification}
          loading={cancelMutation.isPending}
          form={cancelForm}
          onClose={handleCloseCancelModal}
          onSubmit={(values) => {
            if (!cancellingVerification) {
              return
            }
            cancelMutation.mutate({
              id: cancellingVerification.id,
              cancelReason: values.cancelReason,
            })
          }}
        />
      ) : null}
    </div>
  )
}
