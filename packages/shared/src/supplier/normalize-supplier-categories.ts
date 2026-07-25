import {
  SUPPLIER_ALLOWED_RESOURCE_KINDS,
  type SupplierAllowedResourceKind,
} from '../enums/resource-kind.enum'

export class InvalidSupplierCategoriesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSupplierCategoriesError'
  }
}

const ALLOWED = new Set<string>(SUPPLIER_ALLOWED_RESOURCE_KINDS)

/**
 * Normalize and validate supplier category sets.
 * Non-empty; each item must be a supplier-allowed ResourceKind（含 outsource／旅行社）.
 */
export function normalizeSupplierCategories(
  categories: readonly string[] | null | undefined,
): SupplierAllowedResourceKind[] {
  if (!categories || categories.length === 0) {
    throw new InvalidSupplierCategoriesError('供应商类别不能为空')
  }

  const unique: SupplierAllowedResourceKind[] = []
  const seen = new Set<string>()

  for (const raw of categories) {
    if (!ALLOWED.has(raw)) {
      throw new InvalidSupplierCategoriesError(`无效的供应商类别：${raw}`)
    }
    if (seen.has(raw)) {
      continue
    }
    seen.add(raw)
    unique.push(raw as SupplierAllowedResourceKind)
  }

  if (unique.length === 0) {
    throw new InvalidSupplierCategoriesError('供应商类别不能为空')
  }

  return unique
}
