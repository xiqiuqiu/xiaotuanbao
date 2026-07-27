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

/**
 * Resource-kind picker options (添加/编辑资源、等).
 * 拼出 kept in the first five for common use; meal UI label「用餐」.
 */
export const RESOURCE_KIND_OPTIONS = [
  { value: ResourceKind.TRANSPORT, label: '用车' },
  { value: ResourceKind.HOTEL, label: '酒店' },
  { value: ResourceKind.GUIDE, label: '导游' },
  { value: ResourceKind.OUTSOURCE, label: '拼出' },
  { value: ResourceKind.TICKET, label: '门票' },
  { value: ResourceKind.MEAL, label: '用餐' },
  { value: ResourceKind.SCENIC, label: '景区' },
  { value: ResourceKind.SHOP, label: '购物店' },
  { value: ResourceKind.ENTERTAINMENT, label: '演出' },
  { value: ResourceKind.INSURANCE, label: '保险' },
  { value: ResourceKind.OTHER, label: '其他' },
] as const

export const RESOURCE_KIND_LABELS = Object.fromEntries(
  RESOURCE_KIND_OPTIONS.map((item) => [item.value, item.label]),
) as Record<ResourceKind, string>

/**
 * Resource kinds allowed on supplier category sets.
 * Includes outsource（供应商类别 UI label「旅行社」；资源种类仍为「拼出」）.
 */
export const SUPPLIER_ALLOWED_RESOURCE_KINDS = Object.values(ResourceKind) as ResourceKind[]

export type SupplierAllowedResourceKind = ResourceKind

/** Supplier-category label for outsource; resource-kind label stays「拼出». */
export const SUPPLIER_CATEGORY_OUTSOURCE_LABEL = '旅行社'

/** Supplier-category label for meal (aligned with resource-kind UI「用餐」). */
export const SUPPLIER_CATEGORY_MEAL_LABEL = '用餐'

/**
 * Display order for supplier-category pickers (filters / forms).
 * Matches RESOURCE_KIND_OPTIONS picker order; outsource shown as 旅行社.
 */
export const SUPPLIER_CATEGORY_SORT_ORDER: readonly ResourceKind[] = RESOURCE_KIND_OPTIONS.map(
  (item) => item.value,
)

/**
 * Fixed Resource Kind order for Departure Operations Sheet (CONTEXT / ADR-0018).
 * Independent of picker display order in RESOURCE_KIND_OPTIONS.
 */
export const RESOURCE_KIND_SORT_ORDER: readonly ResourceKind[] = [
  ResourceKind.TRANSPORT,
  ResourceKind.HOTEL,
  ResourceKind.GUIDE,
  ResourceKind.TICKET,
  ResourceKind.MEAL,
  ResourceKind.SCENIC,
  ResourceKind.SHOP,
  ResourceKind.ENTERTAINMENT,
  ResourceKind.INSURANCE,
  ResourceKind.OUTSOURCE,
  ResourceKind.OTHER,
]

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
