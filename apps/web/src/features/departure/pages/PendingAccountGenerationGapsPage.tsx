import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Alert, Button, Card, Empty, Table, Tag } from 'antd'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import type { AccountGenerationGapItem } from '@/types/api'
import { PageHeader } from '@/layouts/PageHeader'
import { listAccountGenerationGaps } from '@/services/account-generation-gap.service'
import { formatCents } from '@/features/finance/catalog'

export function PendingAccountGenerationGapsPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { page?: number; pageSize?: number }
  const page = search.page ?? 1
  const pageSize = search.pageSize ?? 10
  const query = useQuery({
    queryKey: ['account-generation-gaps', page, pageSize],
    queryFn: () => listAccountGenerationGaps({ page, pageSize }),
  })

  if (query.isError && !query.data) {
    return (
      <div>
        <PageHeader title="待生成账款" />
        <Card>
          <Alert
            type="error"
            showIcon
            title="待生成账款列表加载失败"
            description={query.error instanceof Error ? query.error.message : '请稍后重试'}
            action={(
              <Button loading={query.isFetching} onClick={() => void query.refetch()}>
                重试
              </Button>
            )}
          />
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="待生成账款" />
      <Card>
        <StaleDataAlert
          isFetching={query.isFetching}
          isError={query.isError}
          hasData={Boolean(query.data)}
          onRefresh={() => void query.refetch()}
        />
        <Table<AccountGenerationGapItem>
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data?.items ?? []}
          scroll={{ x: 900 }}
          columns={[
            {
              title: '类型',
              dataIndex: 'generationKind',
              width: 110,
              render: (value: AccountGenerationGapItem['generationKind']) => (
                <Tag color={value === 'receivable' ? 'blue' : 'orange'}>
                  {value === 'receivable' ? '待应收' : '待应付'}
                </Tag>
              ),
            },
            {
              title: '来源对象',
              dataIndex: 'title',
              width: 220,
              render: (value, item) => (
                <Button type="link" onClick={() => void navigate({ to: item.href })}>
                  {value}
                </Button>
              ),
            },
            {
              title: '预计金额',
              dataIndex: 'estimatedAmountCents',
              width: 120,
              align: 'right',
              render: (value: number) => formatCents(value),
            },
            { title: '关联发团', dataIndex: 'departureName', width: 180 },
            { title: '发团编号', dataIndex: 'departureNo', width: 150 },
            {
              title: '发团状态',
              width: 120,
              render: (_, item) => (
                item.departureClosed ? <Tag>发团已关闭</Tag> : <span>-</span>
              ),
            },
          ]}
          locale={{
            emptyText: (
              <Empty description="当前没有待生成的应收或应付">
                <Button onClick={() => void navigate({ to: '/departure' })}>查看发团</Button>
              </Empty>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total: query.data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 项`,
            onChange: (nextPage, nextPageSize) => {
              void navigate({
                to: '/departure/account-generation-gaps',
                search: { page: nextPage, pageSize: nextPageSize },
              })
            },
          }}
        />
      </Card>
    </div>
  )
}
