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

const GROUP_LABELS: Record<DepartureDetailTab['group'], string> = {
  operations: '业务执行',
  finance: '财务处理',
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

  const items: NonNullable<MenuProps['items']> = []
  if (operations.length > 0) {
    items.push({
      type: 'group',
      label: GROUP_LABELS.operations,
      children: operations,
    })
  }
  if (finance.length > 0) {
    items.push({
      type: 'group',
      label: GROUP_LABELS.finance,
      children: finance,
    })
  }

  return items
}

function buildSelectOptions(tabs: readonly DepartureDetailTab[]) {
  type SelectOption = { value: DepartureDetailTabKey; label: string }
  const groupedOptions: Record<
    DepartureDetailTab['group'],
    SelectOption[]
  > = {
    operations: [],
    finance: [],
  }

  for (const tab of tabs) {
    groupedOptions[tab.group].push({ value: tab.key, label: tab.label })
  }

  const result: Array<{ label: string; options: SelectOption[] }> = []
  for (const group of ['operations', 'finance'] as const) {
    if (groupedOptions[group].length > 0) {
      result.push({
        label: GROUP_LABELS[group],
        options: groupedOptions[group],
      })
    }
  }

  return result
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
          options={buildSelectOptions(tabs)}
          labelRender={({ value, label }) => {
            const tab = tabs.find((item) => item.key === value)
            return tab ? `${GROUP_LABELS[tab.group]} · ${label}` : label
          }}
          onChange={(key) => onChange(key)}
        />
      </div>
    </>
  )
}
