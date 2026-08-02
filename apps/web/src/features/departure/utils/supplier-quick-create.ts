import { DirectoryProfileStatus, type ResourceKind } from '@xiaotuanbao/shared'
import type { SupplierSummary } from '@/types/api'
import { ApiError } from '@/lib/request'
import { createSupplier, getSupplier, listSuppliers } from '@/services/supplier.service'

/** Sentinel Select value for the inline「创建“…”」option — never persisted as supplierId. */
export const SUPPLIER_QUICK_CREATE_OPTION_VALUE = '__create_supplier__'

export function formatSupplierQuickCreateOptionLabel(name: string): string {
  return `创建“${name.trim()}”`
}

/** Exact name match after trim (aligned with API uniqueness). */
export function findSupplierByExactName(
  suppliers: readonly Pick<SupplierSummary, 'id' | 'name'>[],
  name: string,
): Pick<SupplierSummary, 'id' | 'name'> | undefined {
  const trimmed = name.trim()
  if (!trimmed) {
    return undefined
  }
  return suppliers.find((item) => item.name === trimmed)
}

export function shouldShowSupplierQuickCreateOption(input: {
  canWriteSupplier: boolean
  /** When false, create option is hidden (e.g. resource kind not chosen yet). */
  categoryReady: boolean
  searchText: string
  suppliers: readonly Pick<SupplierSummary, 'name'>[]
}): boolean {
  const trimmed = input.searchText.trim()
  if (!input.canWriteSupplier || !input.categoryReady || !trimmed) {
    return false
  }
  return !input.suppliers.some((item) => item.name === trimmed)
}

export function shouldShowResourceSupplierCreateOption(input: {
  canWriteSupplier: boolean
  resourceKind: ResourceKind | undefined
  searchText: string
  suppliers: readonly Pick<SupplierSummary, 'name'>[]
}): boolean {
  return shouldShowSupplierQuickCreateOption({
    canWriteSupplier: input.canWriteSupplier,
    categoryReady: Boolean(input.resourceKind),
    searchText: input.searchText,
    suppliers: input.suppliers,
  })
}

/**
 * Whether a duplicate-name supplier can be selected for the target category.
 */
export function resolveDuplicateSupplierSelection(input: {
  supplier: Pick<SupplierSummary, 'id' | 'name' | 'categories' | 'status'>
  resourceKind: ResourceKind
}):
  | { ok: true; supplierId: string }
  | { ok: false; reason: 'not_active' | 'missing_category' } {
  if (input.supplier.status !== DirectoryProfileStatus.ACTIVE) {
    return { ok: false, reason: 'not_active' }
  }
  if (!input.supplier.categories.includes(input.resourceKind)) {
    return { ok: false, reason: 'missing_category' }
  }
  return { ok: true, supplierId: input.supplier.id }
}

export function duplicateSupplierWarningMessage(
  reason: 'not_active' | 'missing_category',
): string {
  return reason === 'missing_category'
    ? '供应商已存在，但未包含当前类别，请到供应商管理补充类别或另选'
    : '同名供应商不可用（已停用或已归档），请到供应商管理处理或改用其他名称'
}

/**
 * Create a supplier by name+category, or resolve an exact-name duplicate.
 */
export async function createOrResolveSupplierByName(input: {
  name: string
  category: ResourceKind
  localCandidates?: readonly Pick<SupplierSummary, 'id' | 'name'>[]
  resolveLocal?: (id: string) => SupplierSummary | undefined | Promise<SupplierSummary | undefined>
}): Promise<{ kind: 'created' | 'existing'; supplier: SupplierSummary }> {
  const trimmed = input.name.trim()
  if (!trimmed) {
    throw new Error('请输入供应商名称')
  }

  const localMatch = findSupplierByExactName(input.localCandidates ?? [], trimmed)
  if (localMatch) {
    const resolved = input.resolveLocal
      ? await input.resolveLocal(localMatch.id)
      : undefined
    if (resolved) {
      return { kind: 'existing', supplier: resolved }
    }
    const fetched = await getSupplier(localMatch.id)
    return { kind: 'existing', supplier: fetched }
  }

  try {
    const created = await createSupplier(
      { name: trimmed, categories: [input.category] },
      { silentError: true },
    )
    return { kind: 'created', supplier: created }
  } catch (error) {
    if (!(error instanceof ApiError) || error.message !== '供应商名称已存在') {
      throw error
    }

    const listed = await listSuppliers({
      search: trimmed,
      includeArchived: true,
      pageSize: 100,
    })
    const existing = findSupplierByExactName(listed.items, trimmed)
    if (!existing) {
      throw error
    }
    const full =
      listed.items.find((item) => item.id === existing.id) ?? (await getSupplier(existing.id))
    return { kind: 'existing', supplier: full }
  }
}
