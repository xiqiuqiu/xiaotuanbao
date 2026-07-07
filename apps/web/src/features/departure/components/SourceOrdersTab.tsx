import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import {
  SourceOrderCollectionMode,
  DirectoryProfileStatus,
} from '@xiaotuanbao/shared'
import { listPartners } from '@/services/partner.service'
import {
  createSourceOrder,
  deleteSourceOrder,
  listSourceOrders,
  updateSourceOrder,
} from '@/services/source-order.service'
import {
  SOURCE_ORDER_COLLECTION_LABELS,
  SOURCE_ORDER_COLLECTION_OPTIONS,
  SOURCE_ORDER_RECEIVABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { SourceOrderDrawer } from './SourceOrderDrawer'
import { SourceOrderGuestDrawer } from './SourceOrderGuestDrawer'
import type { SourceOrderFormValues } from '../utils/source-order-form'
import { formValuesToPayload } from '../utils/source-order-form'

interface SourceOrdersTabProps {
  departure: DepartureDetail
  readOnly: boolean
}

export function SourceOrdersTab({ departure, readOnly }: SourceOrdersTabProps) {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<SourceOrderFormValues>()
  const [partnerFilter, setPartnerFilter] = useState<string>()
  const [collectionFilter, setCollectionFilter] = useState<SourceOrderCollectionMode>()
  const [hasDiscountFilter, setHasDiscountFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [keyword, setKeyword] = useState('')
  const [appliedFilters, setAppliedFilters] = useState({
    partnerId: undefined as string | undefined,
    collectionMode: undefined as SourceOrderCollectionMode | undefined,
    hasDiscount: 'all' as 'all' | 'yes' | 'no',
    keyword: '',
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [guestDrawerOpen, setGuestDrawerOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<SourceOrderSummary | null>(null)
  const [viewOnly, setViewOnly] = useState(false)
  const [guestOrder, setGuestOrder] = useState<SourceOrderSummary | null>(null)

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'source-order-filter'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
  })

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['source-orders', departure.id, appliedFilters],
    queryFn: () =>
      listSourceOrders(departure.id, {
        partnerId: appliedFilters.partnerId,
        collectionMode: appliedFilters.collectionMode,
        hasDiscount: appliedFilters.hasDiscount,
        keyword: appliedFilters.keyword || undefined,
      }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['source-orders', departure.id] })
    queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formValuesToPayload>) => {
      if (editingOrder) {
        return updateSourceOrder(editingOrder.id, payload)
      }
      return createSourceOrder(departure.id, payload)
    },
    onSuccess: () => {
      message.success(editingOrder ? '客源单已更新' : '客源单已添加')
      setDrawerOpen(false)
      setEditingOrder(null)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSourceOrder(id),
    onSuccess: () => {
      message.success('客源单已删除')
      invalidate()
    },
  })

  const columns: ColumnsType<SourceOrderSummary> = useMemo(
    () => [
      { title: '客源单', dataIndex: 'displayName', width: 200 },
      { title: '客户', dataIndex: 'partnerName', width: 140 },
      { title: '客人人数', dataIndex: 'guestCount', width: 90 },
      {
        title: '原始团款单价',
        dataIndex: 'unitPriceCents',
        width: 120,
        render: (value: number) => formatCents(value),
      },
      {
        title: '原始应收',
        dataIndex: 'grossReceivableCents',
        width: 110,
        render: (value: number) => formatCents(value),
      },
      {
        title: '优惠金额',
        dataIndex: 'discountCents',
        width: 100,
        render: (value: number) => formatCents(value),
      },
      {
        title: '结算金额',
        dataIndex: 'netReceivableCents',
        width: 110,
        render: (value: number) => formatCents(value),
      },
      {
        title: '客户已收',
        dataIndex: 'partnerCollectedCents',
        width: 100,
        render: (value: number) => formatCents(value),
      },
      {
        title: '我方代收',
        dataIndex: 'guestCollectCents',
        width: 100,
        render: (value: number) => formatCents(value),
      },
      {
        title: '收款方式',
        dataIndex: 'collectionMode',
        width: 150,
        render: (value: string) => catalogLabel(SOURCE_ORDER_COLLECTION_LABELS, value),
      },
      {
        title: '应收状态',
        dataIndex: 'receivableStatus',
        width: 100,
        render: (value: string) => (
          <Tag>{catalogLabel(SOURCE_ORDER_RECEIVABLE_STATUS_LABELS, value)}</Tag>
        ),
      },
      {
        title: '备注',
        dataIndex: 'notes',
        ellipsis: true,
        render: (value: string | null) => value ?? '—',
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 220,
        render: (_: unknown, record: SourceOrderSummary) => (
          <Space size="small" wrap>
            <Button
              type="link"
              size="small"
              onClick={() => {
                setEditingOrder(record)
                setViewOnly(true)
                setDrawerOpen(true)
              }}
            >
              查看
            </Button>
            {!readOnly ? (
              <>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setEditingOrder(record)
                    setViewOnly(false)
                    setDrawerOpen(true)
                  }}
                >
                  编辑
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setGuestOrder(record)
                    setGuestDrawerOpen(true)
                  }}
                >
                  客人名单
                </Button>
                <Button type="link" size="small" disabled title="将在后续版本实现">
                  生成应收
                </Button>
                {!record.hasPaymentSchedule ? (
                  <Popconfirm
                    title="确认删除该客源单？"
                    onConfirm={() => deleteMutation.mutate(record.id)}
                  >
                    <Button type="link" size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                ) : null}
              </>
            ) : null}
          </Space>
        ),
      },
    ],
    [deleteMutation, readOnly],
  )

  const summary = listResult?.summary

  return (
    <div>
      {summary ? (
        <Typography.Paragraph style={{ marginBottom: 16 }}>
          <Typography.Text strong>
            客源{summary.orderCount}单
          </Typography.Text>
          {' · '}
          总人数{summary.totalGuests}人
          {' · '}
          客户{summary.partnerCount}家
          {' · '}
          优惠 {formatCents(summary.totalDiscountCents)}
          {' · '}
          结算金额 {formatCents(summary.totalNetReceivableCents)}
          {' · '}
          我方代收 {formatCents(summary.totalGuestCollectCents)}
        </Typography.Paragraph>
      ) : null}

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="客户"
            style={{ width: 180 }}
            showSearch
            optionFilterProp="label"
            value={partnerFilter}
            onChange={setPartnerFilter}
            options={partnersResult?.items.map((partner) => ({
              value: partner.id,
              label: partner.name,
            }))}
          />
          <Select
            allowClear
            placeholder="收款方式"
            style={{ width: 180 }}
            value={collectionFilter}
            onChange={setCollectionFilter}
            options={[...SOURCE_ORDER_COLLECTION_OPTIONS]}
          />
          <Select
            style={{ width: 120 }}
            value={hasDiscountFilter}
            onChange={setHasDiscountFilter}
            options={[
              { value: 'all', label: '全部优惠' },
              { value: 'yes', label: '有优惠' },
              { value: 'no', label: '无优惠' },
            ]}
          />
          <Input
            allowClear
            placeholder="搜索客户名称、备注"
            style={{ width: 220 }}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Button
            type="primary"
            onClick={() =>
              setAppliedFilters({
                partnerId: partnerFilter,
                collectionMode: collectionFilter,
                hasDiscount: hasDiscountFilter,
                keyword: keyword.trim(),
              })
            }
          >
            查询
          </Button>
          <Button
            onClick={() => {
              setPartnerFilter(undefined)
              setCollectionFilter(undefined)
              setHasDiscountFilter('all')
              setKeyword('')
              setAppliedFilters({
                partnerId: undefined,
                collectionMode: undefined,
                hasDiscount: 'all',
                keyword: '',
              })
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      {!readOnly ? (
        <div style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingOrder(null)
              setViewOnly(false)
              setDrawerOpen(true)
            }}
          >
            添加客源单
          </Button>
        </div>
      ) : null}

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={listResult?.items ?? []}
        scroll={{ x: 1600 }}
        pagination={false}
      />

      <SourceOrderDrawer
        open={drawerOpen}
        editing={editingOrder}
        readOnly={readOnly || viewOnly}
        loading={saveMutation.isPending}
        form={form}
        onClose={() => {
          setDrawerOpen(false)
          setEditingOrder(null)
          setViewOnly(false)
        }}
        onSubmit={(payload) => saveMutation.mutate(payload)}
      />

      <SourceOrderGuestDrawer
        open={guestDrawerOpen}
        sourceOrder={guestOrder}
        readOnly={readOnly}
        onClose={() => {
          setGuestDrawerOpen(false)
          setGuestOrder(null)
        }}
        onSynced={invalidate}
      />
    </div>
  )
}
