import type { PartnerFormValues } from '../components/PartnerProfileSections'
import type {
  PartnerContactRole,
  PartnerKind,
  PartnerType,
  SettlementCycle,
  SettlementMethod,
} from '@xiaotuanbao/shared'

export function buildCreatePayload(values: PartnerFormValues) {
  return {
    name: values.name,
    partnerKind: values.partnerKind,
    partnerType: values.partnerType,
    contactName: values.contactName,
    contactRole: values.contactRole,
    contactPhone: values.contactPhone,
    settlementMethod: values.settlementMethod as SettlementMethod | undefined,
    paymentTermRule: values.paymentTermRule as SettlementCycle | undefined,
    settlementNotes: values.settlementNotes,
  }
}

export type { PartnerKind, PartnerType, PartnerContactRole }
