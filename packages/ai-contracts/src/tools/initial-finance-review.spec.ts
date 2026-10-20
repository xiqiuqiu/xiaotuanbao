import { submitInitialFinanceReviewModelInputSchema } from './initial-finance-review'
const evidence = [{ kind: 'user_message', sequence: 1, excerpt: '继续提交这笔应付' }]
const c = (fieldKey: string, proposedValue: unknown) => ({ fieldKey, proposedValue, clarity: 'clear', evidence })
const payable = { objectVersion: 1, confirmationUnit: 'resource_payable', candidates: [c('sourceType', 'segment_resource'), c('sourceId', 'resource-1')] }
it('accepts only a single receivable source or a single typed payable source', () => {
  expect(submitInitialFinanceReviewModelInputSchema.parse(payable)).toEqual(payable)
  expect(submitInitialFinanceReviewModelInputSchema.safeParse({ objectVersion: 1, confirmationUnit: 'source_order_receivable', candidates: [c('sourceOrderId', 'order-1')] }).success).toBe(true)
})
it.each([
  { ...payable, amountCents: 1 },
  { ...payable, reviewPackageId: 'finance-1' },
  { ...payable, candidates: [c('sourceId', 'resource-1')] },
  { ...payable, candidates: [c('sourceId', 'resource-1'), c('sourceId', 'resource-2')] },
  { ...payable, candidates: [...payable.candidates, c('amountCents', 10000)] },
  { ...payable, candidates: [c('sourceType', 'source_order'), c('sourceId', 'resource-1')] },
  { ...payable, candidates: payable.candidates.map((candidate) => ({ ...candidate, evidence: [{ kind: 'system_derivation', rule: '继续' }] })) },
])('rejects untrusted money, unsupported sources and missing user authorization evidence %#', (input) => {
  expect(submitInitialFinanceReviewModelInputSchema.safeParse(input).success).toBe(false)
})
