import { useState } from 'react'
import { App, Button, Form, Table, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  createPlatformOrganization,
  listPlatformOrganizations,
} from '@/services/platform-organization.service'
import {
  CreatePlatformOrganizationDrawer,
  type CreatePlatformOrganizationFormValues,
} from './CreatePlatformOrganizationDrawer'

export function PlatformOrganizationsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<CreatePlatformOrganizationFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  const closeDrawer = () => {
    setDrawerOpen(false)
    form.resetFields()
  }

  const createMutation = useMutation({
    mutationFn: (values: CreatePlatformOrganizationFormValues) =>
      createPlatformOrganization({
        name: values.name.trim(),
        businessPrefix: values.businessPrefix.trim().toUpperCase(),
        adminUsername: values.adminUsername.trim(),
        adminName: values.adminName.trim(),
        adminPassword: values.adminPassword,
      }),
    onSuccess: () => {
      message.success('客户 Organization 已创建')
      closeDrawer()
      void queryClient.invalidateQueries({ queryKey: ['platform-organizations'] })
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : '创建失败'
      if (errorMessage.includes('组织名称')) {
        form.setFields([{ name: 'name', errors: [errorMessage] }])
        return
      }
      if (errorMessage.includes('业务前缀') || errorMessage.includes('组织业务前缀')) {
        form.setFields([{ name: 'businessPrefix', errors: [errorMessage] }])
        return
      }
      if (errorMessage.includes('用户名')) {
        form.setFields([{ name: 'adminUsername', errors: [errorMessage] }])
        return
      }
      message.error(errorMessage)
    },
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
      <PageHeader
        title="客户 Organization 名录"
        action={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields()
              setDrawerOpen(true)
            }}
          >
            创建 Organization
          </Button>
        }
      />
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
      <CreatePlatformOrganizationDrawer
        open={drawerOpen}
        loading={createMutation.isPending}
        form={form}
        onClose={closeDrawer}
        onSubmit={(values) => {
          createMutation.mutate(values)
        }}
      />
    </div>
  )
}
