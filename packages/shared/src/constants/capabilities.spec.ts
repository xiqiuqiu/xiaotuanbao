import { CAPABILITIES, canPerformCapability, presetRoleGrantedKeys, type CapabilityId } from './capabilities'
import { V1_ACTION_KEYS } from './action-keys'
import { V1_MENU_KEYS } from './menu-keys'
import { PRESET_ROLE_NAMES } from './roles'

const ALL_CAPABILITY_IDS = Object.keys(CAPABILITIES) as CapabilityId[]

/**
 * 预设角色 × 能力 的期望矩阵（ADR-0023）。true = 该角色的 UI 应显示该能力入口且
 * 后端应放行；false = 应隐藏且后端应 403。这是"UI 可见性 ⟺ API 可调"的权威真值表。
 */
const EXPECTED_MATRIX: Record<string, Record<CapabilityId, boolean>> = {
  [PRESET_ROLE_NAMES.ORG_ADMIN]: {
    departureWrite: true,
    partnerWrite: true,
    supplierWrite: true,
    financeMutate: true,
  },
  [PRESET_ROLE_NAMES.FINANCE]: {
    departureWrite: false,
    partnerWrite: false,
    supplierWrite: false,
    financeMutate: true,
  },
  [PRESET_ROLE_NAMES.COORDINATOR]: {
    departureWrite: true,
    partnerWrite: true,
    supplierWrite: true,
    financeMutate: false,
  },
}

describe('CAPABILITIES 单一事实源', () => {
  it('每把 requiredKey 都是已知的 menu key 或 action key', () => {
    const knownKeys = new Set<string>([...V1_MENU_KEYS, ...V1_ACTION_KEYS])
    for (const id of ALL_CAPABILITY_IDS) {
      expect(knownKeys.has(CAPABILITIES[id].requiredKey)).toBe(true)
    }
  })

  it('EXPECTED_MATRIX 覆盖全部能力（新增能力必须登记期望值）', () => {
    for (const role of Object.values(PRESET_ROLE_NAMES)) {
      expect(Object.keys(EXPECTED_MATRIX[role]).sort()).toEqual([...ALL_CAPABILITY_IDS].sort())
    }
  })
})

describe('canPerformCapability 与预设角色矩阵一致', () => {
  for (const role of Object.values(PRESET_ROLE_NAMES)) {
    const grantedKeys = presetRoleGrantedKeys(role)

    for (const capabilityId of ALL_CAPABILITY_IDS) {
      const expected = EXPECTED_MATRIX[role][capabilityId]
      it(`${role} ${expected ? '可' : '不可'}执行 ${capabilityId}`, () => {
        expect(canPerformCapability(capabilityId, grantedKeys)).toBe(expected)
      })
    }
  }
})
