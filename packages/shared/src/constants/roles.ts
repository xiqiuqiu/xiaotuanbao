import { V1_MENU_KEYS, type MenuKey } from './menu-keys'

export const PRESET_ROLE_NAMES = {
  ORG_ADMIN: '企业管理员',
  FINANCE: '财务',
  COORDINATOR: '计调',
} as const

export type PresetRoleName = (typeof PRESET_ROLE_NAMES)[keyof typeof PRESET_ROLE_NAMES]

const FINANCE_MENU_KEYS: MenuKey[] = [
  '/',
  '/finance/receivable',
  '/finance/payable',
  '/finance/transactions',
  '/finance/verification',
]

const COORDINATOR_MENU_KEYS: MenuKey[] = ['/', '/departure', '/partner', '/supplier']

export const PRESET_ROLE_MENU_KEYS: Record<PresetRoleName, readonly MenuKey[]> = {
  [PRESET_ROLE_NAMES.ORG_ADMIN]: V1_MENU_KEYS,
  [PRESET_ROLE_NAMES.FINANCE]: FINANCE_MENU_KEYS,
  [PRESET_ROLE_NAMES.COORDINATOR]: COORDINATOR_MENU_KEYS,
}
