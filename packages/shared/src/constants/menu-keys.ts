export const V1_MENU_KEYS = [
  '/',
  '/departure',
  '/finance/receivable',
  '/finance/payable',
  '/finance/transactions',
  '/finance/verification',
  '/partner',
  '/supplier',
  '/system/organization',
  '/system/users',
  '/system/roles',
] as const

export type MenuKey = (typeof V1_MENU_KEYS)[number]

export const MENU_KEY_LABELS: Record<MenuKey, string> = {
  '/': '工作台',
  '/departure': '发团管理',
  '/finance/receivable': '应收管理',
  '/finance/payable': '应付管理',
  '/finance/transactions': '财务流水',
  '/finance/verification': '核销管理',
  '/partner': '合作伙伴',
  '/supplier': '供应商管理',
  '/system/organization': '组织管理',
  '/system/users': '员工管理',
  '/system/roles': '角色权限',
}
