import { Card, Col, Row, Statistic, theme } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import type { EmployeeListStats } from '@/types/api'

interface EmployeeStatsCardsProps {
  stats?: EmployeeListStats
}

export function EmployeeStatsCards({ stats }: EmployeeStatsCardsProps) {
  const { token } = theme.useToken()

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col xs={12} sm={12} xl={6}>
        <Card>
          <Statistic title="员工总数" value={stats?.total ?? 0} prefix={<UserOutlined />} />
        </Card>
      </Col>
      <Col xs={12} sm={12} xl={6}>
        <Card>
          <Statistic
            title="启用"
            value={stats?.enabled ?? 0}
            styles={{ content: { color: token.colorSuccess } }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} xl={6}>
        <Card>
          <Statistic
            title="停用"
            value={stats?.disabled ?? 0}
            styles={{ content: { color: token.colorError } }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} xl={6}>
        <Card>
          <Statistic title="今日新增" value={stats?.createdToday ?? 0} />
        </Card>
      </Col>
    </Row>
  )
}
