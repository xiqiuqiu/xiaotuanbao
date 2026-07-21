import { Button, Input, Select, Space, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link } from '@tanstack/react-router'
import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_TYPE_LABELS,
  ProductStatus,
  ProductType,
  type ProductSummary,
} from '@xiaotuanbao/shared'
import { PRODUCT_STATUS_OPTIONS } from '../utils/product-catalog'

interface ProductFiltersProps {
  search: string
  status?: ProductStatus
  includeOffShelf: boolean
  onSearchChange: (value: string) => void
  onStatusChange: (value: ProductStatus | undefined) => void
  onIncludeOffShelfChange: (value: boolean) => void
}

export function ProductFilters({
  search,
  status,
  includeOffShelf,
  onSearchChange,
  onStatusChange,
  onIncludeOffShelfChange,
}: ProductFiltersProps) {
  return (
    <Space wrap style={{ marginBottom: 16 }}>
      <Input.Search
        allowClear
        placeholder="搜索名称 / 行程 / 城市"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ width: 260 }}
      />
      <Select
        allowClear
        placeholder="状态"
        value={status}
        options={PRODUCT_STATUS_OPTIONS}
        onChange={(value) => onStatusChange(value)}
        style={{ width: 140 }}
      />
      <Button
        type={includeOffShelf ? 'primary' : 'default'}
        onClick={() => onIncludeOffShelfChange(!includeOffShelf)}
      >
        {includeOffShelf ? '含已下架' : '不含已下架'}
      </Button>
    </Space>
  )
}

function statusColor(status: string): string {
  if (status === ProductStatus.ON_SALE) return 'success'
  if (status === ProductStatus.OFF_SHELF) return 'default'
  return 'processing'
}

export function buildProductColumns(): ColumnsType<ProductSummary> {
  return [
    {
      title: '产品名称',
      dataIndex: 'name',
      render: (name: string, row) => (
        <Link to="/product/$productId" params={{ productId: row.id }}>
          {name}
        </Link>
      ),
    },
    {
      title: '类型',
      dataIndex: 'productType',
      width: 88,
      render: (value: string) =>
        PRODUCT_TYPE_LABELS[value as ProductType] ?? value,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={statusColor(status)}>
          {PRODUCT_STATUS_LABELS[status as ProductStatus] ?? status}
        </Tag>
      ),
    },
    {
      title: '起止城市',
      width: 160,
      render: (_: unknown, row) =>
        [row.departureCity, row.arrivalCity].filter(Boolean).join(' → ') || '-',
    },
    {
      title: '有效班期',
      dataIndex: 'effectiveScheduleCount',
      width: 96,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value: string) => value.slice(0, 19).replace('T', ' '),
    },
  ]
}
