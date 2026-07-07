import { Card, Col, Row, Statistic } from 'antd'
import { TeamOutlined } from '@ant-design/icons'
import type { PartnerListSummary } from '@/types/api'

interface PartnerStatsCardsProps {
  summary?: PartnerListSummary
}

export function PartnerStatsCards({ summary }: PartnerStatsCardsProps) {
  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={6}>
        <Card>
          <Statistic
            title="合作伙伴总数"
            value={summary?.total ?? 0}
            prefix={<TeamOutlined />}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="客户方" value={summary?.groupAgent ?? 0} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="承接方" value={summary?.peer ?? 0} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="双向合作" value={summary?.both ?? 0} />
        </Card>
      </Col>
    </Row>
  )
}
