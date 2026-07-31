import {
  ResourceKind,
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_OPTIONS,
  RESOURCE_KIND_SORT_ORDER,
  SUPPLIER_ALLOWED_RESOURCE_KINDS,
  SUPPLIER_CATEGORY_MEAL_LABEL,
  SUPPLIER_CATEGORY_OUTSOURCE_LABEL,
  SUPPLIER_CATEGORY_SORT_ORDER,
  compareSegmentResourcesForOperationsSheet,
} from './resource-kind.enum'

describe('ResourceKind', () => {
  it('exposes the ADR-0005 member set', () => {
    expect(Object.values(ResourceKind).sort()).toEqual(
      [
        'entertainment',
        'guide',
        'hotel',
        'insurance',
        'meal',
        'other',
        'outsource',
        'scenic',
        'shop',
        'ticket',
        'transport',
      ].sort(),
    )
  })

  it('uses unified labels (用车 / 用餐 / 门票, not 车队 / 餐厅 / 票务)', () => {
    expect(RESOURCE_KIND_LABELS[ResourceKind.TRANSPORT]).toBe('用车')
    expect(RESOURCE_KIND_LABELS[ResourceKind.MEAL]).toBe('用餐')
    expect(RESOURCE_KIND_LABELS[ResourceKind.TICKET]).toBe('门票')
    expect(RESOURCE_KIND_LABELS[ResourceKind.HOTEL]).toBe('酒店')
    expect(RESOURCE_KIND_LABELS[ResourceKind.GUIDE]).toBe('导游')
    expect(RESOURCE_KIND_LABELS[ResourceKind.SCENIC]).toBe('景区')
    expect(RESOURCE_KIND_LABELS[ResourceKind.SHOP]).toBe('购物店')
    expect(RESOURCE_KIND_LABELS[ResourceKind.ENTERTAINMENT]).toBe('演出')
    expect(RESOURCE_KIND_LABELS[ResourceKind.INSURANCE]).toBe('保险')
    expect(RESOURCE_KIND_LABELS[ResourceKind.OUTSOURCE]).toBe('拼出')
    expect(RESOURCE_KIND_LABELS[ResourceKind.OTHER]).toBe('其他')
  })

  it('lists execution resource kinds without 购物店/演出; 拼出 stays in first five', () => {
    expect(RESOURCE_KIND_OPTIONS.map((item) => item.value)).toEqual([
      ResourceKind.TRANSPORT,
      ResourceKind.HOTEL,
      ResourceKind.GUIDE,
      ResourceKind.OUTSOURCE,
      ResourceKind.TICKET,
      ResourceKind.MEAL,
      ResourceKind.SCENIC,
      ResourceKind.INSURANCE,
      ResourceKind.OTHER,
    ])
    expect(RESOURCE_KIND_OPTIONS.map((item) => item.value)).not.toContain(ResourceKind.SHOP)
    expect(RESOURCE_KIND_OPTIONS.map((item) => item.value)).not.toContain(
      ResourceKind.ENTERTAINMENT,
    )
    expect(RESOURCE_KIND_OPTIONS.findIndex((o) => o.value === ResourceKind.OUTSOURCE)).toBeLessThan(
      5,
    )
  })

  it('includes outsource in supplier-allowed kinds (category label 旅行社)', () => {
    expect(SUPPLIER_ALLOWED_RESOURCE_KINDS).toContain(ResourceKind.OUTSOURCE)
    expect([...SUPPLIER_ALLOWED_RESOURCE_KINDS].sort()).toEqual(
      Object.values(ResourceKind).sort(),
    )
  })

  it('aligns supplier meal label and picker order with resource kinds', () => {
    expect(SUPPLIER_CATEGORY_MEAL_LABEL).toBe('用餐')
    expect(RESOURCE_KIND_LABELS[ResourceKind.MEAL]).toBe('用餐')
    expect(SUPPLIER_CATEGORY_OUTSOURCE_LABEL).toBe('旅行社')
    expect(RESOURCE_KIND_LABELS[ResourceKind.OUTSOURCE]).toBe('拼出')
    expect([...SUPPLIER_CATEGORY_SORT_ORDER]).toEqual([
      ResourceKind.TRANSPORT,
      ResourceKind.HOTEL,
      ResourceKind.GUIDE,
      ResourceKind.OUTSOURCE,
      ResourceKind.TICKET,
      ResourceKind.MEAL,
      ResourceKind.SCENIC,
      ResourceKind.SHOP,
      ResourceKind.ENTERTAINMENT,
      ResourceKind.INSURANCE,
      ResourceKind.OTHER,
    ])
    expect(SUPPLIER_CATEGORY_SORT_ORDER.indexOf(ResourceKind.OUTSOURCE)).toBeLessThan(5)
  })

  it('keeps operations-sheet kind order independent of picker order', () => {
    expect([...RESOURCE_KIND_SORT_ORDER]).toEqual([
      ResourceKind.TRANSPORT,
      ResourceKind.HOTEL,
      ResourceKind.GUIDE,
      ResourceKind.TICKET,
      ResourceKind.MEAL,
      ResourceKind.SCENIC,
      ResourceKind.SHOP,
      ResourceKind.ENTERTAINMENT,
      ResourceKind.INSURANCE,
      ResourceKind.OUTSOURCE,
      ResourceKind.OTHER,
    ])

    const rows = [
      { resourceKind: ResourceKind.MEAL, title: '晚餐', counterpartyName: '供应商甲' },
      { resourceKind: ResourceKind.HOTEL, title: '酒店B', counterpartyName: '供应商甲' },
      { resourceKind: ResourceKind.HOTEL, title: '酒店A', counterpartyName: '供应商乙' },
      { resourceKind: ResourceKind.HOTEL, title: '酒店A', counterpartyName: '供应商甲' },
      { resourceKind: ResourceKind.OUTSOURCE, title: '拼出', counterpartyName: '同行' },
    ]

    expect([...rows].sort(compareSegmentResourcesForOperationsSheet)).toEqual([
      { resourceKind: ResourceKind.HOTEL, title: '酒店A', counterpartyName: '供应商甲' },
      { resourceKind: ResourceKind.HOTEL, title: '酒店A', counterpartyName: '供应商乙' },
      { resourceKind: ResourceKind.HOTEL, title: '酒店B', counterpartyName: '供应商甲' },
      { resourceKind: ResourceKind.MEAL, title: '晚餐', counterpartyName: '供应商甲' },
      { resourceKind: ResourceKind.OUTSOURCE, title: '拼出', counterpartyName: '同行' },
    ])
  })
})
