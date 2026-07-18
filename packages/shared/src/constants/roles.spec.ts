import { V1_MENU_KEYS } from './menu-keys'
import { PRESET_ROLE_MENU_KEYS, PRESET_ROLE_NAMES } from './roles'

describe('PRESET_ROLE_MENU_KEYS (ADR-0023)', () => {
  it('gives 计调 only 工作台/发团/合作伙伴/供应商 (no /finance/*)', () => {
    expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).toEqual([
      '/',
      '/departure',
      '/partner',
      '/supplier',
    ])
  })

  it('gives 财务 the business menus plus the four /finance/* menus', () => {
    expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.FINANCE]).toEqual([
      '/',
      '/departure',
      '/partner',
      '/supplier',
      '/finance/receivable',
      '/finance/payable',
      '/finance/transactions',
      '/finance/verification',
    ])
  })

  it('keeps /system/* admin-only and gives 企业管理员 all menus', () => {
    const systemKeys = V1_MENU_KEYS.filter((key) => key.startsWith('/system/'))

    for (const key of systemKeys) {
      expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.FINANCE]).not.toContain(key)
      expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).not.toContain(key)
    }

    expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.ORG_ADMIN]).toEqual(V1_MENU_KEYS)
  })

  it('hides /finance/* from 计调 but not from 财务', () => {
    const financeKeys = V1_MENU_KEYS.filter((key) => key.startsWith('/finance/'))

    for (const key of financeKeys) {
      expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).not.toContain(key)
      expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.FINANCE]).toContain(key)
    }
  })
})
