import { Button, Modal, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { ProductStatus } from '@xiaotuanbao/shared'
import type { ProductDetail } from '@/types/api'
import { PRODUCT_STATUS_LABELS } from '../utils/product-labels'

export function ProductDetailHeader({
  product,
  canEdit,
  deleting,
  onBack,
  onDelete,
}: {
  product: ProductDetail
  canEdit: boolean
  deleting: boolean
  onBack: () => void
  onDelete: () => Promise<unknown>
}) {
  return (
    <Space style={{ marginBottom: 16 }} wrap>
      <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={onBack}>
        返回产品中心
      </Button>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {product.name}
      </Typography.Title>
      <Tag>{PRODUCT_STATUS_LABELS[product.status as ProductStatus]}</Tag>
      <Tag>散拼</Tag>
      {canEdit && product.schedules.length === 0 ? (
        <Button
          danger
          loading={deleting}
          onClick={() => {
            Modal.confirm({
              title: `删除产品「${product.name}」？`,
              content: '该产品尚无班期，删除后不可恢复。已有班期的产品只能下架。',
              okText: '删除',
              okButtonProps: { danger: true },
              onOk: () => onDelete(),
            })
          }}
        >
          删除
        </Button>
      ) : null}
    </Space>
  )
}
