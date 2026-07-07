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
  status: string
  departureProgress: string
  notes: string | null
  createdAt: string
  updatedAt: string
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
  departureNo?: string
  departureType?: string
  notes?: string
  templateId?: string
  copySegments?: boolean
  copyResources?: boolean
  copyReferencePrices?: boolean
}

export interface UpdateDepartureDto {
  departureNo?: string
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

/** Detail response extends summary with Read Model aggregates (placeholder zeros until E7). */
export interface DepartureDetail extends DepartureSummary {
  totalGuests: number
  grossReceivableCents: number
  discountCents: number
  netReceivableCents: number
  payableCents: number
  estimatedMarginCents: number
  collectedCents: number
  uncollectedCents: number
  paidCents: number
  unpaidCents: number
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

export interface FinanceTransactionListResult {
  items: FinanceTransactionSummary[]
  total: number
  page: number
  pageSize: number
}

export interface CreateFinanceTransactionDto {
  direction: string
  amountCents: number
  transactionDate: string
  counterpartyType: string
  counterpartyId?: string
  counterpartyName?: string
  departureId?: string
  notes?: string
}

export interface VoidFinanceTransactionDto {
  voidReason?: string
}

export interface FinanceVerificationSummary {
  id: string
  verificationNo: string
  paymentScheduleId: string
  transactionId: string
  amountCents: number
  status: string
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FinanceVerificationListResult {
  items: FinanceVerificationSummary[]
  total: number
  page: number
  pageSize: number
}

export interface CreateFinanceVerificationDto {
  paymentScheduleId: string
  transactionId: string
  amountCents: number
}

export interface ConfirmCollectionDto {
  amountCents: number
  transactionDate: string
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
  notes?: string
}

export interface ConfirmPaymentDto {
  amountCents: number
  transactionDate: string
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
  notes?: string
}

export interface LinkTransactionDto {
  transactionId: string
  amountCents: number
}
