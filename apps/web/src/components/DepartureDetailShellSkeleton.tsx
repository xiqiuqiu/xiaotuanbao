import { Button, Card, Skeleton, Typography } from 'antd'
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
  activeTab = 'overview',
  tabs = DEPARTURE_DETAIL_TABS,
}: DepartureDetailShellSkeletonProps) {
  const operationsCount = tabs.filter((tab) => tab.group === 'operations').length
  const financeCount = tabs.filter((tab) => tab.group === 'finance').length
  const activeTabLabel = tabs.find((tab) => tab.key === activeTab)?.label

  return (
    <div role="status" aria-label="发团详情加载中">
      <Card
        size="small"
        className={headerStyles.headerCard}
        classNames={{ body: headerStyles.headerBody }}
      >
        <Link to="/departure">
          <Button
            type="text"
            aria-label="返回发团列表"
            icon={<ArrowLeftOutlined aria-hidden />}
            className={headerStyles.backButton}
          />
        </Link>
        <div className={styles.headerIdentity}>
          <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 2 }} />
        </div>
      </Card>

      <section className={pageStyles.detailWorkspace} aria-label="发团详情工作区加载中">
        <aside
          className={navigationStyles.taskRail}
          aria-label="发团详情功能导航加载中"
        >
          <div className={styles.navigationGroups}>
            {operationsCount > 0 ? (
              <div className={styles.navigationGroup}>
                <Typography.Text type="secondary">业务执行</Typography.Text>
                <div className={styles.navigationItems}>
                  {Array.from({ length: operationsCount }, (_, index) => (
                    <Skeleton.Button key={`operations-${index}`} active block />
                  ))}
                </div>
              </div>
            ) : null}
            {financeCount > 0 ? (
              <div className={styles.navigationGroup}>
                <Typography.Text type="secondary">财务处理</Typography.Text>
                <div className={styles.navigationItems}>
                  {Array.from({ length: financeCount }, (_, index) => (
                    <Skeleton.Button key={`finance-${index}`} active block />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <div className={navigationStyles.mobileNavigation}>
          <div
            aria-label="发团详情紧凑导航加载中"
            data-active-tab={activeTab}
            title={activeTabLabel}
          >
            <Skeleton.Input
              active
              block
              className={styles.mobileControl}
            />
          </div>
        </div>

        <div className={pageStyles.detailWorkspaceContent}>
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </section>
    </div>
  )
}
