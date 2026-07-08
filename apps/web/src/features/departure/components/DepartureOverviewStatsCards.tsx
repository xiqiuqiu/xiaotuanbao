import { Card, Col, Row, Statistic } from 'antd'
import type { DepartureDetail } from '@/types/api'
import { formatCents } from '../catalog'

interface DepartureOverviewStatsCardsProps {
  departure: DepartureDetail
}

export function DepartureOverviewStatsCards({ departure }: DepartureOverviewStatsCardsProps) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={12} sm={8} md={6} lg={6}>
        <Card>
          <Statistic title="总人数" value={departure.totalGuests} suffix="人" />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={6}>
        <Card>
          <Statistic title="原始应收" value={formatCents(departure.grossReceivableCents)} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={6}>
        <Card>
          <Statistic title="优惠合计" value={formatCents(departure.discountCents)} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={6}>
        <Card>
          <Statistic title="实际应收" value={formatCents(departure.netReceivableCents)} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={6}>
        <Card>
          <Statistic title="应付合计" value={formatCents(departure.payableCents)} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={6}>
        <Card>
          <Statistic title="预估毛利" value={formatCents(departure.estimatedMarginCents)} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={6}>
        <Card>
          <Statistic
            title="已收 / 未收"
            value={formatCents(departure.collectedCents)}
            suffix={`/ ${formatCents(departure.uncollectedCents)}`}
          />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={6}>
        <Card>
          <Statistic
            title="已付 / 未付"
            value={formatCents(departure.paidCents)}
            suffix={`/ ${formatCents(departure.unpaidCents)}`}
          />
        </Card>
      </Col>
    </Row>
  )
}
