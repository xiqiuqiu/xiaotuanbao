import { V1_MENU_KEYS, type MenuKey } from './menu-keys'

export const PRESET_ROLE_NAMES = {
  ORG_ADMIN: '企业管理员',
  FINANCE: '财务',
  COORDINATOR: '计调',
} as const

export type PresetRoleName = (typeof PRESET_ROLE_NAMES)[keyof typeof PRESET_ROLE_NAMES]

/**
 * ADR-0016: early-launch temporary alignment of 财务 + 计调 business menus.
 * Excludes `/system/*` (admin-only). Do not treat as the long-term role boundary.
 */
export const EARLY_LAUNCH_BUSINESS_MENU_KEYS: readonly MenuKey[] = [
  '/',
  '/departure',
  '/finance/receivable',
  '/finance/payable',
  '/finance/transactions',
  '/finance/verification',
  '/partner',
  '/supplier',
]

export const PRESET_ROLE_MENU_KEYS: Record<PresetRoleName, readonly MenuKey[]> = {
  [PRESET_ROLE_NAMES.ORG_ADMIN]: V1_MENU_KEYS,
  [PRESET_ROLE_NAMES.FINANCE]: EARLY_LAUNCH_BUSINESS_MENU_KEYS,
  [PRESET_ROLE_NAMES.COORDINATOR]: EARLY_LAUNCH_BUSINESS_MENU_KEYS,
}
