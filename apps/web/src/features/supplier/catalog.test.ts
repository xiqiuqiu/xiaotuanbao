import { describe, expect, it } from 'vitest'
import { ResourceKind } from '@xiaotuanbao/shared'
import { SUPPLIER_CATEGORY_LABELS, SUPPLIER_CATEGORY_OPTIONS } from './catalog'

describe('SUPPLIER_CATEGORY_OPTIONS', () => {
  it('shows 用餐 for meal and keeps resource-kind value meal', () => {
    const meal = SUPPLIER_CATEGORY_OPTIONS.find((item) => item.value === ResourceKind.MEAL)
    expect(meal?.label).toBe('用餐')
    expect(SUPPLIER_CATEGORY_LABELS[ResourceKind.MEAL]).toBe('用餐')
  })

  it('places 旅行社 within the first five options', () => {
    const index = SUPPLIER_CATEGORY_OPTIONS.findIndex(
      (item) => item.value === ResourceKind.OUTSOURCE,
    )
    expect(SUPPLIER_CATEGORY_OPTIONS[index]?.label).toBe('旅行社')
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(5)
  })

  it('lists every allowed kind once in supplier display order', () => {
    expect(SUPPLIER_CATEGORY_OPTIONS.map((item) => item.value)).toEqual([
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
  })
})
