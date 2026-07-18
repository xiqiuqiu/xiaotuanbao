import { V1_MENU_KEYS, type MenuKey } from './menu-keys'

export const PRESET_ROLE_NAMES = {
  ORG_ADMIN: '企业管理员',
  FINANCE: '财务',
  COORDINATOR: '计调',
} as const

export type PresetRoleName = (typeof PRESET_ROLE_NAMES)[keyof typeof PRESET_ROLE_NAMES]

/**
 * ADR-0023: 计调 sees 工作台/发团/合作伙伴/供应商 only; hides `/finance/*` and `/system/*`.
 */
const COORDINATOR_MENU_KEYS: readonly MenuKey[] = ['/', '/departure', '/partner', '/supplier']

/**
 * ADR-0023: 财务 sees the same business menus plus the four `/finance/*` menus; hides `/system/*`.
 */
const FINANCE_MENU_KEYS: readonly MenuKey[] = [
  ...COORDINATOR_MENU_KEYS,
  '/finance/receivable',
  '/finance/payable',
  '/finance/transactions',
  '/finance/verification',
]

export const PRESET_ROLE_MENU_KEYS: Record<PresetRoleName, readonly MenuKey[]> = {
  [PRESET_ROLE_NAMES.ORG_ADMIN]: V1_MENU_KEYS,
  [PRESET_ROLE_NAMES.FINANCE]: FINANCE_MENU_KEYS,
  [PRESET_ROLE_NAMES.COORDINATOR]: COORDINATOR_MENU_KEYS,
}
