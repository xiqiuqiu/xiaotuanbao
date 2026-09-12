import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResourcePayableContinue, succeededResourceItems } from './ResourcePayableContinue'

const prepareResourcePayableReviews = vi.fn()

vi.mock('@/services/agent-collaboration.service', () => ({
  prepareResourcePayableReviews: (...args: unknown[]) => prepareResourcePayableReviews(...args),
}))

afterEach(() => {
  cleanup()
  prepareResourcePayableReviews.mockReset()
})

it('prepares only the selected successful resources', async () => {
  prepareResourcePayableReviews.mockResolvedValue([{ id: 'pkg-pay-1' }])
  const onPrepared = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <ResourcePayableContinue
          departureId="dep-1"
          conversationId="conv-1"
          onPrepared={onPrepared}
          items={[
            {
              packageId: 'pkg-hotel',
              sourceType: 'segment_resource',
              sourceId: 'res-hotel',
              title: '4月2日住宿',
            },
            {
              packageId: 'pkg-transport',
              sourceType: 'departure_resource',
              sourceId: 'res-transport',
              title: '关西交通',
            },
          ]}
        />
      </App>
    </QueryClientProvider>,
  )

  expect(screen.getByText('资源已写入')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '继续提交应付' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: '关西交通' }))
  fireEvent.click(screen.getByRole('button', { name: '继续提交应付' }))
  await waitFor(() => expect(prepareResourcePayableReviews).toHaveBeenCalledTimes(1))
  expect(prepareResourcePayableReviews).toHaveBeenCalledWith('dep-1', {
    conversationId: 'conv-1',
    items: [{ sourceType: 'departure_resource', sourceId: 'res-transport' }],
  })
  expect(onPrepared).toHaveBeenCalledWith(['pkg-pay-1'])
})

it('omits resources that already have a confirmed payable review in this conversation', () => {
  expect(
    succeededResourceItems(
      [
        {
          decisionCommandId: 'd-1',
          accepted: true,
          items: [
            {
              packageId: 'pkg-hotel',
              status: 'succeeded',
              resultRef: { objectKind: 'segment_resource', objectId: 'res-hotel' },
            },
            {
              packageId: 'pkg-transport',
              status: 'succeeded',
              resultRef: { objectKind: 'departure_resource', objectId: 'res-transport' },
            },
          ],
        },
      ],
      [
        {
          id: 'pkg-hotel',
          payloadSchema: 'departure.segment_resource@v1',
          candidates: [{ fieldKey: 'title', proposedValue: '4月2日住宿' }],
        },
        {
          id: 'pkg-transport',
          payloadSchema: 'departure.departure_resource@v1',
          candidates: [{ fieldKey: 'title', proposedValue: '关西交通' }],
        },
        {
          id: 'pkg-pay-hotel',
          status: 'confirmed',
          payloadSchema: 'resource.payable@v1',
          candidates: [
            { fieldKey: 'sourceType', proposedValue: 'segment_resource' },
            { fieldKey: 'sourceId', proposedValue: 'res-hotel' },
          ],
        },
      ],
    ),
  ).toEqual([
    {
      packageId: 'pkg-transport',
      sourceType: 'departure_resource',
      sourceId: 'res-transport',
      title: '关西交通',
    },
  ])
})

it('keeps resources selectable while payable review is pending or after cancel/reject', () => {
  const confirmations = [
    {
      decisionCommandId: 'd-1',
      accepted: true,
      items: [
        {
          packageId: 'pkg-hotel',
          status: 'succeeded' as const,
          resultRef: { objectKind: 'segment_resource', objectId: 'res-hotel' },
        },
      ],
    },
  ]
  const resourcePkg = {
    id: 'pkg-hotel',
    payloadSchema: 'departure.segment_resource@v1',
    candidates: [{ fieldKey: 'title', proposedValue: '4月2日住宿' }],
  }
  const pendingPay = {
    id: 'pkg-pay-hotel',
    status: 'pending',
    payloadSchema: 'resource.payable@v1',
    candidates: [
      { fieldKey: 'sourceType', proposedValue: 'segment_resource' },
      { fieldKey: 'sourceId', proposedValue: 'res-hotel' },
    ],
  }
  expect(succeededResourceItems(confirmations, [resourcePkg, pendingPay])).toEqual([
    {
      packageId: 'pkg-hotel',
      sourceType: 'segment_resource',
      sourceId: 'res-hotel',
      title: '4月2日住宿',
    },
  ])
  expect(
    succeededResourceItems(confirmations, [
      resourcePkg,
      { ...pendingPay, status: 'cancelled' },
    ]),
  ).toEqual([
    {
      packageId: 'pkg-hotel',
      sourceType: 'segment_resource',
      sourceId: 'res-hotel',
      title: '4月2日住宿',
    },
  ])
})
