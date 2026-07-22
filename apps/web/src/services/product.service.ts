import { downloadBinary, request, triggerBrowserDownload } from '@/lib/request'
import type {
  BookingNoticeTemplateSummary,
  ProductDetail,
  ProductImportConfirmResult,
  ProductImportSessionDetail,
  ProductListResult,
} from '@/types/api'
import type { ProductScheduleStatus, ProductStatus } from '@xiaotuanbao/shared'

export interface ListProductsParams {
  search?: string
  status?: ProductStatus
  includeOffline?: boolean
  importSessionId?: string
  sourceSheetName?: string
  page?: number
  pageSize?: number
}

export interface ConfirmImportSchedulePayload {
  dateRuleText: string
  title?: string
  startDate?: string | null
  endDate?: string | null
  priceOnInquiry?: boolean
  adultPriceCents?: number | null
  childPriceCents?: number | null
  singleRoomSupplementCents?: number | null
  notes?: string | null
  /** 计调已确认该班期价格/日期；服务端要求必须为 true */
  confirmed: true
}

export interface ConfirmImportLinePayload {
  candidateKey: string
  action: 'accept' | 'skip'
  name?: string
  shortItinerary?: string
  featuresText?: string | null
  tags?: string[]
  schedules?: ConfirmImportSchedulePayload[]
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
  bookingNotice?: string | null
  startCity?: string | null
  endCity?: string | null
  dayCount?: number | null
  tags?: string[]
  status?: ProductStatus
}

export interface ProductFeatureItemPayload {
  title?: string
  description?: string
}

export interface BookingNoticeTemplatePayload {
  name: string
  content: string
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

export async function replaceProductFeatures(
  id: string,
  features: ProductFeatureItemPayload[],
): Promise<ProductDetail> {
  return request.put<ProductDetail>(`/products/${id}/features`, { features })
}

export async function applyBookingNoticeTemplate(
  productId: string,
  templateId: string,
): Promise<ProductDetail> {
  return request.post<ProductDetail>(`/products/${productId}/booking-notice/from-template`, {
    templateId,
  })
}

export async function listBookingNoticeTemplates(
  signal?: AbortSignal,
): Promise<BookingNoticeTemplateSummary[]> {
  return request.get<BookingNoticeTemplateSummary[]>('/booking-notice-templates', { signal })
}

export async function createBookingNoticeTemplate(
  payload: BookingNoticeTemplatePayload,
): Promise<BookingNoticeTemplateSummary> {
  return request.post<BookingNoticeTemplateSummary>('/booking-notice-templates', payload)
}

export async function updateBookingNoticeTemplate(
  id: string,
  payload: Partial<BookingNoticeTemplatePayload>,
): Promise<BookingNoticeTemplateSummary> {
  return request.patch<BookingNoticeTemplateSummary>(`/booking-notice-templates/${id}`, payload)
}

export async function deleteBookingNoticeTemplate(id: string): Promise<void> {
  await request.delete<void>(`/booking-notice-templates/${id}`)
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

export async function createProductImportSession(file: File): Promise<ProductImportSessionDetail> {
  const form = new FormData()
  form.append('file', file)
  return request.post<ProductImportSessionDetail>('/products/import-sessions', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  })
}

export async function getProductImportSession(
  sessionId: string,
): Promise<ProductImportSessionDetail> {
  return request.get<ProductImportSessionDetail>(`/products/import-sessions/${sessionId}`)
}

export async function confirmProductImportSession(
  sessionId: string,
  lines: ConfirmImportLinePayload[],
): Promise<ProductImportConfirmResult> {
  return request.post<ProductImportConfirmResult>(`/products/import-sessions/${sessionId}/confirm`, {
    lines,
  })
}

export async function downloadProductImportOriginal(
  storedObjectId: string,
  fallbackFilename: string,
): Promise<void> {
  const { blob, filename } = await downloadBinary(`/stored-objects/${storedObjectId}`)
  triggerBrowserDownload(blob, filename ?? fallbackFilename)
}

/** 单产品同行资料 PDF；有价缺成人价时服务端 400。 */
export async function downloadProductPeerPackPdf(
  productId: string,
  priced: boolean,
): Promise<void> {
  const { blob, filename } = await downloadBinary(`/products/${productId}/peer-pack.pdf`, {
    params: { priced },
  })
  triggerBrowserDownload(blob, filename ?? `同行资料_${productId}.pdf`)
}

/** 过渡总表 Excel；筛选口径对齐列表。 */
export async function downloadProductSummaryExcel(params?: {
  search?: string
  status?: ProductStatus
  importSessionId?: string
  sourceSheetName?: string
  includeOffline?: boolean
}): Promise<void> {
  const { blob, filename } = await downloadBinary('/products/summary.xlsx', { params })
  triggerBrowserDownload(blob, filename ?? '产品总表.xlsx')
}
