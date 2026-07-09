import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ResourceKind, SUPPLIER_ALLOWED_RESOURCE_KINDS } from '@xiaotuanbao/shared'
import { RESOURCE_KIND_OPTIONS } from '../catalog'
import {
  resolveSupplierFilterKind,
  resolveSupplierIdAfterKindChange,
} from './resource-supplier-filter'

const here = dirname(fileURLToPath(import.meta.url))

describe('resource kind → supplier filter (issue #64)', () => {
  it('returns the resourceKind itself for each self-operated kind (∈ filter key)', () => {
    const selfOperated = RESOURCE_KIND_OPTIONS.filter((item) => item.value !== 'outsource')

    for (const kind of selfOperated) {
      const filter = resolveSupplierFilterKind(kind.value as ResourceKind)
      expect(
        filter,
        `resourceKind=${kind.value} (${kind.label}) should be a supplier filter key`,
      ).toBe(kind.value)
      expect(SUPPLIER_ALLOWED_RESOURCE_KINDS).toContain(filter)
    }
  })

  it('does not map outsource to a supplier filter', () => {
    expect(resolveSupplierFilterKind(ResourceKind.OUTSOURCE)).toBeUndefined()
  })

  it('ResourceDrawer lists suppliers with category containment filter from resourceKind', () => {
    const source = readFileSync(join(here, '../components/ResourceDrawer.tsx'), 'utf8')

    expect(source).toMatch(/resolveSupplierFilterKind/)
    expect(source).toMatch(/listSuppliers\(\{[\s\S]*category:\s*supplierFilterKind/)
    expect(source).toMatch(/queryKey:\s*\[[\s\S]*supplierFilterKind/)
    expect(source).toMatch(/getSupplier\(editingSupplierId/)
  })
})

describe('resolveSupplierIdAfterKindChange (issue #64)', () => {
  const hotelMealCategories = [ResourceKind.HOTEL, ResourceKind.MEAL]
  const supplierId = 'supplier-hotel-meal'

  it('keeps supplier when next kind is still in categories', () => {
    expect(
      resolveSupplierIdAfterKindChange({
        nextKind: ResourceKind.MEAL,
        currentSupplierId: supplierId,
        currentSupplierCategories: hotelMealCategories,
      }),
    ).toBe(supplierId)

    expect(
      resolveSupplierIdAfterKindChange({
        nextKind: ResourceKind.HOTEL,
        currentSupplierId: supplierId,
        currentSupplierCategories: hotelMealCategories,
      }),
    ).toBe(supplierId)
  })

  it('clears supplier when next kind is not in categories', () => {
    expect(
      resolveSupplierIdAfterKindChange({
        nextKind: ResourceKind.TRANSPORT,
        currentSupplierId: supplierId,
        currentSupplierCategories: hotelMealCategories,
      }),
    ).toBeUndefined()
  })

  it('clears supplier when switching to outsource', () => {
    expect(
      resolveSupplierIdAfterKindChange({
        nextKind: ResourceKind.OUTSOURCE,
        currentSupplierId: supplierId,
        currentSupplierCategories: hotelMealCategories,
      }),
    ).toBeUndefined()
  })

  it('clears when no supplier is selected', () => {
    expect(
      resolveSupplierIdAfterKindChange({
        nextKind: ResourceKind.HOTEL,
        currentSupplierId: undefined,
        currentSupplierCategories: hotelMealCategories,
      }),
    ).toBeUndefined()
  })

  it('ResourceDrawer uses retain/clear helper on resourceKind change', () => {
    const source = readFileSync(join(here, '../components/ResourceDrawer.tsx'), 'utf8')

    expect(source).toMatch(/resolveSupplierIdAfterKindChange/)
    expect(source).not.toMatch(
      /onChange=\{\(\)\s*=>\s*\{\s*form\.setFieldsValue\(\{\s*partnerId:\s*undefined,\s*supplierId:\s*undefined/,
    )
  })
})
