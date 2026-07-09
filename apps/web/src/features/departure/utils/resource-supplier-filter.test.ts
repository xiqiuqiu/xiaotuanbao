import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ResourceKind, SUPPLIER_ALLOWED_RESOURCE_KINDS } from '@xiaotuanbao/shared'
import { RESOURCE_KIND_OPTIONS } from '../catalog'
import { resolveSupplierFilterKind } from './resource-supplier-filter'

const here = dirname(fileURLToPath(import.meta.url))

describe('resource kind → supplier filter (issue #62)', () => {
  it('returns the resourceKind itself for each self-operated kind', () => {
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

  it('passes through overlapping kinds unchanged', () => {
    expect(resolveSupplierFilterKind(ResourceKind.HOTEL)).toBe(ResourceKind.HOTEL)
    expect(resolveSupplierFilterKind(ResourceKind.TRANSPORT)).toBe(ResourceKind.TRANSPORT)
    expect(resolveSupplierFilterKind(ResourceKind.GUIDE)).toBe(ResourceKind.GUIDE)
    expect(resolveSupplierFilterKind(ResourceKind.TICKET)).toBe(ResourceKind.TICKET)
    expect(resolveSupplierFilterKind(ResourceKind.MEAL)).toBe(ResourceKind.MEAL)
    expect(resolveSupplierFilterKind(ResourceKind.OTHER)).toBe(ResourceKind.OTHER)
  })

  it('does not map outsource to a supplier filter', () => {
    expect(resolveSupplierFilterKind(ResourceKind.OUTSOURCE)).toBeUndefined()
  })

  it('ResourceDrawer lists suppliers with category derived from resourceKind', () => {
    const source = readFileSync(join(here, '../components/ResourceDrawer.tsx'), 'utf8')

    expect(source).toMatch(/resolveSupplierFilterKind/)
    expect(source).toMatch(/listSuppliers\(\{[\s\S]*category:\s*supplierFilterKind/)
    expect(source).toMatch(/queryKey:\s*\[[\s\S]*supplierFilterKind/)
  })
})
