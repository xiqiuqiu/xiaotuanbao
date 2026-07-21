import { useState } from 'react'
import { Button, Card, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import type { ProductStatus } from '@xiaotuanbao/shared'
import { listProducts } from '@/services/product.service'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditProduct } from '../utils/product-permission'
import { PageHeader } from '@/layouts/PageHeader'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import {
  listSoftFetchingClassName,
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { CreateProductModal } from '../components/CreateProductModal'
import { ProductFilters, buildProductColumns } from './product-columns'

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProductStatus | undefined>()
  const [includeOffShelf, setIncludeOffShelf] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [createOpen, setCreateOpen] = useState(false)
  const canEdit = canEditProduct(useAuthStore((s) => s.actionKeys))

  const listFilterKey = [search, status, includeOffShelf].join('\0')
  const placeholderData = useListPlaceholderData(listFilterKey)

  const {
    data: productsResult,
    isLoading,
    isFetching,
    isError,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: ['products', search, status, includeOffShelf, page, pageSize],
    queryFn: () =>
      listProducts({
        search: search || undefined,
        status,
        includeOffShelf,
        page,
        pageSize,
      }),
    placeholderData,
    ...operationalQueryOptions(),
  })

  const { hardLoading, softFetching } = resolveListTableLoading({
    isLoading,
    isFetching,
    isPlaceholderData,
  })

  return (
    <>
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
        {isError ? (
          <StaleDataAlert
            isFetching={isFetching}
            isError={isError}
            hasData={Boolean(productsResult)}
            onRefresh={() => {
              void refetch()
            }}
          />
        ) : null}
        <ProductFilters
          search={search}
          status={status}
          includeOffShelf={includeOffShelf}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          onStatusChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
          onIncludeOffShelfChange={(value) => {
            setIncludeOffShelf(value)
            setPage(1)
          }}
        />
        <Table
          rowKey="id"
          className={listSoftFetchingClassName(softFetching)}
          loading={hardLoading}
          columns={buildProductColumns()}
          dataSource={productsResult?.items ?? []}
          pagination={{
            current: page,
            pageSize,
            total: productsResult?.total ?? 0,
            showSizeChanger: true,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage)
              setPageSize(nextSize)
            },
          }}
        />
      </Card>
      <CreateProductModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}
