import {
  DEPARTURE_WRITE_ACTION_KEY,
  PARTNER_WRITE_ACTION_KEY,
  PRODUCT_WRITE_ACTION_KEY,
  SUPPLIER_WRITE_ACTION_KEY,
  type ActionKey,
} from './action-keys'
import { type MenuKey } from './menu-keys'
import { PRESET_ROLE_ACTION_KEYS, PRESET_ROLE_MENU_KEYS, type PresetRoleName } from './roles'

/** 任意一把权限 key：菜单级（路径形）或按钮级（action）。两类命名空间不重叠。 */
export type PermissionKey = MenuKey | ActionKey

export interface CapabilityDefinition {
  /** 面向人的能力名称。 */
  readonly label: string
  /** 触发该能力的后端端点用 `@RequireMenu` 强制校验的权限 key。 */
  readonly requiredKey: PermissionKey
  /** 覆盖范围说明，登记新增写操作时对照。 */
  readonly description: string
}

/**
 * 权限一致性的**单一事实源**（配合 ADR-0023）。
 *
 * 规则：前端每个"点了会触发写/变更接口"的 UI 控件（按钮、操作列、抽屉提交、菜单项……），
 * 其可见/可点性都必须经由 `canPerformCapability(id, grantedKeys)` 派生；后端对应端点则用
 * 同一把 `requiredKey` 经 `@RequireMenu` 校验。两侧共用本表，从结构上杜绝「UI 能点、API 403」。
 *
 * 新增可写能力时：先在此登记 capability，再在前端用 `canPerformCapability` gating、在后端用
 * `@RequireMenu(requiredKey)` 校验。后端权限矩阵测试（apps/api）与前端契约测试（apps/web）会
 * 断言两侧与本表一致，任一处 drift 都会在 CI 变红。
 */
export const CAPABILITIES = {
  departureWrite: {
    label: '发团编辑',
    requiredKey: DEPARTURE_WRITE_ACTION_KEY,
    description:
      '发团 create/copy/update/transition/close/unarchive/purge（误建删除）；客源单/客人名单/行程段/段资源/常用路线的 ' +
      'create/update/delete；资源应付作废。提交应收/应付刻意不在此列（挂 /departure，财务亦可）。',
  },
  partnerWrite: {
    label: '合作伙伴目录维护',
    requiredKey: PARTNER_WRITE_ACTION_KEY,
    description: '合作伙伴目录 create/update/archive/restore。往来账款操作走 financeMutate。',
  },
  supplierWrite: {
    label: '供应商目录维护',
    requiredKey: SUPPLIER_WRITE_ACTION_KEY,
    description: '供应商目录 create/update/archive/restore。往来账款操作走 financeMutate。',
  },
  productWrite: {
    label: '产品中心维护',
    requiredKey: PRODUCT_WRITE_ACTION_KEY,
    description: '产品中心 Product/Spec/Schedule 的 create/update/delete/上下架与班期维护。',
  },
  financeMutate: {
    label: '财务账款操作',
    requiredKey: '/finance/receivable',
    description:
      '登记收/付款、匹配流水/去核销、关闭/重开节点、调整约定金额、新建/编辑/作废流水、核销/撤销核销。' +
      '相关端点分属 /finance/receivable|payable|transactions|verification；预设角色下持有 ' +
      '/finance/receivable ⟺ 持有全部四个 /finance/* 菜单，故统一以它作为前端 gating 口径（后端 ' +
      'PaymentScheduleCancelController 亦以此对齐）。',
  },
} as const satisfies Record<string, CapabilityDefinition>

export type CapabilityId = keyof typeof CAPABILITIES

/** 授予的 key 集合是否包含指定 key。 */
export function hasPermissionKey(grantedKeys: readonly string[], key: PermissionKey): boolean {
  return grantedKeys.includes(key)
}

/**
 * 某组授予的权限 key 是否足以执行该能力。
 *
 * `grantedKeys` 传 actionKeys（当 requiredKey 为 action key 时）、menuKeys（当为 menu key 时），
 * 或直接传两者并集均可——两类 key 命名空间不重叠，不会误判。
 */
export function canPerformCapability(
  capabilityId: CapabilityId,
  grantedKeys: readonly string[],
): boolean {
  return hasPermissionKey(grantedKeys, CAPABILITIES[capabilityId].requiredKey)
}

/** 预设角色被授予的全部权限 key（menu ∪ action），供契约测试与文档化矩阵使用。 */
export function presetRoleGrantedKeys(role: PresetRoleName): PermissionKey[] {
  return [...PRESET_ROLE_MENU_KEYS[role], ...PRESET_ROLE_ACTION_KEYS[role]]
}
