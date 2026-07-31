import { Button, Skeleton } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Link } from '@tanstack/react-router'
import {
  DEPARTURE_DETAIL_TABS,
  type DepartureDetailTab,
  type DepartureDetailTabKey,
} from '@/features/departure/catalog'
import headerStyles from '@/features/departure/components/DepartureHeaderCard.module.css'
import navigationStyles from '@/features/departure/components/DepartureDetailNavigation.module.css'
import pageStyles from '@/features/departure/pages/DepartureDetailPage.module.css'
import styles from './DepartureDetailShellSkeleton.module.css'

type DepartureDetailShellSkeletonProps = {
  activeTab?: DepartureDetailTabKey
  tabs?: readonly DepartureDetailTab[]
}

/** Progressive shell for departure detail while the header query is in flight. */
export function DepartureDetailShellSkeleton({
  tabs = DEPARTURE_DETAIL_TABS,
}: DepartureDetailShellSkeletonProps) {
  const operations = tabs.filter((tab) => tab.group === 'operations')
  const finance = tabs.filter((tab) => tab.group === 'finance')
  const showDivider = operations.length > 0 && finance.length > 0

  return (
    <div role="status" aria-label="发团详情加载中">
      <div className={headerStyles.shell}>
        <div className={headerStyles.top}>
          <Link to="/departure">
            <Button
              type="text"
              aria-label="返回发团列表"
              icon={<ArrowLeftOutlined aria-hidden />}
              className={headerStyles.backButton}
            />
          </Link>
          <div className={`${headerStyles.identity} ${styles.headerIdentity}`}>
            <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 1 }} />
          </div>
        </div>
        <div className={headerStyles.metaRow}>
          <Skeleton.Input active size="small" style={{ width: 240 }} />
        </div>
      </div>

      <section className={pageStyles.detailWorkspace} aria-label="发团详情工作区加载中">
        <nav
          className={navigationStyles.topTabBar}
          aria-label="发团详情功能导航加载中"
        >
          <div
            className={`${navigationStyles.topTabList} ${styles.topTabSkeletonList}`}
            role="tablist"
          >
            {operations.map((tab) => (
              <Skeleton.Button
                key={tab.key}
                active
                size="small"
                className={styles.topTabSkeleton}
              />
            ))}

            {showDivider ? (
              <div className={navigationStyles.topTabDivider} aria-hidden="true" />
            ) : null}

            {finance.map((tab) => (
              <Skeleton.Button
                key={tab.key}
                active
                size="small"
                className={styles.topTabSkeleton}
              />
            ))}
          </div>
        </nav>

        <div className={pageStyles.detailWorkspaceContent}>
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </section>
    </div>
  )
}
