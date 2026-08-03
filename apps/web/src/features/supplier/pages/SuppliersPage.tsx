import { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Button, Card, Form, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupplierSummary } from '@/types/api'
import {
  DirectoryProfileStatus,
  type SupplierAllowedResourceKind,
} from '@xiaotuanbao/shared'
import {
  archiveSupplier,
  createSupplier,
  getSupplier,
  listSuppliers,
  restoreSupplier,
  updateSupplier,
} from '@/services/supplier.service'
import { SupplierFilters } from '../components/SupplierFilters'
import { SupplierFormDrawer } from '../components/SupplierFormDrawer'
import type { SupplierFormValues } from '../components/SupplierProfileSections'
import {
  buildCreatePayload,
  buildUpdatePayload,
  clearInvoiceFieldsWhenUnavailable,
  toFormValues,
} from '../utils/supplier-form'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditSupplier } from '../utils/supplier-permission'
import { PageHeader } from '@/layouts/PageHeader'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import {
  listSoftFetchingClassName,
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { buildSupplierColumns } from './supplier-columns'

export function SuppliersPage() {
  const { message, modal } = App.useApp()
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
  const canEdit = canEditSupplier(useAuthStore((s) => s.actionKeys))

  const listFilterKey = [search, categoryFilter, statusFilter, includeArchived].join('\0')
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const {
    data: suppliersResult,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: [
      'suppliers',
      search,
      categoryFilter,
      statusFilter,
      includeArchived,
      page,
      pageSize,
    ],
    queryFn: ({ signal }) =>
      listSuppliers(
        {
          search: search || undefined,
          category: categoryFilter as SupplierAllowedResourceKind | undefined,
          status: statusFilter,
          includeArchived,
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
    async (supplier: SupplierSummary) => {
      try {
        const full = await getSupplier(supplier.id)
        setEditingSupplier(full)
        form.setFieldsValue(toFormValues(full))
        setDrawerOpen(true)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载供应商失败')
      }
    },
    [form, message],
  )

  const saveMutation = useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      if (editingSupplier) {
        const payload = clearInvoiceFieldsWhenUnavailable(buildUpdatePayload(values))
        return updateSupplier(editingSupplier.id, payload)
      }

      const createPayload = clearInvoiceFieldsWhenUnavailable(buildCreatePayload(values))
      return createSupplier(createPayload)
    },
    onSuccess: () => {
      message.success(editingSupplier ? '供应商已更新' : '供应商已创建')
      const editedId = editingSupplier?.id
      closeDrawer()
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      if (editedId) {
        queryClient.invalidateQueries({ queryKey: ['supplier', editedId] })
      }
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
      message.error(
        error instanceof Error ? error.message : '无法删除供应商。请稍后重试',
      )
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
      modal.confirm({
        title: '确认删除供应商？',
        content: `删除后「${supplier.name}」将从默认列表中隐藏，可在「显示已归档」中恢复。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => archiveMutation.mutateAsync(supplier.id),
      })
    },
    [archiveMutation, modal],
  )

  const handleRestore = useCallback(
    (supplierId: string) => {
      restoreMutation.mutate(supplierId)
    },
    [restoreMutation],
  )

  const columns = useMemo(
    () =>
      buildSupplierColumns(
        includeArchived,
        openEditDrawer,
        handleArchive,
        handleRestore,
        canEdit,
      ),
    [includeArchived, openEditDrawer, handleArchive, handleRestore, canEdit],
  )

  return (
    <div>
      <PageHeader
        title="供应商管理"
        action={
          canEdit ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
              创建供应商
            </Button>
          ) : undefined
        }
      />

      <SupplierFilters
        categoryFilter={categoryFilter}
        statusFilter={statusFilter}
        includeArchived={includeArchived}
        onCategoryChange={(value) => {
          setCategoryFilter(() => value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatusFilter(() => value)
          setPage(1)
        }}
        onIncludeArchivedChange={(value) => {
          setIncludeArchived(() => value)
          setPage(1)
        }}
        onSearch={(value) => {
          setSearch(() => value)
          setPage(1)
        }}
      />

      <StaleDataAlert
        isFetching={isFetching}
        isError={isError}
        hasData={Boolean(suppliersResult)}
        onRefresh={() => {
          void refetch()
        }}
      />

      <Card>
        <Table
          rowKey="id"
          loading={hardLoading}
          columns={columns}
          dataSource={suppliersResult?.items ?? []}
          scroll={{ x: 'max-content' }}
          className={listSoftFetchingClassName(softFetching)}
          pagination={{
            current: page,
            pageSize,
            total: suppliersResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(() => nextPage)
              setPageSize(() => nextPageSize)
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
