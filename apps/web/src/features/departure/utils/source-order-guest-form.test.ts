import { describe, expect, it } from 'vitest'
import {
  formatGuestCountContrast,
  guestFormFieldRules,
  isGuestFormFieldRequired,
} from './source-order-guest-form'

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
})
