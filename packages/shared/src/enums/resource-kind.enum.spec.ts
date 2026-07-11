import {
  ResourceKind,
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_OPTIONS,
  SUPPLIER_ALLOWED_RESOURCE_KINDS,
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

  it('uses unified labels (用车 / 餐 / 门票, not 车队 / 餐厅 / 票务)', () => {
    expect(RESOURCE_KIND_LABELS[ResourceKind.TRANSPORT]).toBe('用车')
    expect(RESOURCE_KIND_LABELS[ResourceKind.MEAL]).toBe('餐')
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

  it('lists every kind once in RESOURCE_KIND_OPTIONS', () => {
    expect(RESOURCE_KIND_OPTIONS.map((item) => item.value).sort()).toEqual(
      Object.values(ResourceKind).sort(),
    )
  })

  it('excludes outsource from supplier-allowed kinds', () => {
    expect(SUPPLIER_ALLOWED_RESOURCE_KINDS).not.toContain(ResourceKind.OUTSOURCE)
    expect(SUPPLIER_ALLOWED_RESOURCE_KINDS.sort()).toEqual(
      Object.values(ResourceKind)
        .filter((kind) => kind !== ResourceKind.OUTSOURCE)
        .sort(),
    )
  })

  it('orders operations-sheet resources by kind, then title, then counterparty', () => {
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
