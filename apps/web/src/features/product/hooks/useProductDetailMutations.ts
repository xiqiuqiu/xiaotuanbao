import { message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProductScheduleSummary } from '@xiaotuanbao/shared'
import {
  createProductSchedule,
  deleteProduct,
  updateProduct,
  updateProductSchedule,
  updateProductSpec,
  type UpdateProductPayload,
} from '@/services/product.service'
import { yuanToCents } from '../utils/product-labels'
import { buildProductSchedulePayload } from '../utils/schedule-form'
import type { SpecForm } from '../components/ProductPricingCard'
import type { ScheduleForm } from '../components/ProductScheduleDrawer'

export function useProductDetailMutations({
  productId,
  editingSchedule,
  onScheduleSaved,
  onDeleted,
}: {
  productId: string
  editingSchedule: ProductScheduleSummary | null
  onScheduleSaved: () => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['product', productId] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const patchProduct = useMutation({
    mutationFn: (payload: UpdateProductPayload) => updateProduct(productId, payload),
    onSuccess: () => {
      message.success('已保存')
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const specMutation = useMutation({
    mutationFn: (values: SpecForm) =>
      updateProductSpec(productId, {
        name: values.name.trim(),
        adultPriceCents: yuanToCents(values.adultPriceYuan),
        childPriceCents: yuanToCents(values.childPriceYuan),
        singleRoomSupplementCents: yuanToCents(values.singleRoomSupplementYuan),
        notes: values.notes?.trim() || null,
      }),
    onSuccess: () => {
      message.success('规格默认价已保存（不回写既有班期）')
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const scheduleMutation = useMutation({
    mutationFn: async (values: ScheduleForm) => {
      const payload = buildProductSchedulePayload(values)
      if (editingSchedule) {
        return updateProductSchedule(productId, editingSchedule.id, payload)
      }
      return createProductSchedule(productId, payload)
    },
    onSuccess: () => {
      message.success(editingSchedule ? '班期已更新' : '班期已创建')
      onScheduleSaved()
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存班期失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(productId),
    onSuccess: () => {
      message.success('产品已删除')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onDeleted()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除失败')
    },
  })

  return { patchProduct, specMutation, scheduleMutation, deleteMutation }
}
