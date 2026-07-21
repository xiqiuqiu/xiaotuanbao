import type { ReactNode } from 'react'
import type { MenuProps } from 'antd'
import {
  BankOutlined,
  DashboardOutlined,
  DollarOutlined,
  ProductOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'

type MenuItem = Required<MenuProps>['items'][number]

function item(label: string, key: string, icon?: ReactNode, children?: MenuItem[]): MenuItem {
  return { label, key, icon, children }
}

export const mainMenuItems: MenuItem[] = [
  item('工作台', '/', <DashboardOutlined />),
  item('发团管理', '/departure', <UnorderedListOutlined />),
  item('产品中心', '/product', <ProductOutlined />),
  item('合作伙伴', '/partner', <TeamOutlined />),
  item('供应商管理', '/supplier', <BankOutlined />),
  item('财务管理', 'finance', <DollarOutlined />, [
    item('应收管理', '/finance/receivable'),
    item('应付管理', '/finance/payable'),
    item('收支流水', '/finance/transactions'),
    item('核销管理', '/finance/verification'),
  ]),
  item('系统管理', 'system', <SettingOutlined />, [
    item('组织管理', '/system/organization'),
    item('员工管理', '/system/users'),
  ]),
]

export const routeTitles: Record<string, string> = {
  '/': '工作台',
  '/departure': '发团管理',
  '/product': '产品中心',
  '/finance/receivable': '应收管理',
  '/finance/payable': '应付管理',
  '/finance/transactions': '收支流水',
  '/finance/verification': '核销管理',
  '/partner': '合作伙伴',
  '/supplier': '供应商管理',
  '/system/organization': '组织管理',
  '/system/users': '员工管理',
}
