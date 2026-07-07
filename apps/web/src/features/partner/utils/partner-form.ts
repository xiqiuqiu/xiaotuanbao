import type { PartnerFormValues } from '../components/PartnerProfileSections'
import type { PartnerSummary } from '@/types/api'
import {
  DirectoryProfileStatus,
  type PartnerContactRole,
  type PartnerKind,
  type PartnerType,
  type SettlementCycle,
  type SettlementMethod,
} from '@xiaotuanbao/shared'

export function partnerToFormValues(partner: PartnerSummary): PartnerFormValues {
  return {
    name: partner.name,
    partnerKind: partner.partnerKind as PartnerKind,
    partnerType: partner.partnerType as PartnerType,
    status: partner.status as DirectoryProfileStatus,
    contactName: partner.contactName ?? undefined,
    contactRole: (partner.contactRole as PartnerContactRole) ?? undefined,
    contactPhone: partner.contactPhone ?? undefined,
    settlementMethod: (partner.settlementMethod as SettlementMethod) ?? undefined,
    paymentTermRule: (partner.paymentTermRule as SettlementCycle) ?? undefined,
    settlementNotes: partner.settlementNotes ?? undefined,
  }
}

export function buildCreatePayload(values: PartnerFormValues) {
  const { status: _status, ...payload } = buildUpdatePayload(values)
  return payload
}

export function buildUpdatePayload(values: PartnerFormValues) {
  return {
    name: values.name,
    partnerKind: values.partnerKind,
    partnerType: values.partnerType,
    status: values.status ?? DirectoryProfileStatus.ACTIVE,
    contactName: values.contactName,
    contactRole: values.contactRole,
    contactPhone: values.contactPhone,
    settlementMethod: values.settlementMethod as SettlementMethod | undefined,
    paymentTermRule: values.paymentTermRule as SettlementCycle | undefined,
    settlementNotes: values.settlementNotes,
  }
}

export type { PartnerKind, PartnerType, PartnerContactRole }
