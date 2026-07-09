import type { RuleObject } from 'antd/es/form'

export type GuestFormFieldName = 'name' | 'phone' | 'gender' | 'notes'

export const guestFormFieldRules: Record<GuestFormFieldName, RuleObject[]> = {
  name: [{ required: true, message: '请输入姓名' }],
  phone: [],
  gender: [],
  notes: [],
}

export function isGuestFormFieldRequired(field: GuestFormFieldName): boolean {
  return guestFormFieldRules[field].some((rule) => rule.required === true)
}

/** 设计稿对照条文案：客名单 N · 客源单人数 M（备忘名单 ≠ 客源单人数） */
export function formatGuestCountContrast(
  guestListCount: number,
  sourceOrderGuestCount: number,
): string {
  return `客名单 ${guestListCount} 人 · 客源单人数 ${sourceOrderGuestCount} 人`
}
