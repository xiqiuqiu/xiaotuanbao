import { Alert, Button, Card, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import { listSoftFetchingClassName } from '@/lib/query/list-query-ux'

interface TransactionsWorkspaceTableProps {
  hardLoading: boolean
  softFetching: boolean
  isError: boolean
  error: unknown
  transactionsResult:
    | {
        items: FinanceTransactionSummary[]
        total: number
      }
    | undefined
  columns: ColumnsType<FinanceTransactionSummary>
  page: number
  pageSize: number
  onRefetch: () => void
  onPageChange: (page: number, pageSize: number) => void
}

export function TransactionsWorkspaceTable({
  hardLoading,
  softFetching,
  isError,
  error,
  transactionsResult,
  columns,
  page,
  pageSize,
  onRefetch,
  onPageChange,
}: TransactionsWorkspaceTableProps) {
  return (
    <Card>
      {isError && !transactionsResult ? (
        <Alert
          type="error"
          showIcon
          title="流水列表加载失败"
          description={
            error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'
          }
          action={
            <Button size="small" onClick={onRefetch}>
              重试
            </Button>
          }
        />
      ) : (
        <Table
          rowKey="id"
          loading={hardLoading}
          columns={columns}
          dataSource={transactionsResult?.items ?? []}
          scroll={{ x: 'max-content' }}
          className={listSoftFetchingClassName(softFetching)}
          pagination={{
            current: page,
            pageSize,
            total: transactionsResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: onPageChange,
          }}
        />
      )}
    </Card>
  )
}
