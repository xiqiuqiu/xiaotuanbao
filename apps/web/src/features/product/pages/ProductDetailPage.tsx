import { useState } from 'react'
import { Button, Space, Spin, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import type { ProductScheduleSummary } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import { getProduct } from '@/services/product.service'
import { ProductBasicsCard } from '../components/ProductBasicsCard'
import { ProductDetailHeader } from '../components/ProductDetailHeader'
import { ProductPricingCard } from '../components/ProductPricingCard'
import { ProductScheduleDrawer } from '../components/ProductScheduleDrawer'
import { ProductTextBlockCard } from '../components/ProductTextBlockCard'
import { useProductDetailMutations } from '../hooks/useProductDetailMutations'
import { canEditProduct } from '../utils/product-permission'

export function ProductDetailPage() {
  const { productId } = useParams({ strict: false })
  const navigate = useNavigate()
  const canEdit = canEditProduct(useAuthStore((state) => state.actionKeys))
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ProductScheduleSummary | null>(null)

  const goBack = () => void navigate({ to: '/product' })

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId!),
    enabled: Boolean(productId),
  })

  const { patchProduct, specMutation, scheduleMutation, deleteMutation } = useProductDetailMutations({
    productId: productId ?? '',
    editingSchedule,
    onScheduleSaved: () => {
      setScheduleOpen(false)
      setEditingSchedule(null)
    },
    onDeleted: goBack,
  })

  if (!productId) {
    return (
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={goBack}>
          返回产品中心
        </Button>
        <Typography.Title level={4}>产品不存在</Typography.Title>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }

  if (isError || !product) {
    return (
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={goBack}>
          返回产品中心
        </Button>
        <Typography.Title level={4}>产品不存在</Typography.Title>
      </div>
    )
  }

  return (
    <div>
      <ProductDetailHeader
        product={product}
        canEdit={canEdit}
        deleting={deleteMutation.isPending}
        onBack={goBack}
        onDelete={() => deleteMutation.mutateAsync()}
      />

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <ProductBasicsCard
          product={product}
          canEdit={canEdit}
          saving={patchProduct.isPending}
          onSave={(payload) => patchProduct.mutate(payload)}
        />
        <ProductTextBlockCard
          title="简版行程"
          content={product.shortItinerary}
          canEdit={canEdit}
          saving={patchProduct.isPending}
          rows={5}
          placeholder="可先整段维护，如 D1…Dn"
          onSave={(content) => patchProduct.mutate({ shortItinerary: content })}
        />
        <ProductTextBlockCard
          title="产品特色"
          content={product.featuresText ?? ''}
          canEdit={canEdit}
          saving={patchProduct.isPending}
          placeholder="可空"
          onSave={(content) => patchProduct.mutate({ featuresText: content.trim() || null })}
        />
        <ProductPricingCard
          product={product}
          canEdit={canEdit}
          saving={specMutation.isPending}
          onSaveSpec={(values) => specMutation.mutate(values)}
          onCreateSchedule={() => {
            setEditingSchedule(null)
            setScheduleOpen(true)
          }}
          onEditSchedule={(schedule) => {
            setEditingSchedule(schedule)
            setScheduleOpen(true)
          }}
        />
        <ProductTextBlockCard
          title="报名须知"
          content={product.bookingNotice ?? ''}
          canEdit={canEdit}
          saving={patchProduct.isPending}
          placeholder="可整段粘贴；组织模板后续迭代"
          onSave={(content) => patchProduct.mutate({ bookingNotice: content.trim() || null })}
        />
        <ProductTextBlockCard
          title="详细行程"
          content={product.detailedItinerary ?? ''}
          canEdit={canEdit}
          saving={patchProduct.isPending}
          rows={4}
          placeholder="可空；可先粘贴文本，Word 上传后续迭代"
          onSave={(content) => patchProduct.mutate({ detailedItinerary: content.trim() || null })}
        />
      </Space>

      <ProductScheduleDrawer
        open={scheduleOpen}
        canEdit={canEdit}
        saving={scheduleMutation.isPending}
        editingSchedule={editingSchedule}
        defaultPrices={{
          adultPriceCents: product.spec.adultPriceCents,
          childPriceCents: product.spec.childPriceCents,
          singleRoomSupplementCents: product.spec.singleRoomSupplementCents,
        }}
        onClose={() => {
          setScheduleOpen(false)
          setEditingSchedule(null)
        }}
        onSave={(values) => scheduleMutation.mutate(values)}
      />
    </div>
  )
}
