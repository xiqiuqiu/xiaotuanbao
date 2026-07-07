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
