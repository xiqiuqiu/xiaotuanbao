export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AuthUser {
  id: string
  username: string
  name: string
  organizationId: string
  organizationName: string
  roles: string[]
}

export interface SessionPayload {
  user: AuthUser
  menuKeys: string[]
}

export interface LoginResult extends SessionPayload {
  accessToken: string
}

export interface MeResult extends SessionPayload {}

export interface HealthStatus {
  status: string
  timestamp?: string
}

export interface RoleSummary {
  id: string
  name: string
  menuKeys: string[]
}

export interface OrganizationSummary {
  id: string
  name: string
  businessPrefix: string
  numberingExamples: {
    departure: string
    receivable: string
    payable: string
    transaction: string
    verification: string
  }
}

export interface EmployeeSummary {
  id: string
  username: string
  name: string
  remark: string | null
  status: 'enabled' | 'disabled'
  roles: string[]
  lastLoginAt: string | null
  createdAt: string
}

export interface EmployeeListStats {
  total: number
  enabled: number
  disabled: number
  createdToday: number
}

export interface EmployeeListResult {
  items: EmployeeSummary[]
  total: number
  page: number
  pageSize: number
  stats: EmployeeListStats
}

export interface SupplierSummary {
  id: string
  name: string
  category: string
  status: 'active' | 'disabled' | 'archived'
  contactName: string | null
  contactPhone: string | null
  settlementMethod: string | null
  settlementCycle: string | null
  settlementNotes: string | null
  referenceQuoteNotes: string | null
  invoiceAvailable: string | null
  invoiceType: string | null
  taxRate: string | null
  accountName: string | null
  bankName: string | null
  bankAccount: string | null
  businessNotes: string | null
  createdAt: string
  updatedAt: string
}

export interface SupplierListResult {
  items: SupplierSummary[]
  total: number
  page: number
  pageSize: number
}

export interface PartnerSummary {
  id: string
  name: string
  partnerKind: string
  partnerType: string
  status: 'active' | 'disabled' | 'archived'
  contactName: string | null
  contactRole: string | null
  contactPhone: string | null
  settlementMethod: string | null
  paymentTermRule: string | null
  settlementNotes: string | null
  createdAt: string
  updatedAt: string
}

export interface PartnerListSummary {
  total: number
  groupAgent: number
  peer: number
  both: number
}

export interface PartnerListResult {
  items: PartnerSummary[]
  total: number
  page: number
  pageSize: number
  summary: PartnerListSummary
}

export interface DepartureCompletionTags {
  sourceOrders: string
  segments: string
  resources: string
  receivables: string
  payables: string
}

export interface DepartureSummary {
  id: string
  departureNo: string
  name: string
  routeName: string
  routeSource: string
  sourceTemplateId: string | null
  departureType: string
  startDate: string
  endDate: string
  dayCount: number
  ownerUserId: string
  ownerName?: string
  status: string
  departureProgress: string
  notes: string | null
  createdAt: string
  updatedAt: string
  totalGuests: number
  sourceOrderCount: number
  segmentCount: number
  resourceCount: number
  completionTags: DepartureCompletionTags
  netReceivableCents: number
  payableCents: number
  estimatedMarginCents: number
}

export interface DepartureListResult {
  items: DepartureSummary[]
  total: number
  page: number
  pageSize: number
}

export interface CreateDepartureDto {
  name: string
  routeName: string
  startDate: string
  endDate: string
  ownerUserId: string
  departureType?: string
  notes?: string
  templateId?: string
  copySegments?: boolean
  copyResources?: boolean
  copyReferencePrices?: boolean
}

export interface CopyDepartureDto {
  name: string
  startDate: string
  endDate: string
  ownerUserId: string
  departureType?: string
  notes?: string
  copySegments?: boolean
  copyResources?: boolean
  copyReferencePrices?: boolean
}

export interface UpdateDepartureDto {
  name?: string
  routeName?: string
  departureType?: string
  startDate?: string
  endDate?: string
  ownerUserId?: string
  notes?: string | null
}

export interface TransitionDepartureDto {
  targetStatus: string
}

/** Detail response extends summary with full financial Read Model aggregates. */
export interface DepartureDetail extends DepartureSummary {
  grossReceivableCents: number
  discountCents: number
  collectedCents: number
  uncollectedCents: number
  paidCents: number
  unpaidCents: number
  isFinanciallySettled: boolean
}

export interface RouteTemplateCardSummary {
  id: string
  name: string
  defaultDayCount: number
  usageCount: number
  updatedAt: string
}

export interface RouteTemplateDetailSummary extends RouteTemplateCardSummary {
  segmentCount: number
  resourceCount: number
}

export interface CreateRouteTemplateResourceDto {
  resourceKind: string
  counterpartyType: string
  partnerId?: string
  supplierId?: string
  title: string
  amountCents: number
  notes?: string
}

export interface CreateRouteTemplateSegmentDto {
  sortOrder: number
  name: string
  dayCount: number
  destination?: string
  notes?: string
  resources?: CreateRouteTemplateResourceDto[]
}

export interface CreateRouteTemplateDto {
  name: string
  defaultDayCount: number
  notes?: string
  segments?: CreateRouteTemplateSegmentDto[]
}

export interface CreateRouteTemplateFromDepartureDto {
  name: string
  defaultDayCount: number
  copySegments?: boolean
  copyResources?: boolean
  copyReferencePrices?: boolean
}

export interface PaymentScheduleSummary {
  id: string
  departureId: string
  direction: string
  scheduleNo: string
  title: string
  amountCents: number
  dueDate: string
  counterpartyType: string
  counterpartyId: string | null
  counterpartyName: string | null
  sourceType: string
  sourceId: string | null
  status: string
  financeTouched: boolean
  settledAmountCents: number
  unsettledAmountCents: number
  cancelledAt: string | null
  cancelReason: string | null
  amountAdjustedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PaymentScheduleListResult {
  items: PaymentScheduleSummary[]
  total: number
  page: number
  pageSize: number
}

export interface CreatePaymentScheduleDto {
  departureId: string
  title: string
  amountCents: number
  dueDate: string
  counterpartyType: string
  counterpartyId?: string
  counterpartyName?: string
  sourceType?: string
  sourceId?: string
}

export interface UpdatePaymentScheduleDto {
  title?: string
  amountCents?: number
  dueDate?: string
  counterpartyType?: string
  counterpartyId?: string | null
  counterpartyName?: string | null
}

export interface FinanceTransactionSummary {
  id: string
  transactionNo: string
  direction: string
  paymentChannel: string
  amountCents: number
  allocatedAmountCents: number
  unallocatedAmountCents: number
  transactionDate: string
  counterpartyType: string
  counterpartyId: string | null
  counterpartyName: string | null
  departureId: string | null
  voidedAt: string | null
  voidReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface FinanceTransactionVerificationSummary {
  id: string
  verificationNo: string
  paymentScheduleId: string
  scheduleNo: string
  scheduleDirection: string
  amountCents: number
  status: string
  cancelledAt: string | null
  createdAt: string
}

export interface FinanceTransactionDetail extends FinanceTransactionSummary {
  verificationCount: number
  lastVerificationAt: string | null
  verifications: FinanceTransactionVerificationSummary[]
}

export interface FinanceTransactionListResult {
  items: FinanceTransactionSummary[]
  total: number
  page: number
  pageSize: number
}

export interface CreateFinanceTransactionDto {
  direction: string
  paymentChannel: string
  amountCents: number
  transactionDate: string
  counterpartyType: string
  counterpartyId?: string
  counterpartyName?: string
  departureId?: string
  notes?: string
}

export type UpdateFinanceTransactionDto = CreateFinanceTransactionDto

export interface VoidFinanceTransactionDto {
  voidReason: string
}

export interface FinanceVerificationSummary {
  id: string
  verificationNo: string
  paymentScheduleId: string
  transactionId: string
  amountCents: number
  verificationDate: string
  remark: string | null
  createdBy: string
  cancelledBy: string | null
  cancelReason: string | null
  billUnsettledAfterCents: number
  status: string
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FinanceVerificationListItem extends FinanceVerificationSummary {
  transactionNo: string
  scheduleNo: string
  direction: string
  departureId: string
  departureNo: string
  departureName: string
  counterpartyType: string
  counterpartyName: string | null
  createdByName: string
  cancelledByName: string | null
}

export interface FinanceVerificationListResult {
  items: FinanceVerificationListItem[]
  total: number
  page: number
  pageSize: number
}

export interface FinanceVerificationDetail {
  verification: FinanceVerificationListItem
  transaction: FinanceTransactionSummary
  schedule: PaymentScheduleSummary
}

export interface CreateFinanceVerificationDto {
  paymentScheduleId: string
  transactionId: string
  amountCents: number
  verificationDate: string
  remark?: string
}

export interface CancelFinanceVerificationDto {
  cancelReason: string
}

export interface ConfirmCollectionDto {
  amountCents: number
  transactionDate: string
  paymentChannel: string
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
  notes?: string
}

export interface ConfirmPaymentDto {
  amountCents: number
  transactionDate: string
  paymentChannel: string
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
  notes?: string
}

export interface LinkTransactionDto {
  transactionId: string
  amountCents: number
}

export interface SourceOrderSummary {
  id: string
  departureId: string
  partnerId: string
  partnerName: string
  displayName: string
  guestCount: number
  unitPriceCents: number
  grossReceivableCents: number
  discountType: string
  discountCents: number
  discountNotes: string | null
  netReceivableCents: number
  collectionMode: string
  partnerCollectedCents: number
  guestCollectCents: number
  settlementNotes: string | null
  notes: string | null
  receivableStatus: string
  hasPaymentSchedule: boolean
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
  createdAt: string
  updatedAt: string
}

export interface GenerateReceivablesResult {
  schedules: PaymentScheduleSummary[]
  sourceOrder: SourceOrderSummary
  sourceAmountMismatch: boolean
}

export interface SourceOrderListSummary {
  orderCount: number
  totalGuests: number
  partnerCount: number
  totalDiscountCents: number
  totalNetReceivableCents: number
  totalGuestCollectCents: number
}

export interface SourceOrderListResult {
  items: SourceOrderSummary[]
  summary: SourceOrderListSummary
  total: number
}

export interface CreateSourceOrderDto {
  partnerId: string
  guestCount: number
  unitPriceCents: number
  discountType: string
  discountCents?: number
  discountNotes?: string
  collectionMode: string
  partnerCollectedCents?: number
  settlementNotes?: string
  notes?: string
}

export interface UpdateSourceOrderDto {
  partnerId?: string
  guestCount?: number
  unitPriceCents?: number
  discountType?: string
  discountCents?: number
  discountNotes?: string | null
  collectionMode?: string
  partnerCollectedCents?: number
  settlementNotes?: string | null
  notes?: string | null
}

export interface SourceOrderGuestSummary {
  id: string
  sourceOrderId: string
  name: string
  phone: string | null
  gender: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateSourceOrderGuestDto {
  name: string
  phone?: string
  gender?: string
  notes?: string
}

export interface UpdateSourceOrderGuestDto {
  name?: string
  phone?: string | null
  gender?: string
  notes?: string | null
}

export interface ItinerarySegmentSummary {
  id: string
  departureId: string
  name: string
  startDate: string
  endDate: string
  dayCount: number
  destination: string | null
  applicableGuestCount: number
  notes: string | null
  fromTemplate: boolean
  resourceCount: number
  outsourceCount: number
  resourceAmountCents: number
  payableStatus: string
}

export interface ItinerarySegmentListSummary {
  segmentCount: number
  totalDays: number
  resourceCount: number
  payableOverview: string
}

export interface ItinerarySegmentListResult {
  items: ItinerarySegmentSummary[]
  summary: ItinerarySegmentListSummary
  total: number
}

export interface CreateItinerarySegmentDto {
  name: string
  startDate: string
  endDate: string
  destination: string
  applicableGuestCount?: number
  notes?: string
}

export interface UpdateItinerarySegmentDto {
  name?: string
  startDate?: string
  endDate?: string
  destination?: string
  applicableGuestCount?: number
  notes?: string | null
}

export interface SegmentResourceSummary {
  id: string
  segmentId: string
  departureId: string
  resourceKind: string
  counterpartyType: string
  partnerId: string | null
  partnerName: string | null
  supplierId: string | null
  supplierName: string | null
  counterpartyName: string
  title: string
  amountCents: number
  notes: string | null
  fromTemplate: boolean
  hasPaymentSchedule: boolean
  payableStatus: string
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
}

export interface SegmentResourceListResult {
  items: SegmentResourceSummary[]
  total: number
}

export interface GeneratePayableResult {
  schedule: PaymentScheduleSummary
  resource: SegmentResourceSummary
  sourceAmountMismatch: boolean
}

export interface CreateSegmentResourceDto {
  resourceKind: string
  partnerId?: string
  supplierId?: string
  title?: string
  amountCents: number
  notes?: string
}

export interface UpdateSegmentResourceDto {
  resourceKind?: string
  partnerId?: string
  supplierId?: string
  title?: string
  amountCents?: number
  notes?: string | null
}
