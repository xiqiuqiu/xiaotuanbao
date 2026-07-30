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

export function DepartureDetailNavigation({
  activeTab,
  tabs,
  onChange,
}: DepartureDetailNavigationProps) {
  return (
    <nav className={styles.topTabBar} aria-label="发团详情功能导航">
      <div className={styles.topTabList} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`${styles.topTab} ${
              activeTab === tab.key ? styles.topTabActive : ''
            }`}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
