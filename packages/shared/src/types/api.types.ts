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

export interface LoginResult extends SessionPayload {}

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
  updatedAt: string
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
  categories: string[]
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
}

export interface CopyDepartureDto {
  name: string
  startDate: string
  endDate: string
  ownerUserId: string
  departureType?: string
  notes?: string
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

export interface CloseDepartureDto {
  reason: string
}

export interface UnarchiveDepartureDto {
  reason: string
}

export interface DepartureArchiveHistoryItem {
  id: string
  action: string
  reason: string
  operatedBy: string
  operatedByName: string
  operatedAt: string
}

export interface DepartureSettlementHistoryItem {
  id: string
  triggerPaymentScheduleId: string
  triggerScheduleNo: string
  reason: string
  previousStatus: string
  newStatus: string
  operatedBy: string
  operatedByName: string
  operatedAt: string
}

export type DepartureOverviewAnomalyCode = 'receivable_balance'

export interface DepartureOverviewAnomaly {
  code: DepartureOverviewAnomalyCode
  expectedCents: number
  actualCents: number
  differenceCents: number
}

export interface DepartureOverviewStats {
  receivedCents: number
  openUnreceivedCents: number
  closedUnreceivedCents: number
  ungeneratedReceivableCents: number
  otherReceivableCents: number
  confirmedPayableCents: number
  paidCents: number
  openUnpaidCents: number
  closedUnpaidCents: number
  ungeneratedPayableCents: number
  otherPayableCents: number
  resourcePayableDifferenceCents: number
  confirmedMarginCents: number
  incomeTransactionCents: number
  expenseTransactionCents: number
  cashNetInflowCents: number
  unverifiedIncomeCents: number
  unverifiedExpenseCents: number
  verifiedFromOtherDeparturesCents: number
  verifiedToOtherDeparturesCents: number
  anomalies: DepartureOverviewAnomaly[]
}

/** Detail response extends summary with full financial Read Model aggregates. */
export interface DepartureDetail extends DepartureSummary {
  grossReceivableCents: number
  discountCents: number
  verifiedReceivableCents: number
  openUnsettledReceivableCents: number
  verifiedPayableCents: number
  openUnsettledPayableCents: number
  unverifiedIncomeCents: number
  unverifiedExpenseCents: number
  overviewStats: DepartureOverviewStats
  isFinanciallySettled: boolean
  archiveHistory: DepartureArchiveHistoryItem[]
  settlementHistory: DepartureSettlementHistoryItem[]
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
  dayCount?: number | null
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
}

export interface PaymentScheduleSummary {
  id: string
  departureId: string
  departureStatus: string
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
  cancelledBy: string | null
  closeDisposition: string | null
  cancelReason: string | null
  voidedAt: string | null
  voidedBy: string | null
  voidedByName: string | null
  voidReason: string | null
  voidedAmountCents: number | null
  amountAdjustedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PaymentScheduleActivityItem {
  id: string
  activityType: string
  closeDisposition: string | null
  note: string
  amountCents: number | null
  previousAmountCents: number | null
  settledAmountCents: number | null
  unsettledAmountCents: number | null
  previousSettledAmountCents: number | null
  previousUnsettledAmountCents: number | null
  verificationId: string | null
  operatedBy: string
  operatedByName: string
  operatedAt: string
}

/** Detail response extends summary with node activity timeline. */
export interface PaymentScheduleDetail extends PaymentScheduleSummary {
  activities: PaymentScheduleActivityItem[]
}

export interface PaymentScheduleListResult {
  items: PaymentScheduleSummary[]
  total: number
  page: number
  pageSize: number
}

export interface CancelPaymentScheduleDto {
  closeDisposition: string
  cancelReason: string
}

export interface ReopenPaymentScheduleDto {
  reopenReason: string
  confirmDepartureSettlementReversal?: boolean
}

export interface AdjustPaymentScheduleAmountDto {
  amountCents: number
  adjustReason: string
}

export interface VoidResourcePayableDto {
  voidReason: string
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
  departureNo: string | null
  departureName: string | null
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
  departureId: string
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
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
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

export type BatchFinanceGenerationOutcome = 'succeeded' | 'skipped' | 'failed'

export interface BatchFinanceGenerationItem {
  sourceId: string
  sourceLabel: string
  outcome: BatchFinanceGenerationOutcome
  generatedCount?: number
  reason?: string
}

/** 发团级一键生成应收/应付的汇总结果；逐条独立事务，允许部分成功。 */
export interface BatchFinanceGenerationResult {
  attempted: number
  succeeded: number
  generated: number
  skipped: number
  failed: number
  items: BatchFinanceGenerationItem[]
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
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents?: number | null
  childUnitPriceCents?: number | null
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
  adultGuestCount?: number
  childGuestCount?: number
  adultUnitPriceCents?: number | null
  childUnitPriceCents?: number | null
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
  sortOrder: number
  startDate: string | null
  endDate: string | null
  dayCount: number | null
  destination: string | null
  notes: string | null
  resourceCount: number
  outsourceCount: number
  resourceAmountCents: number
  /** Resources that already have payables (any status other than not_generated). */
  payableGeneratedCount: number
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
  startDate?: string | null
  endDate?: string | null
  destination?: string | null
  notes?: string
}

export interface UpdateItinerarySegmentDto {
  name?: string
  startDate?: string | null
  endDate?: string | null
  destination?: string | null
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
  hasPaymentSchedule: boolean
  payableStatus: string
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
  paymentScheduleId: string | null
  financeTouched: boolean
  unsettledAmountCents: number | null
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

/** Null progress means finance tracking has not started for that row — UI renders as `—`. */
export interface DepartureOperationsSheetGuestRepresentative {
  name: string
  phone: string | null
}

/**
 * One Customer Settlement or Guest Collection path under a Source Order.
 * Progress is path-scoped — never merge payers (#97).
 */
export interface DepartureOperationsSheetReceivablePathRow {
  /** PaymentScheduleSourceType: source_order_customer_settlement | source_order_guest_collection */
  pathType: string
  pathLabel: string
  /** Business agreed receivable for this path. */
  agreedReceivableCents: number
  /**
   * Financial schedule receivable when generated.
   * Null when finance has not started. Differs from agreedReceivableCents on mismatch.
   */
  scheduleReceivableCents: number | null
  /** Null when finance has not started — render as `—`, never numeric zero. */
  receivedCents: number | null
  /** Null when finance has not started. Closed rows keep remaining unreceived. */
  unreceivedCents: number | null
  /** SourceOrderReceivableStatus value; `not_generated` when finance has not started. */
  receivableStatus: string
  /** Closed-with-balance or business/schedule amount mismatch. Close reason omitted. */
  needsReview: boolean
  /**
   * Amount-mismatch rows stay visible but must not feed normal unreceived totals (#98).
   * Closed-with-balance rows keep unreceived visible and are NOT excluded here.
   */
  excludeFromProgressTotals: boolean
}

export interface DepartureOperationsSheetSourceOrderRow {
  id: string
  partnerName: string
  displayName: string
  adultGuestCount: number
  childGuestCount: number
  guestCount: number
  /** Net business receivable across paths (parent identity row). */
  agreedReceivableCents: number
  settlementNotes: string | null
  notes: string | null
  guestRepresentative: DepartureOperationsSheetGuestRepresentative | null
  /** Present collection paths only; progress lives here, not on the parent. */
  receivablePaths: DepartureOperationsSheetReceivablePathRow[]
}

export interface DepartureOperationsSheetResourceRow {
  id: string
  resourceKind: string
  resourceKindLabel: string
  counterpartyName: string
  title: string
  /** Business agreed payable from Segment Resource. */
  agreedPayableCents: number
  /**
   * Financial schedule payable when generated.
   * Null when finance has not started. Differs from agreedPayableCents on mismatch.
   */
  schedulePayableCents: number | null
  paidCents: number | null
  unpaidCents: number | null
  /** SegmentPayableStatus value; `not_generated` when finance has not started. */
  payableStatus: string
  /** Closed-with-balance or business/schedule amount mismatch. Close reason omitted. */
  needsReview: boolean
  /**
   * Amount-mismatch rows stay visible but must not feed normal unpaid totals (#98).
   * Closed-with-balance rows keep unpaid visible and are NOT excluded here.
   */
  excludeFromProgressTotals: boolean
  notes: string | null
}

export interface DepartureOperationsSheetSegmentRow {
  id: string
  sortOrder: number
  name: string
  startDate: string | null
  endDate: string | null
  dayCount: number | null
  destination: string | null
  notes: string | null
  resources: DepartureOperationsSheetResourceRow[]
}

export interface DepartureOperationsSheetDepartureInfo {
  id: string
  departureNo: string
  name: string
  routeName: string
  startDate: string
  endDate: string
  dayCount: number
  ownerName: string
  status: string
  departureProgress: string
  notes: string | null
}

/**
 * Departure-linked cash that still has unverified balance (#98).
 * Keeps transaction identity — never attributed to a Source Order or Segment Resource.
 */
export interface DepartureOperationsSheetPendingTransaction {
  id: string
  /** TransactionDirection: inflow | outflow */
  direction: string
  transactionDate: string
  counterpartyName: string
  /** Remaining unverified amount after effective allocations. */
  remainingUnverifiedCents: number
  paymentChannel: string
  notes: string | null
}

/** Separate pending collection vs payment totals; never mixed into path/resource settled. */
export interface DepartureOperationsSheetPendingSummary {
  pendingCollectionCents: number
  pendingPaymentCents: number
}

/**
 * Progress totals for rows with a valid financial basis and matching amounts.
 * Null when no countable rows — empty finance must not render as confirmed zero (#98).
 */
export interface DepartureOperationsSheetProgressTotals {
  agreedCents: number
  settledCents: number
  unsettledCents: number
  includedRowCount: number
}

export interface DepartureOperationsSheetFinanceSummary {
  receivable: DepartureOperationsSheetProgressTotals | null
  payable: DepartureOperationsSheetProgressTotals | null
}

/** Closed-with-balance or business/schedule amount mismatch callouts (#98). */
export interface DepartureOperationsSheetAnomaly {
  /** closed_with_balance | amount_mismatch */
  kind: string
  /** receivable | payable */
  side: string
  subjectLabel: string
  agreedAmountCents: number
  scheduleAmountCents: number | null
  settledCents: number
  remainingCents: number
}

/** Shared structured snapshot for page preview and Excel export (#99). */
export interface DepartureOperationsSheetSnapshot {
  organizationName: string
  exportedAt: string
  exportedByName: string
  dataStage: string
  departure: DepartureOperationsSheetDepartureInfo
  sourceOrders: DepartureOperationsSheetSourceOrderRow[]
  segments: DepartureOperationsSheetSegmentRow[]
  /** Non-voided departure transactions with remaining unverified balance. */
  pendingTransactions: DepartureOperationsSheetPendingTransaction[]
  /** Null when there are no pending transactions (avoid misleading zeros). */
  pendingSummary: DepartureOperationsSheetPendingSummary | null
  financeSummary: DepartureOperationsSheetFinanceSummary
  anomalies: DepartureOperationsSheetAnomaly[]
}
