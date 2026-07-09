import { ResourceKind, SupplierCategory } from '@xiaotuanbao/shared'

const RESOURCE_KIND_TO_SUPPLIER_CATEGORY: Partial<
  Record<ResourceKind, SupplierCategory>
> = {
  [ResourceKind.TRANSPORT]: SupplierCategory.TRANSPORT,
  [ResourceKind.HOTEL]: SupplierCategory.HOTEL,
  [ResourceKind.GUIDE]: SupplierCategory.GUIDE,
  [ResourceKind.TICKET]: SupplierCategory.TICKET,
  [ResourceKind.MEAL]: SupplierCategory.RESTAURANT,
  [ResourceKind.OTHER]: SupplierCategory.OTHER,
}

/**
 * Maps a self-operated resource kind to the supplier category used when
 * filtering the supplier select in the resource drawer.
 * Returns undefined for outsource (partner path) or unset kind.
 */
export function resolveSupplierFilterCategory(
  resourceKind: ResourceKind | undefined,
): SupplierCategory | undefined {
  if (!resourceKind || resourceKind === ResourceKind.OUTSOURCE) {
    return undefined
  }

  return RESOURCE_KIND_TO_SUPPLIER_CATEGORY[resourceKind]
}
