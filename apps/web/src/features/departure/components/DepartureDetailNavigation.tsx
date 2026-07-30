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
  const operations = tabs.filter((tab) => tab.group === 'operations')
  const finance = tabs.filter((tab) => tab.group === 'finance')
  const showDivider = operations.length > 0 && finance.length > 0

  return (
    <nav className={styles.topTabBar} aria-label="发团详情功能导航">
      <div className={styles.topTabList} role="tablist">
        {operations.map((tab) => (
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

        {showDivider ? (
          <div className={styles.topTabDivider} aria-hidden="true" />
        ) : null}

        {finance.map((tab) => (
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
