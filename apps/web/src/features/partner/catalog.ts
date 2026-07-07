import {
  PartnerContactRole,
  PartnerKind,
  PartnerType,
} from '@xiaotuanbao/shared'

export const PARTNER_KIND_OPTIONS = [
  { value: PartnerKind.GROUP_AGENT, label: '客户方' },
  { value: PartnerKind.PEER, label: '承接方' },
  { value: PartnerKind.BOTH, label: '双向合作' },
] as const

export const PARTNER_KIND_LABELS = Object.fromEntries(
  PARTNER_KIND_OPTIONS.map((item) => [item.value, item.label]),
) as Record<PartnerKind, string>

export const PARTNER_TYPE_OPTIONS = [
  { value: PartnerType.GROUP_AGENCY, label: '组团社' },
  { value: PartnerType.LOCAL_AGENCY, label: '地接社' },
  { value: PartnerType.WHOLESALER, label: '渠道商' },
  { value: PartnerType.INTEGRATED_AGENCY, label: '综合旅行社' },
  { value: PartnerType.OTHER, label: '其他' },
] as const

export const PARTNER_TYPE_LABELS = Object.fromEntries(
  PARTNER_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<PartnerType, string>

export const PARTNER_CONTACT_ROLE_OPTIONS = [
  { value: PartnerContactRole.OWNER, label: '老板' },
  { value: PartnerContactRole.OPERATOR, label: '计调' },
  { value: PartnerContactRole.FINANCE, label: '财务' },
  { value: PartnerContactRole.SALES, label: '销售' },
  { value: PartnerContactRole.CUSTOMER_SERVICE, label: '客服' },
  { value: PartnerContactRole.OTHER, label: '其他' },
] as const

export { catalogLabel } from '../directory/catalog'
