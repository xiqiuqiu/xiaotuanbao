import type { ComponentProps, Dispatch, ReactNode } from 'react'
import { Alert, Button, Card, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceVerificationListItem } from '@xiaotuanbao/shared'
import { listSoftFetchingClassName } from '@/lib/query/list-query-ux'
import { PageHeader } from '@/layouts/PageHeader'
import { VerificationFilters } from './VerificationFilters'
import {
  type VerificationListAction,
  type VerificationListState,
} from '../utils/verification-list-state'

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

export function VerificationListContent({
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

export function VerificationWorkspaceFilters({
  scope,
  pageHeader,
  createButton,
  listState,
  dispatchList,
  onTransactionNoChange,
  onScheduleNoChange,
  onReset,
}: {
  scope: 'global' | 'departure'
  pageHeader?: { title: string }
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

export function CreateVerificationButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="primary" icon={<PlusOutlined />} onClick={onClick}>
      新增核销
    </Button>
  )
}
