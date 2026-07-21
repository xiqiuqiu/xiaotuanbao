import { request } from '@/lib/request'
import type { ProductDetail, ProductListResult } from '@/types/api'
import type { ProductScheduleStatus, ProductStatus } from '@xiaotuanbao/shared'

export interface ListProductsParams {
  search?: string
  status?: ProductStatus
  includeOffShelf?: boolean
  page?: number
  pageSize?: number
}

export interface CreateProductPayload {
  name: string
  shortItinerary?: string
  tags?: string[]
  departureCity?: string
  arrivalCity?: string
  dayCount?: number
}

export interface UpdateProductPayload {
  name: string
  shortItinerary?: string | null
  tags?: string[]
  departureCity?: string | null
  arrivalCity?: string | null
  dayCount?: number | null
}

export interface UpdateProductSpecPayload {
  name?: string
  adultPriceCents?: number | null
  childPriceCents?: number | null
  singleSupplementCents?: number | null
}

export interface CreateProductSchedulePayload {
  description?: string
  dateRuleText?: string
  dateRangeStart?: string
  dateRangeEnd?: string
  adultPriceCents?: number | null
  childPriceCents?: number | null
  singleSupplementCents?: number | null
  inquireOnly?: boolean
  notes?: string
  status?: ProductScheduleStatus
}

export interface UpdateProductSchedulePayload extends CreateProductSchedulePayload {}

export async function listProducts(params: ListProductsParams): Promise<ProductListResult> {
  return request.get<ProductListResult>('/products', { params })
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

export async function updateProductSpec(
  id: string,
  payload: UpdateProductSpecPayload,
): Promise<ProductDetail> {
  return request.patch<ProductDetail>(`/products/${id}/spec`, payload)
}

export async function createProductSchedule(
  id: string,
  payload: CreateProductSchedulePayload,
): Promise<ProductDetail> {
  return request.post<ProductDetail>(`/products/${id}/schedules`, payload)
}

export async function updateProductSchedule(
  productId: string,
  scheduleId: string,
  payload: UpdateProductSchedulePayload,
): Promise<ProductDetail> {
  return request.patch<ProductDetail>(
    `/products/${productId}/schedules/${scheduleId}`,
    payload,
  )
}

export async function publishProduct(id: string): Promise<ProductDetail> {
  return request.post<ProductDetail>(`/products/${id}/publish`)
}

export async function offShelfProduct(id: string): Promise<ProductDetail> {
  return request.post<ProductDetail>(`/products/${id}/off-shelf`)
}

export async function restoreProductDraft(id: string): Promise<ProductDetail> {
  return request.post<ProductDetail>(`/products/${id}/restore-draft`)
}

export async function deleteProduct(id: string): Promise<void> {
  return request.delete<void>(`/products/${id}`)
}
