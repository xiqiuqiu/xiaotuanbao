import { useEffect, useState } from 'react'
import { Button, Card, Checkbox, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ColumnsType } from 'antd/es/table'
import { ProductStatus, type ProductListItem } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import { PageHeader } from '@/layouts/PageHeader'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import {
  listSoftFetchingClassName,
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import { createProduct, listProducts } from '@/services/product.service'
import { canEditProduct } from '../utils/product-permission'
import { PRODUCT_STATUS_LABELS } from '../utils/product-labels'

export function ProductsPage() {
  const queryClient = useQueryClient()
  const [createForm] = Form.useForm<{ name: string }>()
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductStatus | undefined>()
  const [includeOffline, setIncludeOffline] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const canEdit = canEditProduct(useAuthStore((state) => state.actionKeys))

  const listFilterKey = [search, statusFilter, includeOffline].join('\0')
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const {
    data: productsResult,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: ['products', search, statusFilter, includeOffline, page, pageSize],
    queryFn: ({ signal }) =>
      listProducts(
        {
          search: search || undefined,
          status: statusFilter,
          includeOffline,
          page,
          pageSize,
        },
        signal,
      ),
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

  const createMutation = useMutation({
    mutationFn: (values: { name: string }) => createProduct({ name: values.name.trim() }),
    onSuccess: () => {
      message.success('产品已创建')
      setCreateOpen(false)
      createForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const columns: ColumnsType<ProductListItem> = [
    {
      title: '产品名称',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Link className={nameLinkStyles.nameLink} to="/product/$productId" params={{ productId: record.id }}>
          {name}
        </Link>
      ),
    },
    {
      title: '有效班期',
      dataIndex: 'activeScheduleCount',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: ProductStatus) => {
        const color =
          status === ProductStatus.ON_SALE
            ? 'success'
            : status === ProductStatus.OFFLINE
              ? 'default'
              : 'processing'
        return <Tag color={color}>{PRODUCT_STATUS_LABELS[status]}</Tag>
      },
    },
    {
      title: '起止城市',
      key: 'cities',
      render: (_, record) => {
        if (!record.startCity && !record.endCity) {
          return '-'
        }
        return `${record.startCity ?? '-'} → ${record.endCity ?? '-'}`
      },
    },
    ...buildBusinessTimestampColumns<ProductListItem>(),
  ]

  return (
    <div>
      <PageHeader
        title="产品中心"
        action={
          canEdit ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建产品
            </Button>
          ) : undefined
        }
      />

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="搜索产品名称或城市"
            style={{ width: 240 }}
            onSearch={(value) => {
              setSearch(value.trim())
              setPage(1)
            }}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 140 }}
            value={statusFilter}
            options={Object.values(ProductStatus).map((status) => ({
              value: status,
              label: PRODUCT_STATUS_LABELS[status],
            }))}
            onChange={(value) => {
              setStatusFilter(value)
              setPage(1)
            }}
          />
          <Checkbox
            checked={includeOffline}
            onChange={(event) => {
              setIncludeOffline(event.target.checked)
              setPage(1)
            }}
          >
            含已下架
          </Checkbox>
        </Space>

        <StaleDataAlert
          isFetching={isFetching}
          isError={isError}
          hasData={Boolean(productsResult)}
          onRefresh={() => void refetch()}
        />

        <Table<ProductListItem>
          rowKey="id"
          columns={columns}
          dataSource={productsResult?.items ?? []}
          loading={hardLoading}
          className={listSoftFetchingClassName(softFetching)}
          pagination={{
            current: page,
            pageSize,
            total: productsResult?.total ?? 0,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>

      <Modal
        title="新建产品"
        open={createOpen}
        okText="创建"
        confirmLoading={createMutation.isPending}
        onCancel={() => {
          setCreateOpen(false)
          createForm.resetFields()
        }}
        onOk={() => void createForm.validateFields().then((values) => createMutation.mutate(values))}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="name"
            label="产品名称"
            rules={[{ required: true, message: '请输入产品名称' }]}
          >
            <Input placeholder="如：北疆大巴纯玩 8 日" maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
