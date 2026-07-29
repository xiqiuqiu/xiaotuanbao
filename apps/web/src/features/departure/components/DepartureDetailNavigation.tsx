import { Menu, Select } from 'antd'
import type { MenuProps } from 'antd'
import type {
  DepartureDetailTab,
  DepartureDetailTabKey,
} from '../catalog'
import styles from './DepartureDetailNavigation.module.css'

type DepartureDetailNavigationProps = {
  activeTab: DepartureDetailTabKey
  tabs: readonly DepartureDetailTab[]
  onChange: (tab: DepartureDetailTabKey) => void
}

function buildMenuItems(
  tabs: readonly DepartureDetailTab[],
): NonNullable<MenuProps['items']> {
  const operations: Array<{ key: DepartureDetailTabKey; label: string }> = []
  const finance: Array<{ key: DepartureDetailTabKey; label: string }> = []

  for (const tab of tabs) {
    const item = { key: tab.key, label: tab.label }
    if (tab.group === 'operations') {
      operations.push(item)
    } else {
      finance.push(item)
    }
  }

  return [
    {
      type: 'group',
      label: '业务执行',
      children: operations,
    },
    {
      type: 'group',
      label: '财务处理',
      children: finance,
    },
  ]
}

export function DepartureDetailNavigation({
  activeTab,
  tabs,
  onChange,
}: DepartureDetailNavigationProps) {
  return (
    <>
      <aside className={styles.taskRail} aria-label="发团详情功能导航">
        <Menu
          mode="inline"
          selectedKeys={[activeTab]}
          items={buildMenuItems(tabs)}
          onClick={({ key }) => onChange(key as DepartureDetailTabKey)}
        />
      </aside>

      <div className={styles.mobileNavigation}>
        <Select
          aria-label="切换发团详情功能"
          value={activeTab}
          options={tabs.map((tab) => ({ value: tab.key, label: tab.label }))}
          onChange={(key) => onChange(key)}
        />
      </div>
    </>
  )
}
