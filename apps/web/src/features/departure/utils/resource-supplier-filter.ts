import { ResourceKind, type SupplierAllowedResourceKind } from '@xiaotuanbao/shared'

/**
 * Returns the supplier list filter key for a self-operated resource kind.
 * Returns undefined for outsource (partner path) or unset kind.
 */
export function resolveSupplierFilterKind(
  resourceKind: ResourceKind | undefined,
): SupplierAllowedResourceKind | undefined {
  if (!resourceKind || resourceKind === ResourceKind.OUTSOURCE) {
    return undefined
  }

  return resourceKind as SupplierAllowedResourceKind
}
