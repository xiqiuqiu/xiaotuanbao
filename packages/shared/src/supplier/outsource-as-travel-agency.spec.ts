import { ResourceKind, RESOURCE_KIND_LABELS, SUPPLIER_ALLOWED_RESOURCE_KINDS } from '../enums/resource-kind.enum'
import { normalizeSupplierCategories } from './normalize-supplier-categories'

/**
 * Target behavior (product): suppliers may carry category 旅行社 (= outsource),
 * so 拼出 resources pick Supplier by category containment — not Partner 承接方.
 */
describe('outsource as supplier category 旅行社 (target)', () => {
  it('allows outsource in supplier category sets', () => {
    expect(SUPPLIER_ALLOWED_RESOURCE_KINDS).toContain(ResourceKind.OUTSOURCE)
    expect(normalizeSupplierCategories([ResourceKind.OUTSOURCE])).toEqual([
      ResourceKind.OUTSOURCE,
    ])
  })

  it('keeps resource-kind label 拼出 (supplier UI may override to 旅行社)', () => {
    expect(RESOURCE_KIND_LABELS[ResourceKind.OUTSOURCE]).toBe('拼出')
  })
})
