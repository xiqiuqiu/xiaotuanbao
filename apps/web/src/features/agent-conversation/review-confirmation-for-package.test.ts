import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { AiReviewPackageView, ReviewConfirmationView } from '@/types/api'
import { confirmationForPackage, useConfirmedReviewInvalidation } from './review-confirmation-for-package'

function confirmation(
  decisionCommandId: string,
  items: ReviewConfirmationView['items'],
): ReviewConfirmationView {
  return { decisionCommandId, accepted: true, items }
}

it('prefers a later succeeded item over an earlier failure for the same package', () => {
  expect(
    confirmationForPackage(
      [
        confirmation('decision-fail', [
          { packageId: 'pkg-1', status: 'failed', reason: '供应商类别不匹配' },
        ]),
        confirmation('decision-ok', [
          {
            packageId: 'pkg-1',
            status: 'succeeded',
            resultRef: { objectKind: 'departure_resource', objectId: 'res-1' },
          },
        ]),
      ],
      'pkg-1',
    ),
  ).toMatchObject({ status: 'succeeded', resultRef: { objectId: 'res-1' } })
})

it('returns the latest item when the package never succeeded', () => {
  expect(
    confirmationForPackage(
      [
        confirmation('decision-1', [{ packageId: 'pkg-1', status: 'failed', reason: '第一次失败' }]),
        confirmation('decision-2', [{ packageId: 'pkg-1', status: 'failed', reason: '第二次失败' }]),
      ],
      'pkg-1',
    ),
  ).toMatchObject({ status: 'failed', reason: '第二次失败' })
})

it('returns undefined when the package has no confirmation items', () => {
  expect(
    confirmationForPackage(
      [confirmation('decision-other', [{ packageId: 'pkg-2', status: 'succeeded' }])],
      'pkg-1',
    ),
  ).toBeUndefined()
})

it.each([
  ['departure.itinerary_segment_update@v1', ['segments', 'dep-1']],
  ['source_order.guests_update@v1', ['source-orders', 'dep-1']],
  ['source_order.guests_update@v1', ['source-order', 'order-1']],
  ['departure.segment_resource@v1', ['segment-resources', 'seg-current']],
  ['departure.departure_resource@v1', ['departure-resources', 'dep-1']],
  ['source_order.receivable@v1', ['departure-receivables', 'dep-1']],
  ['source_order.receivable@v1', ['source-orders', 'dep-1']],
  ['source_order.receivable@v1', ['finance-receivables']],
  ['source_order.receivable@v1', ['partner-receivables', 'partner-1']],
  ['resource.payable@v1', ['segment-resources', 'seg-current']],
  ['resource.payable@v1', ['departure-resources', 'dep-1']],
  ['resource.payable@v1', ['departure-payables', 'dep-1']],
  ['resource.payable@v1', ['finance-payables']],
  ['resource.payable@v1', ['supplier-payables', 'supplier-1']],
  ['resource.payable@v1', ['partner-payables', 'partner-1']],
])('refreshes cached %s business data %j once when a running decision later succeeds', (payloadSchema, key) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(key, { items: [] })
  const pkg = { id: 'pkg-1', status: 'pending' as const, payloadSchema }
  const { rerender, unmount } = renderHook(({ status }: { status: 'running' | 'succeeded' }) =>
    useConfirmedReviewInvalidation('dep-1', pkg, { packageId: pkg.id, status }), {
      initialProps: { status: 'running' },
      wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children),
    })
  expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  rerender({ status: 'succeeded' })
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  client.setQueryData(key, { items: ['fresh'] })
  rerender({ status: 'succeeded' })
  expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  unmount()
  client.clear()
})

it.each(['pending', 'rejected', 'cancelled', 'conflict'] as const)('does not refresh formal data for a %s review', (status) => {
  const client = new QueryClient()
  const key = ['segment-resources', 'seg-1']
  client.setQueryData(key, { items: [] })
  const { unmount } = renderHook(() => useConfirmedReviewInvalidation('dep-1', {
    id: 'pkg-1', status, payloadSchema: 'departure.segment_resource@v1',
  }), { wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children) })
  expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  unmount()
  client.clear()
})

it('refreshes immediately on a successful confirmation response and restores historical confirmed receipts', () => {
  const client = new QueryClient()
  const key = ['segment-resources', 'seg-1']
  client.setQueryData(key, { items: [] })
  const { result, rerender, unmount } = renderHook(({ status }: { status: AiReviewPackageView['status'] }) =>
    useConfirmedReviewInvalidation('dep-1', { id: 'pkg-1', status, payloadSchema: 'departure.segment_resource@v1' }), {
      initialProps: { status: 'pending' },
      wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children),
    })
  act(() => result.current('succeeded'))
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  client.setQueryData(key, { items: ['fresh'] })
  rerender({ status: 'confirmed' })
  expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  unmount()
  const restored = renderHook(() => useConfirmedReviewInvalidation('dep-1', {
    id: 'pkg-1', status: 'confirmed', payloadSchema: 'departure.segment_resource@v1',
  }), { wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children) })
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  restored.unmount()
  client.clear()
})
