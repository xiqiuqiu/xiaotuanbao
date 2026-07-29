import { Button, Card, Skeleton, Tabs } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Link } from '@tanstack/react-router'
import {
  DEPARTURE_DETAIL_TABS,
  type DepartureDetailTabKey,
} from '@/features/departure/catalog'

type DepartureDetailShellSkeletonProps = {
  activeTab?: DepartureDetailTabKey
}

/** Progressive shell for departure detail while the header query is in flight. */
export function DepartureDetailShellSkeleton({
  activeTab = 'overview',
}: DepartureDetailShellSkeletonProps) {
  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Link to="/departure">
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 16 }}>
            返回发团列表
          </Button>
        </Link>
        <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 3 }} />
      </Card>

      <Tabs
        activeKey={activeTab}
        items={DEPARTURE_DETAIL_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          children: <Skeleton active paragraph={{ rows: 6 }} />,
        }))}
      />
    </div>
  )
}
