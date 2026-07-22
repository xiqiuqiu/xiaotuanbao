/**
 * ADR-0023: Action (button-level) permission keys. Stored in the same
 * `Permission` table as menu keys but never path-shaped, so `/auth/me` splits
 * them into `actionKeys` (button gating) rather than `menuKeys` (menu/route
 * filtering).
 */
export const DEPARTURE_WRITE_ACTION_KEY = 'departure:write' as const

export const PARTNER_WRITE_ACTION_KEY = 'partner:write' as const

export const SUPPLIER_WRITE_ACTION_KEY = 'supplier:write' as const

export const PRODUCT_WRITE_ACTION_KEY = 'product:write' as const

export const V1_ACTION_KEYS = [
  DEPARTURE_WRITE_ACTION_KEY,
  PARTNER_WRITE_ACTION_KEY,
  SUPPLIER_WRITE_ACTION_KEY,
  PRODUCT_WRITE_ACTION_KEY,
] as const

export type ActionKey = (typeof V1_ACTION_KEYS)[number]

export const ACTION_KEY_LABELS: Record<ActionKey, string> = {
  'departure:write': '发团编辑',
  'partner:write': '合作伙伴目录维护',
  'supplier:write': '供应商目录维护',
  'product:write': '产品中心维护',
}
