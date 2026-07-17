import { useState } from 'react'
import { Button, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { OrganizationStatus } from '@xiaotuanbao/shared'
import type { PlatformOrganizationProfile } from '@/types/api'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import { PageHeader } from '@/layouts/PageHeader'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import {
  listSoftFetchingClassName,
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { listPlatformOrganizations } from '@/services/platform-organization.service'

export function PlatformOrganizationsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const placeholderData = useListPlaceholderData('')

  const {
    data: result,
    isLoading,
    isFetching,
    isError,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: ['platform-organizations', page, pageSize],
    queryFn: () => listPlatformOrganizations({ page, pageSize }),
    placeholderData,
    ...operationalQueryOptions(),
  })

  const { hardLoading, softFetching } = resolveListTableLoading({
    isLoading,
    isFetching,
    isPlaceholderData,
  })

  const columns: ColumnsType<PlatformOrganizationProfile> = [
    { title: '组织名称', dataIndex: 'name' },
    { title: '业务前缀', dataIndex: 'businessPrefix', width: 120 },
    {
      title: '组织状态',
      dataIndex: 'status',
      width: 100,
      render: (status: PlatformOrganizationProfile['status']) => (
        <Tag color={status === OrganizationStatus.ENABLED ? 'success' : 'default'}>
          {status === OrganizationStatus.ENABLED ? '启用' : '停用'}
        </Tag>
      ),
    },
    ...buildBusinessTimestampColumns<PlatformOrganizationProfile>(),
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          onClick={() =>
            void navigate({
              to: '/platform/organizations/$organizationId',
              params: { organizationId: record.id },
            })
          }
        >
          查看档案
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="客户 Organization 名录" />
      <StaleDataAlert
        isFetching={isFetching}
        isError={isError}
        hasData={Boolean(result)}
        onRefresh={() => {
          void refetch()
        }}
      />
      <Table<PlatformOrganizationProfile>
        rowKey="id"
        className={listSoftFetchingClassName(softFetching)}
        loading={hardLoading}
        columns={columns}
        dataSource={result?.items ?? []}
        pagination={{
          current: page,
          pageSize,
          total: result?.total ?? 0,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage)
            setPageSize(nextPageSize)
          },
        }}
      />
    </div>
  )
}
