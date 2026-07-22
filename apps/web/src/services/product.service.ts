import { request } from '@/lib/request'
import type { ProductDetail, ProductListResult } from '@/types/api'
import type { ProductScheduleStatus, ProductStatus } from '@xiaotuanbao/shared'

export interface ListProductsParams {
  search?: string
  status?: ProductStatus
  includeOffline?: boolean
  page?: number
  pageSize?: number
}

export interface CreateProductPayload {
  name: string
  shortItinerary?: string
  startCity?: string
  endCity?: string
  dayCount?: number
  tags?: string[]
}

export interface UpdateProductPayload {
  name?: string
  shortItinerary?: string
  detailedItinerary?: string | null
  featuresText?: string | null
  bookingNotice?: string | null
  startCity?: string | null
  endCity?: string | null
  dayCount?: number | null
  tags?: string[]
  status?: ProductStatus
}

export interface UpdateProductSpecPayload {
  name?: string
  adultPriceCents?: number | null
  childPriceCents?: number | null
  singleRoomSupplementCents?: number | null
  notes?: string | null
}

export interface ProductSchedulePayload {
  title?: string
  dateRuleText?: string
  startDate?: string | null
  endDate?: string | null
  status?: ProductScheduleStatus
  priceOnInquiry?: boolean
  adultPriceCents?: number | null
  childPriceCents?: number | null
  singleRoomSupplementCents?: number | null
  notes?: string | null
}

export async function listProducts(
  params: ListProductsParams,
  signal?: AbortSignal,
): Promise<ProductListResult> {
  return request.get<ProductListResult>('/products', { params, signal })
}

export async function getProduct(id: string): Promise<ProductDetail> {
  return request.get<ProductDetail>(`/products/${id}`)
}

export async function createProduct(payload: CreateProductPayload): Promise<ProductDetail> {
  return request.post<ProductDetail>('/products', payload)
}

export async function updateProduct(
  id: string,
  payload: UpdateProductPayload,
): Promise<ProductDetail> {
  return request.patch<ProductDetail>(`/products/${id}`, payload)
}

export async function deleteProduct(id: string): Promise<void> {
  await request.delete<void>(`/products/${id}`)
}

export async function updateProductSpec(
  id: string,
  payload: UpdateProductSpecPayload,
): Promise<ProductDetail> {
  return request.patch<ProductDetail>(`/products/${id}/spec`, payload)
}

export async function createProductSchedule(
  id: string,
  payload: ProductSchedulePayload,
): Promise<ProductDetail> {
  return request.post<ProductDetail>(`/products/${id}/schedules`, payload)
}

export async function updateProductSchedule(
  id: string,
  scheduleId: string,
  payload: ProductSchedulePayload,
): Promise<ProductDetail> {
  return request.patch<ProductDetail>(`/products/${id}/schedules/${scheduleId}`, payload)
}
