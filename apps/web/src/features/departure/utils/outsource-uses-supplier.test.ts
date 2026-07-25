import { describe, expect, it } from 'vitest'
import { ResourceKind } from '@xiaotuanbao/shared'
import { SUPPLIER_CATEGORY_OPTIONS, SUPPLIER_CATEGORY_LABELS } from '@/features/supplier/catalog'
import { formValuesToPayload } from './resource-form'
import { resolveSupplierFilterKind } from './resource-supplier-filter'

/**
 * Target: 拼出 resources use Supplier (filtered by outsource/旅行社), not Partner 承接方.
 */
describe('拼出 uses supplier 旅行社 (target)', () => {
  it('exposes 旅行社 in supplier category options', () => {
    const option = SUPPLIER_CATEGORY_OPTIONS.find((item) => item.value === ResourceKind.OUTSOURCE)
    expect(option?.label).toBe('旅行社')
    expect(SUPPLIER_CATEGORY_LABELS[ResourceKind.OUTSOURCE]).toBe('旅行社')
  })

  it('maps outsource resource kind to supplier filter outsource', () => {
    expect(resolveSupplierFilterKind(ResourceKind.OUTSOURCE)).toBe(ResourceKind.OUTSOURCE)
  })

  it('serializes outsource form values with supplierId (not partnerId)', () => {
    expect(
      formValuesToPayload({
        resourceKind: ResourceKind.OUTSOURCE,
        supplierId: 'supplier-travel-agency',
        partnerId: 'partner-should-be-ignored',
        amountYuan: 100,
      }),
    ).toEqual({
      resourceKind: ResourceKind.OUTSOURCE,
      supplierId: 'supplier-travel-agency',
      amountCents: 10000,
      title: undefined,
      notes: undefined,
    })
  })
})
