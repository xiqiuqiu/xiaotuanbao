import { V1_MENU_KEYS } from './menu-keys'
import { V1_ACTION_KEYS } from './action-keys'
import { PRESET_ROLE_ACTION_KEYS, PRESET_ROLE_MENU_KEYS, PRESET_ROLE_NAMES } from './roles'

describe('PRESET_ROLE_MENU_KEYS (ADR-0023)', () => {
  it('gives 计调 only 工作台/发团/产品中心/合作伙伴/供应商 (no /finance/*)', () => {
    expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).toEqual([
      '/',
      '/departure',
      '/product',
      '/partner',
      '/supplier',
    ])
  })

  it('gives 财务 the business menus plus the four /finance/* menus', () => {
    expect(PRESET_ROLE_MENU_KEYS[PRESET_ROLE_NAMES.FINANCE]).toEqual([
      '/',
      '/departure',
      '/product',
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

describe('PRESET_ROLE_ACTION_KEYS (ADR-0023)', () => {
  it('grants departure:write to 计调 and 企业管理员 but not 财务', () => {
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).toContain('departure:write')
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.ORG_ADMIN]).toContain('departure:write')
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.FINANCE]).not.toContain('departure:write')
  })

  it('grants partner:write to 计调 and 企业管理员 but not 财务', () => {
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).toContain('partner:write')
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.ORG_ADMIN]).toContain('partner:write')
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.FINANCE]).not.toContain('partner:write')
  })

  it('grants supplier:write to 计调 and 企业管理员 but not 财务', () => {
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).toContain('supplier:write')
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.ORG_ADMIN]).toContain('supplier:write')
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.FINANCE]).not.toContain('supplier:write')
  })

  it('grants product:write to 计调 and 企业管理员 but not 财务', () => {
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.COORDINATOR]).toContain('product:write')
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.ORG_ADMIN]).toContain('product:write')
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.FINANCE]).not.toContain('product:write')
  })

  it('gives 财务 no action keys at all', () => {
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.FINANCE]).toEqual([])
  })

  it('gives 企业管理员 the full action-key catalog', () => {
    expect(PRESET_ROLE_ACTION_KEYS[PRESET_ROLE_NAMES.ORG_ADMIN]).toEqual(V1_ACTION_KEYS)
  })
})
