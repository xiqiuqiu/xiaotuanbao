import { Card, Col, Row, Statistic } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import type { EmployeeListStats } from '@/types/api'

interface EmployeeStatsCardsProps {
  stats?: EmployeeListStats
}

export function EmployeeStatsCards({ stats }: EmployeeStatsCardsProps) {
  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={6}>
        <Card>
          <Statistic title="员工总数" value={stats?.total ?? 0} prefix={<UserOutlined />} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="启用" value={stats?.enabled ?? 0} valueStyle={{ color: '#3f8600' }} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="停用" value={stats?.disabled ?? 0} valueStyle={{ color: '#cf1322' }} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="今日新增" value={stats?.createdToday ?? 0} />
        </Card>
      </Col>
    </Row>
  )
}
