import { useCallback, useMemo } from 'react'
import { Button, Card, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { FinanceTransactionSummary, TransactionDirection } from '@xiaotuanbao/shared'
import { listTransactions } from '@/services/finance.service'
import { PageHeader } from '@/layouts/PageHeader'
import { useTransactionListState } from '../hooks/useTransactionListState'
import { useTransactionWorkspaceDialogs } from '../hooks/useTransactionWorkspaceDialogs'
import { useTransactionWorkspaceMutations } from '../hooks/useTransactionWorkspaceMutations'
import { TransactionActionDialogs } from './TransactionActionDialogs'
import { TransactionFilters } from './TransactionFilters'
import { buildTransactionColumns } from './transaction-table-columns'

export type TransactionsWorkspaceProps = {
  scope: 'global' | 'departure'
  departureId?: string
  readOnly?: boolean
  /** Departure-tab deep link: optional direction filter from overview「查看流水». */
  initialDirection?: TransactionDirection
  /** Global-page URL deep link (departureId + direction). */
  deepLinkSearch?: {
    departureId?: string
    direction?: string
  }
  pageHeader?: {
    title: string
  }
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
  const isDepartureScope = scope === 'departure'
  const listQueryKey = isDepartureScope ? 'departure-transactions' : 'finance-transactions'

  const { listState, dispatchList, clearDepartureDirectionKey } = useTransactionListState({
    scope,
    initialDirection,
    deepLinkSearch,
  })
  const dialogs = useTransactionWorkspaceDialogs()
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

  const { createMutation, updateMutation, voidMutation, verifyMutation } =
    useTransactionWorkspaceMutations({
      lockedDepartureId,
      editingTransaction: dialogs.editingTransaction,
      form: dialogs.form,
      voidForm: dialogs.voidForm,
      verifyForm: dialogs.verifyForm,
      onCreateOrUpdateSuccess: dialogs.closeTransactionDrawer,
      onVoidSuccess: dialogs.closeVoidModal,
      onVerifySuccess: dialogs.closeVerify,
    })

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

  const handleResetFilters = useCallback(() => {
    dispatchList({ type: 'resetFilters' })
    if (isDepartureScope && lockedDepartureId) {
      clearDepartureDirectionKey()
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: lockedDepartureId },
        search: { tab: 'transactions' },
        replace: true,
      })
    }
  }, [clearDepartureDirectionKey, dispatchList, isDepartureScope, lockedDepartureId, navigate])

  const columns = useMemo(
    () =>
      buildTransactionColumns({
        isDepartureScope,
        readOnly,
        onOpenDetail: dialogs.openDetail,
        onOpenVerify: dialogs.openVerify,
        onEdit: dialogs.openEdit,
        onOpenVoidModal: dialogs.openVoidModal,
        onViewVerifications: handleViewVerifications,
      }),
    [
      dialogs.openDetail,
      dialogs.openEdit,
      dialogs.openVerify,
      dialogs.openVoidModal,
      handleViewVerifications,
      isDepartureScope,
      readOnly,
    ],
  )

  const createButton = !readOnly ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={dialogs.openCreate}>
      新建流水
    </Button>
  ) : null

  return (
    <div>
      {pageHeader ? (
        <PageHeader
          title={pageHeader.title}
          action={createButton}
        />
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
        extra={pageHeader ? undefined : createButton}
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

      <TransactionActionDialogs
        voidModalOpen={dialogs.voidModalOpen}
        voidingTransaction={dialogs.voidingTransaction}
        voidLoading={voidMutation.isPending}
        voidForm={dialogs.voidForm}
        onCloseVoid={dialogs.closeVoidModal}
        onSubmitVoid={(values) => {
          if (!dialogs.voidingTransaction) {
            return
          }
          voidMutation.mutate({
            id: dialogs.voidingTransaction.id,
            voidReason: values.voidReason,
          })
        }}
        drawerOpen={dialogs.drawerOpen}
        drawerMode={dialogs.drawerMode}
        editingTransaction={dialogs.editingTransaction}
        transactionLoading={createMutation.isPending || updateMutation.isPending}
        transactionForm={dialogs.form}
        lockedDepartureId={isDepartureScope ? lockedDepartureId : undefined}
        onCloseTransaction={dialogs.closeTransactionDrawer}
        onSubmitTransaction={(values) => {
          if (dialogs.drawerMode === 'edit') {
            updateMutation.mutate(values)
            return
          }
          createMutation.mutate(values)
        }}
        detailTransactionId={dialogs.detailTransactionId}
        onCloseDetail={dialogs.closeDetail}
        verifyTransaction={dialogs.verifyTransaction}
        verifyLoading={verifyMutation.isPending}
        verifyForm={dialogs.verifyForm}
        onCloseVerify={dialogs.closeVerify}
        onSubmitVerify={(values) => verifyMutation.mutate(values)}
      />
    </div>
  )
}
