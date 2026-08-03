import { useState } from 'react'
import { Button, Dropdown, Modal, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons'
import { ProductStatus } from '@xiaotuanbao/shared'
import type { ProductDetail } from '@/types/api'
import { downloadProductPeerPackPdf } from '@/services/product.service'
import { warnProductExportGaps } from '../utils/product-export-warnings'
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
  const [exporting, setExporting] = useState(false)

  const exportPeerPack = async (priced: boolean) => {
    setExporting(true)
    try {
      await downloadProductPeerPackPdf(product.id, priced)
      warnProductExportGaps(product)
    } catch {
      // downloadBinary 已提示错误
    } finally {
      setExporting(false)
    }
  }

  return (
    <Space style={{ marginBottom: 16 }} wrap>
      <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingInlineStart: 0 }} onClick={onBack}>
        返回产品中心
      </Button>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {product.name}
      </Typography.Title>
      <Tag>{PRODUCT_STATUS_LABELS[product.status as ProductStatus]}</Tag>
      <Tag>散拼</Tag>
      <Dropdown
        menu={{
          items: [
            {
              key: 'priced',
              label: '有价 PDF',
              onClick: () => void exportPeerPack(true),
            },
            {
              key: 'unpriced',
              label: '无价 PDF',
              onClick: () => void exportPeerPack(false),
            },
          ],
        }}
      >
        <Button icon={<DownloadOutlined />} loading={exporting}>
          导出同行资料
        </Button>
      </Dropdown>
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
