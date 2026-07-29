import { describe, expect, it } from 'vitest'
import type { SourceOrderGuestSummary } from '@/types/api'
import {
  formatGuestCountContrast,
  guestFormFieldRules,
  isGuestFormFieldRequired,
  planSourceOrderGuestSync,
} from './source-order-guest-form'

function guest(
  partial: Partial<SourceOrderGuestSummary> & Pick<SourceOrderGuestSummary, 'id' | 'name'>,
): SourceOrderGuestSummary {
  return {
    sourceOrderId: 'so-1',
    phone: null,
    gender: '',
    notes: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  }
}

describe('source-order-guest-form', () => {
  it('formats guest-list vs source-order headcount contrast', () => {
    expect(formatGuestCountContrast(0, 2)).toBe('客名单 0 人 · 客源单人数 2 人')
    expect(formatGuestCountContrast(3, 3)).toBe('客名单 3 人 · 客源单人数 3 人')
  })

  it('requires only name; phone, gender, and notes are optional', () => {
    expect(isGuestFormFieldRequired('name')).toBe(true)
    expect(isGuestFormFieldRequired('phone')).toBe(false)
    expect(isGuestFormFieldRequired('gender')).toBe(false)
    expect(isGuestFormFieldRequired('notes')).toBe(false)

    expect(guestFormFieldRules.name.some((rule) => rule.required === true)).toBe(true)
    expect(guestFormFieldRules.phone).toEqual([])
    expect(guestFormFieldRules.gender).toEqual([])
    expect(guestFormFieldRules.notes).toEqual([])
  })

  it('plans create/update/delete without inventing headcount writes', () => {
    const baseline = [
      guest({ id: 'g1', name: '甲', phone: '1', gender: 'male', notes: '旧' }),
      guest({ id: 'g2', name: '乙' }),
    ]

    const ops = planSourceOrderGuestSync(baseline, [
      { id: 'g1', name: '甲改', phone: '1', gender: 'male', notes: '新' },
      { id: 'tmp-1', name: '丙' },
    ])

    expect(ops).toEqual([
      { type: 'delete', guestId: 'g2' },
      {
        type: 'update',
        guestId: 'g1',
        payload: { name: '甲改', phone: '1', gender: 'male', notes: '新' },
      },
      { type: 'create', payload: { name: '丙' } },
    ])
  })
})
