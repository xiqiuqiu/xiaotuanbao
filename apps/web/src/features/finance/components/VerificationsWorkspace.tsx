import { useCallback, useMemo, useState } from 'react'
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
import { VerificationFormDrawer } from './VerificationFormDrawer'
import {
  CancelVerificationModal,
  type CancelVerificationFormValues,
} from './CancelVerificationModal'
import {
  VerificationFilters,
  getDefaultVerificationDateRange,
  type VerificationDateRange,
} from './VerificationFilters'
import { VerificationDetailDrawer } from './VerificationDetailDrawer'
import {
  buildCreateVerificationPayload,
  type VerificationFormValues,
} from '../utils/verification-form'

export type VerificationsWorkspaceProps = {
  scope: 'global' | 'departure'
  departureId?: string
  readOnly?: boolean
  initialPaymentScheduleId?: string
  initialTransactionId?: string
}

function formatCounterpartyLabel(
  counterpartyType: string,
  counterpartyName: string | null,
): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, counterpartyType)
  return counterpartyName ? `${typeLabel} · ${counterpartyName}` : typeLabel
}

export function VerificationsWorkspace({
  scope,
  departureId: lockedDepartureId,
  readOnly = false,
  initialPaymentScheduleId,
  initialTransactionId,
}: VerificationsWorkspaceProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<VerificationFormValues>()
  const [cancelForm] = Form.useForm<CancelVerificationFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [detailVerificationId, setDetailVerificationId] = useState<string | null>(null)
  const [cancellingVerification, setCancellingVerification] =
    useState<FinanceVerificationListItem | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [dateRange, setDateRange] = useState<VerificationDateRange>(
    getDefaultVerificationDateRange(),
  )
  const [direction, setDirection] = useState<string | undefined>()
  const [status, setStatus] = useState<string | undefined>()
  const [transactionNo, setTransactionNo] = useState('')
  const [scheduleNo, setScheduleNo] = useState('')
  const [departureKeyword, setDepartureKeyword] = useState('')

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
    setDateRange(getDefaultVerificationDateRange())
    setDirection(undefined)
    setStatus(undefined)
    setTransactionNo('')
    setScheduleNo('')
    setDepartureKeyword('')
    setPage(1)
  }, [])

  const clearPaymentScheduleFilter = useCallback(() => {
    setPage(1)
    void navigate({
      to: '/finance/verification',
      search: { transactionId: initialTransactionId },
    })
  }, [initialTransactionId, navigate])

  const clearTransactionFilter = useCallback(() => {
    setPage(1)
    void navigate({
      to: '/finance/verification',
      search: { paymentScheduleId: initialPaymentScheduleId },
    })
  }, [initialPaymentScheduleId, navigate])

  const createMutation = useMutation({
    mutationFn: (values: VerificationFormValues) =>
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

  const columns = useMemo<ColumnsType<FinanceVerificationListItem>>(
    () => [
      {
        title: '核销单号',
        dataIndex: 'verificationNo',
        render: (value: string, record) => (
          <Button type="link" style={{ padding: 0 }} onClick={() => handleOpenDetail(record.id)}>
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
        render: (_: unknown, record: FinanceVerificationListItem) => (
          <Space>
            <Button type="link" onClick={() => handleOpenDetail(record.id)}>
              查看
            </Button>
            {!readOnly && record.status === VerificationStatus.NORMAL ? (
              <Button type="link" danger onClick={() => handleOpenCancelModal(record)}>
                撤销核销
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [handleOpenCancelModal, handleOpenDetail, readOnly],
  )

  return (
    <div>
      {!readOnly ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields()
              setModalOpen(true)
            }}
          >
            新建核销
          </Button>
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
          setDateRange(value)
          setPage(1)
        }}
        onDirectionChange={(value) => {
          setDirection(value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatus(value)
          setPage(1)
        }}
        onTransactionNoChange={(value) => {
          setTransactionNo(value)
          setPage(1)
        }}
        onScheduleNoChange={(value) => {
          setScheduleNo(value)
          setPage(1)
        }}
        onDepartureKeywordChange={(value) => {
          setDepartureKeyword(value)
          setPage(1)
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

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={verificationsResult?.items ?? []}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize,
            total: verificationsResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>

      <VerificationDetailDrawer
        open={detailDrawerOpen}
        verificationId={detailVerificationId}
        onClose={handleCloseDetail}
      />

      {!readOnly ? (
        <VerificationFormDrawer
          open={modalOpen}
          loading={createMutation.isPending}
          form={form}
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
