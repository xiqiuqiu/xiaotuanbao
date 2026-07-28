import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NEXT_ACTION_DISMISS_KEY_PREFIX,
  buildNextActionFingerprint,
  dismissNextAction,
  getDismissedFingerprint,
  isNextActionDismissed,
} from './departure-next-action-dismiss'
import type { DepartureNextAction } from './departure-next-action'

function makeAction(
  overrides: Partial<DepartureNextAction> = {},
): DepartureNextAction {
  return {
    type: 'warning',
    title: '客源尚未完备',
    description: '客源未录入',
    action: {
      label: '完善客源',
      tab: 'sourceOrders',
    },
    ...overrides,
  }
}

describe('buildNextActionFingerprint', () => {
  it('builds a stable fingerprint from type, title, description, tab and intent', () => {
    const fingerprint = buildNextActionFingerprint(makeAction())
    expect(fingerprint).toBe(
      ['warning', '客源尚未完备', '客源未录入', 'sourceOrders', ''].join('\u0001'),
    )
  })

  it('changes when guidance content changes', () => {
    const a = buildNextActionFingerprint(makeAction())
    const b = buildNextActionFingerprint(
      makeAction({
        title: '行程、资源尚未完备',
        description: '行程未录入、资源未安排',
        action: { label: '完善行程与资源', tab: 'execution' },
      }),
    )
    expect(a).not.toBe(b)
  })

  it('includes intent when present', () => {
    const fingerprint = buildNextActionFingerprint(
      makeAction({
        type: 'info',
        title: '资料已就绪，可切换为待结算',
        description: '客源、行程与资源已录入完毕。',
        action: { label: '切换为待结算', intent: 'pending_settlement' },
      }),
    )
    expect(fingerprint).toContain('pending_settlement')
  })
})

describe('dismiss storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and reads dismissed fingerprint per departure', () => {
    const fingerprint = buildNextActionFingerprint(makeAction())
    dismissNextAction('dep-1', fingerprint)

    expect(getDismissedFingerprint('dep-1')).toBe(fingerprint)
    expect(isNextActionDismissed('dep-1', fingerprint)).toBe(true)
    expect(isNextActionDismissed('dep-2', fingerprint)).toBe(false)
    expect(
      localStorage.getItem(`${NEXT_ACTION_DISMISS_KEY_PREFIX}dep-1`),
    ).toBe(fingerprint)
  })

  it('does not treat a different fingerprint as dismissed', () => {
    const first = buildNextActionFingerprint(makeAction())
    const second = buildNextActionFingerprint(
      makeAction({ title: '尚有应收未生成' }),
    )
    dismissNextAction('dep-1', first)

    expect(isNextActionDismissed('dep-1', first)).toBe(true)
    expect(isNextActionDismissed('dep-1', second)).toBe(false)
  })

  it('returns null when localStorage getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(getDismissedFingerprint('dep-1')).toBeNull()
    expect(isNextActionDismissed('dep-1', 'fp')).toBe(false)

    vi.restoreAllMocks()
  })

  it('swallows localStorage setItem failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    expect(() => dismissNextAction('dep-1', 'fp')).not.toThrow()

    vi.restoreAllMocks()
  })
})
