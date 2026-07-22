import { describe, expect, it } from 'vitest'
import {
  PRESET_ROLE_ACTION_KEYS,
  PRESET_ROLE_MENU_KEYS,
  PRESET_ROLE_NAMES,
  type PresetRoleName,
} from '@xiaotuanbao/shared'
import { canEditDeparture } from '@/features/departure/utils/departure-permission'
import { canEditPartner } from '@/features/partner/utils/partner-permission'
import { canEditSupplier } from '@/features/supplier/utils/supplier-permission'
import { canEditProduct } from '@/features/product/utils/product-permission'
import { canMutateFinance } from '@/features/finance/utils/finance-permission'

/**
 * 前端 gating 契约：每个预设角色下，UI gating helper 的结果必须与后端放行口径一致
 * （见 ADR-0023 与 @xiaotuanbao/shared 的能力单一事实源）。任一 helper 被改到错误的
 * capability/key，这里会立即变红——这类 drift 正是"UI 能点、API 403"的根因之一。
 *
 * 期望真值表（true=显示入口且后端放行；false=隐藏且后端 403）：
 *              departure  partner  supplier  product  finance
 *  企业管理员      ✓         ✓        ✓         ✓        ✓
 *  财务            ✗         ✗        ✗         ✗        ✓
 *  计调            ✓         ✓        ✓         ✓        ✗
 */
const EXPECTED: Record<
  string,
  {
    departure: boolean
    partner: boolean
    supplier: boolean
    product: boolean
    finance: boolean
  }
> = {
  [PRESET_ROLE_NAMES.ORG_ADMIN]: {
    departure: true,
    partner: true,
    supplier: true,
    product: true,
    finance: true,
  },
  [PRESET_ROLE_NAMES.FINANCE]: {
    departure: false,
    partner: false,
    supplier: false,
    product: false,
    finance: true,
  },
  [PRESET_ROLE_NAMES.COORDINATOR]: {
    departure: true,
    partner: true,
    supplier: true,
    product: true,
    finance: false,
  },
}

describe('前端权限 gating 契约（ADR-0023）', () => {
  for (const role of Object.values(PRESET_ROLE_NAMES) as PresetRoleName[]) {
    const actionKeys = [...PRESET_ROLE_ACTION_KEYS[role]]
    const menuKeys = [...PRESET_ROLE_MENU_KEYS[role]]
    const expected = EXPECTED[role]

    it(`${role}: 发团编辑 gating = ${expected.departure}`, () => {
      expect(canEditDeparture(actionKeys)).toBe(expected.departure)
    })
    it(`${role}: 合作伙伴维护 gating = ${expected.partner}`, () => {
      expect(canEditPartner(actionKeys)).toBe(expected.partner)
    })
    it(`${role}: 供应商维护 gating = ${expected.supplier}`, () => {
      expect(canEditSupplier(actionKeys)).toBe(expected.supplier)
    })
    it(`${role}: 产品中心维护 gating = ${expected.product}`, () => {
      expect(canEditProduct(actionKeys)).toBe(expected.product)
    })
    it(`${role}: 财务账款操作 gating = ${expected.finance}`, () => {
      expect(canMutateFinance(menuKeys)).toBe(expected.finance)
    })
  }
})
