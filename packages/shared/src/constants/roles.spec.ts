import { V1_MENU_KEYS } from './menu-keys'
import {
  EARLY_LAUNCH_BUSINESS_MENU_KEYS,
  PRESET_ROLE_MENU_KEYS,
  PRESET_ROLE_NAMES,
} from './roles'

describe('PRESET_ROLE_MENU_KEYS (ADR-0016)', () => {
  it('aligns 财务 and 计调 to the same early-launch business menu set', () => {
    expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.FINANCE]).toEqual(
      EARLY_LAUNCH_BUSINESS_MENU_KEYS,
    )
    expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).toEqual(
      EARLY_LAUNCH_BUSINESS_MENU_KEYS,
    )
  })

  it('keeps /system/* admin-only', () => {
    const systemKeys = V1_MENU_KEYS.filter((key) => key.startsWith('/system/'))

    for (const key of systemKeys) {
      expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.FINANCE]).not.toContain(key)
      expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).not.toContain(key)
    }

    expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.ORG_ADMIN]).toEqual(V1_MENU_KEYS)
  })
})
