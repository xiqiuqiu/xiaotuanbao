import type { ColumnsType } from 'antd/es/table'
import { Button, Popconfirm, Space, Tag } from 'antd'
import type { UseMutationResult } from '@tanstack/react-query'
import type { SourceOrderSummary } from '@/types/api'
import {
  SOURCE_ORDER_COLLECTION_LABELS,
  SOURCE_ORDER_RECEIVABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'

interface BuildSourceOrdersColumnsOptions {
  readOnly: boolean
  deleteMutation: UseMutationResult<unknown, Error, string, unknown>
  generateMutation: UseMutationResult<unknown, Error, string, unknown>
  onView: (record: SourceOrderSummary) => void
  onEdit: (record: SourceOrderSummary) => void
  onOpenGuests: (record: SourceOrderSummary) => void
}

export function buildSourceOrdersColumns({
  readOnly,
  deleteMutation,
  generateMutation,
  onView,
  onEdit,
  onOpenGuests,
}: BuildSourceOrdersColumnsOptions): ColumnsType<SourceOrderSummary> {
  return [
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
          <Button type="link" size="small" onClick={() => onView(record)}>
            查看
          </Button>
          {!readOnly ? (
            <>
              <Button type="link" size="small" onClick={() => onEdit(record)}>
                编辑
              </Button>
              <Button type="link" size="small" onClick={() => onOpenGuests(record)}>
                客人名单
              </Button>
              <Button
                type="link"
                size="small"
                loading={generateMutation.isPending && generateMutation.variables === record.id}
                onClick={() => generateMutation.mutate(record.id)}
              >
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
  ]
}
