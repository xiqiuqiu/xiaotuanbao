import { ResourceKind, type SupplierAllowedResourceKind } from '@xiaotuanbao/shared'

/**
 * Returns the supplier list filter key for a resource kind (含拼出→outsource／旅行社).
 * List API matches suppliers whose categories contain this kind (∈).
 */
export function resolveSupplierFilterKind(
  resourceKind: ResourceKind | undefined,
): SupplierAllowedResourceKind | undefined {
  if (!resourceKind) {
    return undefined
  }

  return resourceKind as SupplierAllowedResourceKind
}

/**
 * When resource kind changes: keep the current supplier if the new kind is still
 * in that supplier's category set; otherwise clear.
 */
export function resolveSupplierIdAfterKindChange(input: {
  nextKind: ResourceKind
  currentSupplierId?: string
  currentSupplierCategories?: readonly string[]
}): string | undefined {
  const { currentSupplierId, currentSupplierCategories } = input
  if (!currentSupplierId || !currentSupplierCategories) {
    return undefined
  }

  if (currentSupplierCategories.includes(input.nextKind)) {
    return currentSupplierId
  }

  return undefined
}
