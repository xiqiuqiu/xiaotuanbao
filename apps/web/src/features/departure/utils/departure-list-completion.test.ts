import { describe, expect, it } from 'vitest'
import {
  deriveExecutionArrangementStatus,
  listDepartureListCompletionItems,
} from './departure-list-completion'

describe('listDepartureListCompletionItems', () => {
  it('always lists four categories with completion coloring gate', () => {
    const items = listDepartureListCompletionItems({
      sourceOrders: '客源未录入',
      segments: '行程5段',
      resources: '资源2项',
      receivables: '应收未提交',
      payables: '应付已提交',
    })

    expect(items.map((item) => item.category)).toEqual([
      '客源录入',
      '执行安排',
      '应收提交',
      '应付提交',
    ])
    expect(items[0]).toMatchObject({ status: '客源未录入', incomplete: true })
    expect(items[1]).toMatchObject({ status: '行程5段·资源2项', incomplete: false })
    expect(items[2]).toMatchObject({ status: '应收未提交', incomplete: true })
    expect(items[3]).toMatchObject({ status: '应付已提交', incomplete: false })
  })

  it('marks execution incomplete when segment or resource is missing', () => {
    expect(
      deriveExecutionArrangementStatus({
        sourceOrders: '客源3单',
        segments: '行程未录入',
        resources: '资源未安排',
        receivables: '应收已提交',
        payables: '应付已提交',
      }),
    ).toBe('行程未录入·资源未安排')

    const items = listDepartureListCompletionItems({
      sourceOrders: '客源3单',
      segments: '行程5段',
      resources: '资源未安排',
      receivables: '应收已提交',
      payables: '应付已提交',
    })
    expect(items[1]).toMatchObject({ status: '资源未安排', incomplete: true })
  })
})
