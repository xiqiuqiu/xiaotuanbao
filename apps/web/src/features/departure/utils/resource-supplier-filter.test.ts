import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ResourceKind, SupplierCategory } from '@xiaotuanbao/shared'
import { RESOURCE_KIND_OPTIONS } from '../catalog'
import { SUPPLIER_CATEGORY_OPTIONS } from '../../supplier/catalog'
import { resolveSupplierFilterCategory } from './resource-supplier-filter'

const here = dirname(fileURLToPath(import.meta.url))

describe('resource kind → supplier category filter (bug repro)', () => {
  it('maps each self-operated resource kind to a supplier category', () => {
    const selfOperated = RESOURCE_KIND_OPTIONS.filter((item) => item.value !== 'outsource')

    for (const kind of selfOperated) {
      const category = resolveSupplierFilterCategory(kind.value as ResourceKind)
      expect(
        category,
        `resourceKind=${kind.value} (${kind.label}) should map to a supplier category for filtering`,
      ).toBeDefined()
      expect(SUPPLIER_CATEGORY_OPTIONS.map((item) => item.value)).toContain(category)
    }
  })

  it('maps overlapping kinds to the shared category value', () => {
    expect(resolveSupplierFilterCategory(ResourceKind.HOTEL)).toBe(SupplierCategory.HOTEL)
    expect(resolveSupplierFilterCategory(ResourceKind.TRANSPORT)).toBe(SupplierCategory.TRANSPORT)
    expect(resolveSupplierFilterCategory(ResourceKind.GUIDE)).toBe(SupplierCategory.GUIDE)
    expect(resolveSupplierFilterCategory(ResourceKind.TICKET)).toBe(SupplierCategory.TICKET)
    expect(resolveSupplierFilterCategory(ResourceKind.OTHER)).toBe(SupplierCategory.OTHER)
  })

  it('maps meal to restaurant suppliers', () => {
    expect(resolveSupplierFilterCategory(ResourceKind.MEAL)).toBe(SupplierCategory.RESTAURANT)
  })

  it('does not map outsource to a supplier category', () => {
    expect(resolveSupplierFilterCategory(ResourceKind.OUTSOURCE)).toBeUndefined()
  })

  it('ResourceDrawer lists suppliers with category derived from resourceKind', () => {
    const source = readFileSync(join(here, '../components/ResourceDrawer.tsx'), 'utf8')

    expect(source).toMatch(/resolveSupplierFilterCategory/)
    expect(source).toMatch(/listSuppliers\(\{[\s\S]*category:\s*supplierCategory/)
    expect(source).toMatch(/queryKey:\s*\[[\s\S]*supplierCategory/)
  })
})
