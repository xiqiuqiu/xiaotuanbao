import { ResourceKind, type SupplierAllowedResourceKind } from '@xiaotuanbao/shared'

/**
 * Returns the supplier list filter key for a self-operated resource kind.
 * List API matches suppliers whose categories contain this kind (∈).
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

/**
 * When resource kind changes: keep the current supplier if the new kind is still
 * in that supplier's category set; otherwise clear. Outsource always clears.
 */
export function resolveSupplierIdAfterKindChange(input: {
  nextKind: ResourceKind
  currentSupplierId?: string
  currentSupplierCategories?: readonly string[]
}): string | undefined {
  if (input.nextKind === ResourceKind.OUTSOURCE) {
    return undefined
  }

  const { currentSupplierId, currentSupplierCategories } = input
  if (!currentSupplierId || !currentSupplierCategories) {
    return undefined
  }

  if (currentSupplierCategories.includes(input.nextKind)) {
    return currentSupplierId
  }

  return undefined
}
