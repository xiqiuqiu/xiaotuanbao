/**
 * ADR-0023: Action (button-level) permission keys. Stored in the same
 * `Permission` table as menu keys but never path-shaped, so `/auth/me` splits
 * them into `actionKeys` (button gating) rather than `menuKeys` (menu/route
 * filtering). Grow this list as later tickets add `partner:write` / `supplier:write`.
 */
export const DEPARTURE_WRITE_ACTION_KEY = 'departure:write' as const

export const V1_ACTION_KEYS = [DEPARTURE_WRITE_ACTION_KEY] as const

export type ActionKey = (typeof V1_ACTION_KEYS)[number]

export const ACTION_KEY_LABELS: Record<ActionKey, string> = {
  'departure:write': '发团编辑',
}
