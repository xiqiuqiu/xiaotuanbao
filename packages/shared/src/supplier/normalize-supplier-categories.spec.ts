import { ResourceKind } from '../enums/resource-kind.enum'
import {
  InvalidSupplierCategoriesError,
  normalizeSupplierCategories,
} from './normalize-supplier-categories'

describe('normalizeSupplierCategories', () => {
  it('accepts a non-empty set of supplier-allowed kinds', () => {
    expect(normalizeSupplierCategories([ResourceKind.HOTEL, ResourceKind.MEAL])).toEqual([
      ResourceKind.HOTEL,
      ResourceKind.MEAL,
    ])
  })

  it('deduplicates while preserving first-seen order', () => {
    expect(
      normalizeSupplierCategories([
        ResourceKind.TRANSPORT,
        ResourceKind.HOTEL,
        ResourceKind.TRANSPORT,
      ]),
    ).toEqual([ResourceKind.TRANSPORT, ResourceKind.HOTEL])
  })

  it('rejects empty categories', () => {
    expect(() => normalizeSupplierCategories([])).toThrow(InvalidSupplierCategoriesError)
    expect(() => normalizeSupplierCategories([])).toThrow('供应商类别不能为空')
  })

  it('rejects nullish categories', () => {
    expect(() => normalizeSupplierCategories(null)).toThrow('供应商类别不能为空')
    expect(() => normalizeSupplierCategories(undefined)).toThrow('供应商类别不能为空')
  })

  it('rejects outsource', () => {
    expect(() => normalizeSupplierCategories([ResourceKind.OUTSOURCE])).toThrow(
      '拼出不得作为供应商类别',
    )
    expect(() =>
      normalizeSupplierCategories([ResourceKind.HOTEL, ResourceKind.OUTSOURCE]),
    ).toThrow('拼出不得作为供应商类别')
  })

  it('rejects unknown or legacy values such as restaurant', () => {
    expect(() => normalizeSupplierCategories(['restaurant'])).toThrow(
      '无效的供应商类别：restaurant',
    )
  })
})
