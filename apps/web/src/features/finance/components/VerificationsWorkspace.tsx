import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { Button, Card, Form, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import {
  VerificationStatus,
  type FinanceVerificationListItem,
} from '@xiaotuanbao/shared'
import {
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
import { type CreateVerificationFormValues } from '../utils/verification-form'
import {
  buildVerificationListMatchParams,
  resolveVerificationDeepLinkSearch,
  type VerificationDeepLinkSearch,
} from '../utils/verification-list-deep-link'
import {
  createInitialVerificationListState,
  createVerificationListReducer,
} from '../utils/verification-list-state'
import { useVerificationWorkspaceMutations } from '../hooks/useVerificationWorkspaceMutations'

export type VerificationsWorkspaceProps = {
  scope: 'global' | 'departure'
  departureId?: string
  readOnly?: boolean
  deepLinkSearch?: VerificationDeepLinkSearch
  /** When set, renders the standard list page header (title + secondary). */
  pageHeader?: {
    title: string
    description: string
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
  isDepartureScope,
  readOnly,
  onOpenDetail,
  onOpenCancelModal,
}: {
  isDepartureScope: boolean
  readOnly: boolean
  onOpenDetail: (verificationId: string) => void
  onOpenCancelModal: (verification: FinanceVerificationListItem) => void
}): ColumnsType<FinanceVerificationListItem> {
  const columns: ColumnsType<FinanceVerificationListItem> = [
    {
      title: '核销单号',
      dataIndex: 'verificationNo',
      render: (value: string, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => onOpenDetail(record.id)}>
          {value}
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
  ]

  if (!isDepartureScope) {
    columns.push({
      title: '关联发团',
      dataIndex: 'departureName',
      render: (value: string, record) => (
        <Tooltip title={record.departureNo}>
          <Link to="/departure/$departureId" params={{ departureId: record.departureId }}>
            {value || record.departureNo}
          </Link>
        </Tooltip>
      ),
    })
  }

  columns.push(
    {
      title: '流水号',
      dataIndex: 'transactionNo',
    },
    {
      title: '收付款节点编号',
      dataIndex: 'scheduleNo',
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
  )

  return columns
}

function VerificationTable({
  loading,
  columns,
  items,
  page,
  pageSize,
  total,
  onPageChange,
}: {
  loading: boolean
  columns: ColumnsType<FinanceVerificationListItem>
  items: FinanceVerificationListItem[]
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number, pageSize: number) => void
}) {
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

function deepLinkKey(search?: VerificationDeepLinkSearch): string {
  const resolved = resolveVerificationDeepLinkSearch(search ?? {})
  if (resolved.transactionNo) {
    return `tx:${resolved.transactionNo}`
  }
  if (resolved.scheduleNo) {
    return `sch:${resolved.scheduleNo}`
  }
  return ''
}

export function VerificationsWorkspace({
  scope,
  departureId: lockedDepartureId,
  readOnly = false,
  deepLinkSearch,
  pageHeader,
}: VerificationsWorkspaceProps) {
  const navigate = useNavigate()
  const [form] = Form.useForm<CreateVerificationFormValues>()
  const [cancelForm] = Form.useForm<CancelVerificationFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [detailVerificationId, setDetailVerificationId] = useState<string | null>(null)
  const reducer = useMemo(() => createVerificationListReducer(scope), [scope])
  const [listState, dispatchList] = useReducer(reducer, deepLinkSearch, (search) =>
    createInitialVerificationListState(search, scope),
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
    lock,
  } = listState

  const isDepartureScope = scope === 'departure'
  const listQueryKey = isDepartureScope ? 'departure-verifications' : 'finance-verifications'
  const currentDeepLinkKey = deepLinkKey(deepLinkSearch)

  useEffect(() => {
    if (!currentDeepLinkKey) {
      return
    }
    dispatchList({ type: 'applyDeepLink', search: deepLinkSearch ?? {} })
  }, [currentDeepLinkKey, deepLinkSearch])

  const syncDeepLinkSearch = useCallback(
    (nextSearch: VerificationDeepLinkSearch) => {
      if (isDepartureScope) {
        if (!lockedDepartureId) {
          return
        }
        void navigate({
          to: '/departure/$departureId',
          params: { departureId: lockedDepartureId },
          search: {
            tab: 'verifications',
            ...nextSearch,
          },
          replace: true,
        })
        return
      }
      void navigate({
        to: '/finance/verification',
        search: nextSearch,
        replace: true,
      })
    },
    [isDepartureScope, lockedDepartureId, navigate],
  )

  const listParams = useMemo(() => {
    const matchParams = buildVerificationListMatchParams({
      transactionNo,
      scheduleNo,
      lock,
    })
    return {
      page,
      pageSize,
      verificationDateStart: dateRange?.[0],
      verificationDateEnd: dateRange?.[1],
      direction,
      status,
      departureKeyword: departureKeyword.trim() || undefined,
      ...matchParams,
    }
  }, [
    page,
    pageSize,
    dateRange,
    direction,
    status,
    transactionNo,
    scheduleNo,
    departureKeyword,
    lock,
  ])

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
    syncDeepLinkSearch({})
  }, [syncDeepLinkSearch])

  const handleTransactionNoChange = useCallback(
    (value: string) => {
      dispatchList({ type: 'setTransactionNo', value })
      if (lock) {
        syncDeepLinkSearch({})
      }
    },
    [lock, syncDeepLinkSearch],
  )

  const handleScheduleNoChange = useCallback(
    (value: string) => {
      dispatchList({ type: 'setScheduleNo', value })
      if (lock) {
        syncDeepLinkSearch({})
      }
    },
    [lock, syncDeepLinkSearch],
  )

  const {
    createMutation,
    cancelMutation,
    cancellingVerification,
    openCancelModal,
    closeCancelModal,
  } = useVerificationWorkspaceMutations({
    form,
    cancelForm,
    onCreateSuccess: () => setModalOpen(false),
    onCancelSuccess: () => setCancelModalOpen(false),
  })

  const handleOpenCancelModal = useCallback(
    (verification: FinanceVerificationListItem) => {
      openCancelModal(verification)
      setCancelModalOpen(true)
    },
    [openCancelModal],
  )

  const handleCloseCancelModal = useCallback(() => {
    setCancelModalOpen(false)
    closeCancelModal()
  }, [closeCancelModal])

  const columns = useMemo(
    () =>
      buildVerificationColumns({
        isDepartureScope,
        readOnly,
        onOpenDetail: handleOpenDetail,
        onOpenCancelModal: handleOpenCancelModal,
      }),
    [handleOpenCancelModal, handleOpenDetail, isDepartureScope, readOnly],
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
        <div style={{ marginBottom: 16 }}>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            {pageHeader.title}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {pageHeader.description}
          </Typography.Paragraph>
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
        onTransactionNoChange={handleTransactionNoChange}
        onScheduleNoChange={handleScheduleNoChange}
        onDepartureKeywordChange={(value) => {
          dispatchList({ type: 'setDepartureKeyword', value })
        }}
        onReset={handleResetFilters}
        extra={createButton}
      />

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
