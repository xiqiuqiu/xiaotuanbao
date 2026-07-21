import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
} from 'react'
import { Alert, Button, Card, Form, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceVerificationListItem } from '@xiaotuanbao/shared'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  listSoftFetchingClassName,
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { PageHeader } from '@/layouts/PageHeader'
import {
  listDepartureVerifications,
  listVerifications,
} from '@/services/finance.service'
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
  type VerificationListAction,
  type VerificationListState,
} from '../utils/verification-list-state'
import { useVerificationWorkspaceMutations } from '../hooks/useVerificationWorkspaceMutations'
import { useVerificationDeepLinkSync } from '../hooks/useVerificationDeepLinkSync'
import { buildVerificationColumns } from './verification-table-columns'

export type VerificationsWorkspaceProps = {
  scope: 'global' | 'departure'
  departureId?: string
  readOnly?: boolean
  deepLinkSearch?: VerificationDeepLinkSearch
  /** When set, renders the standard list page header (title + secondary). */
  pageHeader?: {
    title: string
  }
}

function VerificationTable({
  loading,
  softFetching = false,
  columns,
  items,
  page,
  pageSize,
  total,
  onPageChange,
}: {
  loading: boolean
  softFetching?: boolean
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
        className={listSoftFetchingClassName(softFetching)}
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

function VerificationListContent({
  isError,
  error,
  onRetry,
  hasData,
  ...tableProps
}: ComponentProps<typeof VerificationTable> & {
  isError: boolean
  error: unknown
  onRetry: () => void
  hasData: boolean
}) {
  if (isError && !hasData) {
    return (
      <Card>
        <Alert
          type="error"
          showIcon
          title="核销列表加载失败"
          description={
            error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'
          }
          action={
            <Button size="small" onClick={onRetry}>
              重试
            </Button>
          }
        />
      </Card>
    )
  }

  return <VerificationTable {...tableProps} />
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

function VerificationWorkspaceFilters({
  scope,
  pageHeader,
  createButton,
  listState,
  dispatchList,
  onTransactionNoChange,
  onScheduleNoChange,
  onReset,
}: {
  scope: VerificationsWorkspaceProps['scope']
  pageHeader: VerificationsWorkspaceProps['pageHeader']
  createButton: ReactNode
  listState: VerificationListState
  dispatchList: Dispatch<VerificationListAction>
  onTransactionNoChange: (value: string) => void
  onScheduleNoChange: (value: string) => void
  onReset: () => void
}) {
  return (
    <>
      {pageHeader ? <PageHeader title={pageHeader.title} action={createButton} /> : null}
      <VerificationFilters
        scope={scope}
        dateRange={listState.dateRange}
        direction={listState.direction}
        status={listState.status}
        transactionNo={listState.transactionNo}
        scheduleNo={listState.scheduleNo}
        departureKeyword={listState.departureKeyword}
        onDateRangeChange={(value) => dispatchList({ type: 'setDateRange', value })}
        onDirectionChange={(value) => dispatchList({ type: 'setDirection', value })}
        onStatusChange={(value) => dispatchList({ type: 'setStatus', value })}
        onTransactionNoChange={onTransactionNoChange}
        onScheduleNoChange={onScheduleNoChange}
        onDepartureKeywordChange={(value) =>
          dispatchList({ type: 'setDepartureKeyword', value })
        }
        onReset={onReset}
        extra={pageHeader ? undefined : createButton}
      />
    </>
  )
}

function CreateVerificationButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="primary" icon={<PlusOutlined />} onClick={onClick}>
      新增核销
    </Button>
  )
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
  const debouncedTransactionNo = useDebouncedValue(transactionNo.trim())
  const debouncedScheduleNo = useDebouncedValue(scheduleNo.trim())
  const debouncedDepartureKeyword = useDebouncedValue(departureKeyword.trim())

  useVerificationDeepLinkSync({
    currentDeepLinkKey,
    deepLinkSearch,
    lock,
    dispatchList,
  })

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
      transactionNo: debouncedTransactionNo,
      scheduleNo: debouncedScheduleNo,
      lock,
    })
    return {
      page,
      pageSize,
      verificationDateStart: dateRange?.[0],
      verificationDateEnd: dateRange?.[1],
      direction,
      status,
      departureKeyword: debouncedDepartureKeyword || undefined,
      ...matchParams,
    }
  }, [
    page,
    pageSize,
    dateRange,
    direction,
    status,
    debouncedTransactionNo,
    debouncedScheduleNo,
    debouncedDepartureKeyword,
    lock,
  ])

  const listFilterKey = useMemo(() => {
    const { page: _page, pageSize: _pageSize, ...filters } = listParams
    return JSON.stringify({ lockedDepartureId, ...filters })
  }, [listParams, lockedDepartureId])
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const {
    data: verificationsResult,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    isPlaceholderData,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      listQueryKey,
      lockedDepartureId,
      listParams,
    ],
    queryFn: ({ signal }) => {
      if (isDepartureScope) {
        if (!lockedDepartureId) {
          throw new Error('发团 ID 缺失')
        }
        return listDepartureVerifications(lockedDepartureId, listParams, signal)
      }
      return listVerifications(listParams, signal)
    },
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
    placeholderData,
    ...operationalQueryOptions(),
  })

  useEffect(() => {
    commitListFilterKey(isSuccess, isPlaceholderData)
  }, [commitListFilterKey, isSuccess, isPlaceholderData])

  const { hardLoading, softFetching } = resolveListTableLoading({
    isLoading,
    isFetching,
    isPlaceholderData,
  })

  const handleOpenDetail = useCallback((verificationId: string) => {
    setDetailVerificationId(() => verificationId)
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
      openCancelModal({ ...verification })
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
    <CreateVerificationButton onClick={() => setModalOpen(true)} />
  ) : null

  return (
    <div>
      <VerificationWorkspaceFilters
        scope={scope}
        pageHeader={pageHeader}
        createButton={createButton}
        listState={listState}
        dispatchList={dispatchList}
        onTransactionNoChange={handleTransactionNoChange}
        onScheduleNoChange={handleScheduleNoChange}
        onReset={handleResetFilters}
      />

      <StaleDataAlert
        isFetching={isFetching}
        isError={isError && Boolean(verificationsResult)}
        hasData={Boolean(verificationsResult)}
        onRefresh={() => {
          void refetch()
        }}
      />

      <VerificationListContent
        isError={isError}
        error={error}
        hasData={Boolean(verificationsResult)}
        onRetry={() => void refetch()}
        loading={hardLoading}
        softFetching={softFetching}
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
