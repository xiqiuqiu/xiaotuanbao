export enum ResourceKind {
  TRANSPORT = 'transport',
  HOTEL = 'hotel',
  GUIDE = 'guide',
  TICKET = 'ticket',
  MEAL = 'meal',
  SCENIC = 'scenic',
  SHOP = 'shop',
  ENTERTAINMENT = 'entertainment',
  INSURANCE = 'insurance',
  OUTSOURCE = 'outsource',
  OTHER = 'other',
}

export const RESOURCE_KIND_OPTIONS = [
  { value: ResourceKind.TRANSPORT, label: '用车' },
  { value: ResourceKind.HOTEL, label: '酒店' },
  { value: ResourceKind.GUIDE, label: '导游' },
  { value: ResourceKind.TICKET, label: '门票' },
  { value: ResourceKind.MEAL, label: '餐' },
  { value: ResourceKind.SCENIC, label: '景区' },
  { value: ResourceKind.SHOP, label: '购物店' },
  { value: ResourceKind.ENTERTAINMENT, label: '演出' },
  { value: ResourceKind.INSURANCE, label: '保险' },
  { value: ResourceKind.OUTSOURCE, label: '拼出' },
  { value: ResourceKind.OTHER, label: '其他' },
] as const

export const RESOURCE_KIND_LABELS = Object.fromEntries(
  RESOURCE_KIND_OPTIONS.map((item) => [item.value, item.label]),
) as Record<ResourceKind, string>

/** Resource kinds allowed on supplier category sets (excludes outsource). */
export const SUPPLIER_ALLOWED_RESOURCE_KINDS = Object.values(ResourceKind).filter(
  (kind) => kind !== ResourceKind.OUTSOURCE,
) as Exclude<ResourceKind, ResourceKind.OUTSOURCE>[]

export type SupplierAllowedResourceKind = (typeof SUPPLIER_ALLOWED_RESOURCE_KINDS)[number]
