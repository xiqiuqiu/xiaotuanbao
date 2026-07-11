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

/** Fixed Resource Kind order for Departure Operations Sheet (CONTEXT / ADR-0018). */
export const RESOURCE_KIND_SORT_ORDER: readonly ResourceKind[] = RESOURCE_KIND_OPTIONS.map(
  (item) => item.value,
)

export function resourceKindSortIndex(kind: string): number {
  const index = RESOURCE_KIND_SORT_ORDER.indexOf(kind as ResourceKind)
  return index === -1 ? RESOURCE_KIND_SORT_ORDER.length : index
}

/** Stable segment-resource ordering: kind → title → counterparty name. */
export function compareSegmentResourcesForOperationsSheet(
  left: { resourceKind: string; title: string; counterpartyName: string },
  right: { resourceKind: string; title: string; counterpartyName: string },
): number {
  const kindDiff = resourceKindSortIndex(left.resourceKind) - resourceKindSortIndex(right.resourceKind)
  if (kindDiff !== 0) {
    return kindDiff
  }

  const titleDiff = left.title.localeCompare(right.title, 'zh-CN')
  if (titleDiff !== 0) {
    return titleDiff
  }

  return left.counterpartyName.localeCompare(right.counterpartyName, 'zh-CN')
}

