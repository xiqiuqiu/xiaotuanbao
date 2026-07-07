import { useState } from 'react'
import { Button, Card, Form, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { SupplierSummary } from '@/types/api'
import { DirectoryProfileStatus, type SupplierCategory } from '@xiaotuanbao/shared'
import { createSupplier, listSuppliers } from '@/services/supplier.service'
import { SupplierCreateDrawer } from '../components/SupplierCreateDrawer'
import { SupplierFilters } from '../components/SupplierFilters'
import type { SupplierFormValues } from '../components/SupplierProfileSections'
import {
  DIRECTORY_PROFILE_STATUS_LABELS,
  SETTLEMENT_CYCLE_LABELS,
  SETTLEMENT_METHOD_LABELS,
  SUPPLIER_CATEGORY_LABELS,
  catalogLabel,
} from '../catalog'

function buildColumns(): ColumnsType<SupplierSummary> {
  return [
    {
      title: '供应商名称',
      dataIndex: 'name',
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    {
      title: '类别',
      dataIndex: 'category',
      render: (category: string) => catalogLabel(SUPPLIER_CATEGORY_LABELS, category),
    },
    { title: '主联系人', dataIndex: 'contactName', render: (value) => value ?? '—' },
    { title: '联系方式', dataIndex: 'contactPhone', render: (value) => value ?? '—' },
    {
      title: '结算方式',
      dataIndex: 'settlementMethod',
      render: (value: string | null) => catalogLabel(SETTLEMENT_METHOD_LABELS, value),
    },
    {
      title: '账期规则',
      dataIndex: 'settlementCycle',
      render: (value: string | null) => catalogLabel(SETTLEMENT_CYCLE_LABELS, value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => {
        const color =
          status === DirectoryProfileStatus.ACTIVE
            ? 'success'
            : status === DirectoryProfileStatus.ARCHIVED
              ? 'default'
              : 'warning'
        return <Tag color={color}>{DIRECTORY_PROFILE_STATUS_LABELS[status] ?? status}</Tag>
      },
    },
  ]
}

export function SuppliersPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<SupplierFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<DirectoryProfileStatus | undefined>()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: suppliersResult, isLoading } = useQuery({
    queryKey: [
      'suppliers',
      search,
      categoryFilter,
      statusFilter,
      includeArchived,
      page,
      pageSize,
    ],
    queryFn: () =>
      listSuppliers({
        search: search || undefined,
        category: categoryFilter as SupplierCategory | undefined,
        status: statusFilter,
        includeArchived,
        page,
        pageSize,
      }),
  })

  const closeDrawer = () => {
    setDrawerOpen(false)
    form.resetFields()
  }

  const openCreateDrawer = () => {
    form.resetFields()
    setDrawerOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      message.success('供应商已创建')
      closeDrawer()
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            供应商管理
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            维护自营资源供应商档案
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
          创建供应商
        </Button>
      </div>

      <SupplierFilters
        categoryFilter={categoryFilter}
        statusFilter={statusFilter}
        includeArchived={includeArchived}
        onCategoryChange={(value) => {
          setCategoryFilter(value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatusFilter(value)
          setPage(1)
        }}
        onIncludeArchivedChange={(value) => {
          setIncludeArchived(value)
          setPage(1)
        }}
        onSearch={(value) => {
          setSearch(value)
          setPage(1)
        }}
      />

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={buildColumns()}
          dataSource={suppliersResult?.items ?? []}
          pagination={{
            current: page,
            pageSize,
            total: suppliersResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>

      <SupplierCreateDrawer
        open={drawerOpen}
        loading={saveMutation.isPending}
        form={form}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}
