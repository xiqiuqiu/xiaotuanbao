import { expect, it } from 'vitest'
import type { ReviewConfirmationView } from '@/types/api'
import { confirmationForPackage } from './review-confirmation-for-package'

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
