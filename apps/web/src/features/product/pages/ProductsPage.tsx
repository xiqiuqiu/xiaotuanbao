import { useEffect, useState } from 'react'
import { Button, Card, Dropdown, Form, Input, Modal, Space, Table, Tag, Upload, message } from 'antd'
import { DownloadOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
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
import {
  createProduct,
  createProductImportSession,
  downloadProductPeerPackPdf,
  downloadProductSummaryExcel,
  getProduct,
  listProducts,
} from '@/services/product.service'
import { ProductListFilters } from '../components/ProductListFilters'
import { warnProductExportGaps } from '../utils/product-export-warnings'
import { canEditProduct } from '../utils/product-permission'
import { PRODUCT_STATUS_LABELS } from '../utils/product-labels'
import type { ProductListSearch } from '../utils/product-list-search'

export function ProductsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const listSearch = useSearch({ strict: false }) as ProductListSearch
  const [createForm] = Form.useForm<{ name: string }>()
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductStatus | undefined>()
  const [includeOffline, setIncludeOffline] = useState(false)
  const [importSessionId, setImportSessionId] = useState(listSearch.importSessionId ?? '')
  const [sourceSheetName, setSourceSheetName] = useState(listSearch.sourceSheetName ?? '')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const canEdit = canEditProduct(useAuthStore((state) => state.actionKeys))
  const [exportingSummary, setExportingSummary] = useState(false)
  const [exportingPeerPackId, setExportingPeerPackId] = useState<string | null>(null)

  const exportPeerPackFromList = async (productId: string, priced: boolean) => {
    setExportingPeerPackId(productId)
    try {
      const detail = await getProduct(productId)
      await downloadProductPeerPackPdf(productId, priced)
      warnProductExportGaps(detail)
    } catch {
      // downloadBinary / request 已提示错误
    } finally {
      setExportingPeerPackId(null)
    }
  }

  useEffect(() => {
    setImportSessionId(listSearch.importSessionId ?? '')
    setSourceSheetName(listSearch.sourceSheetName ?? '')
    setPage(1)
  }, [listSearch.importSessionId, listSearch.sourceSheetName])

  const listFilterKey = [
    search,
    statusFilter,
    includeOffline,
    importSessionId,
    sourceSheetName,
  ].join('\0')
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
    queryKey: [
      'products',
      search,
      statusFilter,
      includeOffline,
      importSessionId,
      sourceSheetName,
      page,
      pageSize,
    ],
    queryFn: ({ signal }) =>
      listProducts(
        {
          search: search || undefined,
          status: statusFilter,
          includeOffline,
          importSessionId: importSessionId || undefined,
          sourceSheetName: sourceSheetName || undefined,
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

  const importMutation = useMutation({
    mutationFn: (file: File) => createProductImportSession(file),
    onSuccess: (session) => {
      message.success('解析完成，请确认线路')
      queryClient.setQueryData(['product-import-session', session.id], session)
      void navigate({
        to: '/product/import/$sessionId',
        params: { sessionId: session.id },
      })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '导入失败')
    },
  })

  const syncListSearch = () => {
    void navigate({
      to: '/product',
      search: {
        importSessionId: importSessionId.trim() || undefined,
        sourceSheetName: sourceSheetName.trim() || undefined,
      },
    })
  }

  const columns: ColumnsType<ProductListItem> = [
    {
      title: '产品名称',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Link
          className={nameLinkStyles.nameLink}
          to="/product/$productId"
          params={{ productId: record.id }}
        >
          {name}
        </Link>
      ),
    },
    {
      title: '来源 Sheet',
      dataIndex: 'sourceSheetName',
      width: 180,
      render: (value: string | null) => value || '-',
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
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              {
                key: 'priced',
                label: '有价 PDF',
                onClick: () => void exportPeerPackFromList(record.id, true),
              },
              {
                key: 'unpriced',
                label: '无价 PDF',
                onClick: () => void exportPeerPackFromList(record.id, false),
              },
            ],
          }}
        >
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            loading={exportingPeerPackId === record.id}
          >
            同行资料
          </Button>
        </Dropdown>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="产品中心"
        action={
          <Space>
            <Button
              icon={<DownloadOutlined />}
              loading={exportingSummary}
              onClick={() => {
                setExportingSummary(true)
                void downloadProductSummaryExcel({
                  search: search || undefined,
                  status: statusFilter,
                  importSessionId: importSessionId.trim() || undefined,
                  sourceSheetName: sourceSheetName.trim() || undefined,
                  includeOffline: includeOffline || undefined,
                })
                  .catch(() => {
                    // downloadBinary 已提示错误
                  })
                  .finally(() => setExportingSummary(false))
              }}
            >
              导出总表
            </Button>
            {canEdit ? (
              <>
                <Upload
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    importMutation.mutate(file)
                    return false
                  }}
                >
                  <Button icon={<UploadOutlined />} loading={importMutation.isPending}>
                    导入疆游记
                  </Button>
                </Upload>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新建产品
                </Button>
              </>
            ) : null}
          </Space>
        }
      />

      <Card>
        <ProductListFilters
          statusFilter={statusFilter}
          includeOffline={includeOffline}
          importSessionId={importSessionId}
          sourceSheetName={sourceSheetName}
          onSearch={(value) => {
            setSearch(value.trim())
            setPage(1)
          }}
          onStatusChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
          onIncludeOfflineChange={(value) => {
            setIncludeOffline(value)
            setPage(1)
          }}
          onImportSessionIdChange={setImportSessionId}
          onSourceSheetNameChange={setSourceSheetName}
          onCommitImportFilters={syncListSearch}
        />

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
