import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Alert, Button, Card, Empty, Table, Tag } from 'antd'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import type { PendingReceivableSourceOrderItem } from '@/types/api'
import { PageHeader } from '@/layouts/PageHeader'
import { listPendingReceivableSourceOrders } from '@/services/source-order.service'
import { formatCents } from '../catalog'

export function PendingReceivableSourceOrdersPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { page?: number; pageSize?: number }
  const page = search.page ?? 1
  const pageSize = search.pageSize ?? 10
  const query = useQuery({
    queryKey: ['source-orders', 'pending-receivables', page, pageSize],
    queryFn: () => listPendingReceivableSourceOrders({
      receivableGeneration: 'not_generated',
      page,
      pageSize,
    }),
  })

  if (query.isError && !query.data) {
    return (
      <div>
        <PageHeader title="待生成应收" />
        <Card>
          <Alert
            type="error"
            showIcon
            title="待生成应收列表加载失败"
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
      <PageHeader title="待生成应收" />
      <Card>
        <StaleDataAlert
          isFetching={query.isFetching}
          isError={query.isError}
          hasData={Boolean(query.data)}
          onRefresh={() => void query.refetch()}
        />
        <Table<PendingReceivableSourceOrderItem>
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data?.items ?? []}
          scroll={{ x: 900 }}
          columns={[
            {
              title: '客源单',
              dataIndex: 'displayName',
              width: 200,
              render: (value, item) => (
                <Button type="link" onClick={() => void navigate({ to: item.href })}>
                  {value}
                </Button>
              ),
            },
            { title: '客户', dataIndex: 'partnerName', width: 140 },
            {
              title: '应收状态',
              width: 110,
              render: () => <Tag color="blue">待生成应收</Tag>,
            },
            {
              title: '结算金额',
              dataIndex: 'netReceivableCents',
              width: 120,
              align: 'right',
              render: (value: number) => formatCents(value),
            },
            { title: '关联发团', dataIndex: 'departureName', width: 180 },
            { title: '发团编号', dataIndex: 'departureNo', width: 150 },
            { title: '出团日期', dataIndex: 'departureStartDate', width: 120 },
          ]}
          locale={{
            emptyText: (
              <Empty description="当前没有待生成应收的客源单">
                <Button onClick={() => void navigate({ to: '/departure' })}>查看发团</Button>
              </Empty>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total: query.data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个客源单`,
            onChange: (nextPage, nextPageSize) => void navigate({
              to: '/source-orders',
              search: {
                receivableGeneration: 'not_generated',
                page: nextPage,
                pageSize: nextPageSize,
              },
            }),
          }}
        />
      </Card>
    </div>
  )
}
