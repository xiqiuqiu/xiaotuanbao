import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Form, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { SupplierSummary } from '@/types/api'
import {
  DirectoryProfileStatus,
  InvoiceAvailable,
  type SupplierCategory,
} from '@xiaotuanbao/shared'
import {
  archiveSupplier,
  createSupplier,
  listSuppliers,
  restoreSupplier,
  updateSupplier,
} from '@/services/supplier.service'
import { SupplierFilters } from '../components/SupplierFilters'
import { SupplierFormDrawer } from '../components/SupplierFormDrawer'
import type { SupplierFormValues } from '../components/SupplierProfileSections'
import {
  DIRECTORY_PROFILE_STATUS_LABELS,
  SETTLEMENT_CYCLE_LABELS,
  SETTLEMENT_METHOD_LABELS,
  SUPPLIER_CATEGORY_LABELS,
  catalogLabel,
} from '../catalog'

function toFormValues(supplier: SupplierSummary): SupplierFormValues {
  return {
    name: supplier.name,
    category: supplier.category as SupplierCategory,
    status: supplier.status as DirectoryProfileStatus,
    contactName: supplier.contactName ?? undefined,
    contactPhone: supplier.contactPhone ?? undefined,
    settlementMethod: (supplier.settlementMethod as SupplierFormValues['settlementMethod']) ?? undefined,
    settlementCycle: (supplier.settlementCycle as SupplierFormValues['settlementCycle']) ?? undefined,
    settlementNotes: supplier.settlementNotes ?? undefined,
    referenceQuoteNotes: supplier.referenceQuoteNotes ?? undefined,
    invoiceAvailable: (supplier.invoiceAvailable as SupplierFormValues['invoiceAvailable']) ?? undefined,
    invoiceType: (supplier.invoiceType as SupplierFormValues['invoiceType']) ?? undefined,
    taxRate: supplier.taxRate ?? undefined,
    accountName: supplier.accountName ?? undefined,
    bankName: supplier.bankName ?? undefined,
    bankAccount: supplier.bankAccount ?? undefined,
    businessNotes: supplier.businessNotes ?? undefined,
  }
}

function buildCreatePayload(values: SupplierFormValues) {
  const { status: _status, ...payload } = buildUpdatePayload(values)
  return payload
}

function buildUpdatePayload(values: SupplierFormValues) {
  return {
    name: values.name,
    category: values.category,
    status: values.status ?? DirectoryProfileStatus.ACTIVE,
    contactName: values.contactName,
    contactPhone: values.contactPhone,
    settlementMethod: values.settlementMethod,
    settlementCycle: values.settlementCycle,
    settlementNotes: values.settlementNotes,
    referenceQuoteNotes: values.referenceQuoteNotes,
    invoiceAvailable: values.invoiceAvailable,
    invoiceType: values.invoiceType,
    taxRate: values.taxRate,
    accountName: values.accountName,
    bankName: values.bankName,
    bankAccount: values.bankAccount,
    businessNotes: values.businessNotes,
  }
}

function buildColumns(
  includeArchived: boolean,
  onEdit: (supplier: SupplierSummary) => void,
  onArchive: (supplier: SupplierSummary) => void,
  onRestore: (supplierId: string) => void,
): ColumnsType<SupplierSummary> {
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
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => {
        if (includeArchived && record.status === DirectoryProfileStatus.ARCHIVED) {
          return (
            <Button type="link" onClick={() => onRestore(record.id)}>
              恢复
            </Button>
          )
        }

        if (record.status === DirectoryProfileStatus.ARCHIVED) {
          return null
        }

        return (
          <Space>
            <Button type="link" onClick={() => onEdit(record)}>
              编辑
            </Button>
            <Button type="link" danger onClick={() => onArchive(record)}>
              删除
            </Button>
          </Space>
        )
      },
    },
  ]
}

export function SuppliersPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<SupplierFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierSummary | null>(null)
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
    setEditingSupplier(null)
    form.resetFields()
  }

  const openCreateDrawer = () => {
    setEditingSupplier(null)
    form.resetFields()
    form.setFieldsValue({ status: DirectoryProfileStatus.ACTIVE })
    setDrawerOpen(true)
  }

  const openEditDrawer = useCallback(
    (supplier: SupplierSummary) => {
      setEditingSupplier(supplier)
      form.setFieldsValue(toFormValues(supplier))
      setDrawerOpen(true)
    },
    [form],
  )

  const saveMutation = useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      if (editingSupplier) {
        const payload = buildUpdatePayload(values)
        if (payload.invoiceAvailable === InvoiceAvailable.NO) {
          payload.invoiceType = undefined
          payload.taxRate = undefined
        }
        return updateSupplier(editingSupplier.id, payload)
      }

      const createPayload = buildCreatePayload(values)
      if (createPayload.invoiceAvailable === InvoiceAvailable.NO) {
        createPayload.invoiceType = undefined
        createPayload.taxRate = undefined
      }
      return createSupplier(createPayload)
    },
    onSuccess: () => {
      message.success(editingSupplier ? '供应商已更新' : '供应商已创建')
      closeDrawer()
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: archiveSupplier,
    onSuccess: () => {
      message.success('供应商已删除')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除失败')
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restoreSupplier,
    onSuccess: () => {
      message.success('供应商已恢复')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '恢复失败')
    },
  })

  const handleArchive = useCallback(
    (supplier: SupplierSummary) => {
      Modal.confirm({
        title: '确认删除供应商？',
        content: `删除后「${supplier.name}」将从默认列表中隐藏，可在「显示已归档」中恢复。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => archiveMutation.mutateAsync(supplier.id),
      })
    },
    [archiveMutation],
  )

  const handleRestore = useCallback(
    (supplierId: string) => {
      restoreMutation.mutate(supplierId)
    },
    [restoreMutation],
  )

  const columns = useMemo(
    () => buildColumns(includeArchived, openEditDrawer, handleArchive, handleRestore),
    [includeArchived, openEditDrawer, handleArchive, handleRestore],
  )

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
          columns={columns}
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

      <SupplierFormDrawer
        open={drawerOpen}
        editing={Boolean(editingSupplier)}
        loading={saveMutation.isPending}
        form={form}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}
