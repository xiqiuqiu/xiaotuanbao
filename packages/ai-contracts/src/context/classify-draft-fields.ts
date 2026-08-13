export type AiCreateDraftMode = 'manual' | 'template' | 'copy'

export interface AiCreateDraftSnapshot {
  mode: AiCreateDraftMode
  routeName: string
  templateId?: string | null
  copyFromDepartureId?: string | null
  defaultDayCount?: number | null
  name?: string | null
  startDate?: string | null
  endDate?: string | null
  ownerUserId?: string | null
  departureType?: string | null
  expectedGuestCountHint?: number | null
  notes?: string | null
  driverSupplierId?: string | null
  guideSupplierId?: string | null
  vehiclePlate?: string | null
  contactPhone?: string | null
}

export interface DraftFieldCoverage {
  filled: string[]
  missing: string[]
  optionalPresent: string[]
}

const REQUIRED_FIELDS = [
  'name',
  'routeName',
  'startDate',
  'endDate',
  'ownerUserId',
  'departureType',
] as const

const OPTIONAL_FIELDS = [
  'expectedGuestCountHint',
  'notes',
  'driverSupplierId',
  'guideSupplierId',
  'vehiclePlate',
  'contactPhone',
] as const

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isRouteFilled(snapshot: AiCreateDraftSnapshot): boolean {
  if (hasText(snapshot.routeName)) return true
  if (snapshot.mode === 'template' && hasText(snapshot.templateId)) return true
  if (snapshot.mode === 'copy' && hasText(snapshot.copyFromDepartureId)) return true
  return false
}

function isRequiredFilled(field: (typeof REQUIRED_FIELDS)[number], snapshot: AiCreateDraftSnapshot): boolean {
  if (field === 'routeName') return isRouteFilled(snapshot)
  return hasText(snapshot[field])
}

function isOptionalPresent(field: (typeof OPTIONAL_FIELDS)[number], snapshot: AiCreateDraftSnapshot): boolean {
  if (field === 'expectedGuestCountHint') {
    return snapshot.expectedGuestCountHint != null
  }
  return hasText(snapshot[field])
}

export function classifyDraftFields(snapshot: AiCreateDraftSnapshot): DraftFieldCoverage {
  const filled: string[] = []
  const missing: string[] = []
  const optionalPresent: string[] = []

  for (const field of REQUIRED_FIELDS) {
    if (isRequiredFilled(field, snapshot)) {
      filled.push(field)
    } else {
      missing.push(field)
    }
  }

  for (const field of OPTIONAL_FIELDS) {
    if (isOptionalPresent(field, snapshot)) {
      optionalPresent.push(field)
    }
  }

  return { filled, missing, optionalPresent }
}
