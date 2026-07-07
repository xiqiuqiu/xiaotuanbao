import { Button, Card, Col, Descriptions, Divider, Row, Space, Statistic, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Link } from '@tanstack/react-router'
import type { DepartureDetail } from '@/types/api'
import { DepartureStatus } from '@xiaotuanbao/shared'
import {
  DEPARTURE_PROGRESS_COLORS,
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
  DEPARTURE_TYPE_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'

interface DepartureHeaderProps {
  departure: DepartureDetail
}

const responsiveColumns = { xs: 1, sm: 2, md: 3, xl: 4 } as const

export function DepartureHeader({ departure }: DepartureHeaderProps) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Link to="/departure">
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 16 }}>
          返回发团列表
        </Button>
      </Link>

      <Row justify="space-between" align="top" gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Typography.Text type="secondary">{departure.departureNo}</Typography.Text>
          <Typography.Title level={4} style={{ marginTop: 4, marginBottom: 0 }}>
            {departure.name}
          </Typography.Title>
        </Col>
        <Col xs={24} lg={8} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Space wrap>
            <Tag color={DEPARTURE_PROGRESS_COLORS[departure.departureProgress] ?? 'default'}>
              {catalogLabel(DEPARTURE_PROGRESS_LABELS, departure.departureProgress)}
            </Tag>
            <Tag color={DEPARTURE_STATUS_COLORS[departure.status as DepartureStatus] ?? 'default'}>
              {catalogLabel(DEPARTURE_STATUS_LABELS, departure.status)}
            </Tag>
          </Space>
        </Col>
      </Row>

      <Descriptions
        size="small"
        column={responsiveColumns}
        items={[
          { label: '路线名称', children: departure.routeName },
          {
            label: '发团类型',
            children: catalogLabel(DEPARTURE_TYPE_LABELS, departure.departureType),
          },
          { label: '出团日期', children: departure.startDate },
          { label: '结束日期', children: departure.endDate },
          { label: '团期天数', children: `${departure.dayCount} 天` },
        ]}
      />

      <Divider style={{ margin: '16px 0' }} />

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={6} lg={3}>
          <Statistic title="总人数" value={departure.totalGuests} suffix="人" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <Statistic title="原始应收" value={formatCents(departure.grossReceivableCents)} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <Statistic title="优惠合计" value={formatCents(departure.discountCents)} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <Statistic title="实际应收" value={formatCents(departure.netReceivableCents)} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <Statistic title="应付合计" value={formatCents(departure.payableCents)} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <Statistic title="预估毛利" value={formatCents(departure.estimatedMarginCents)} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <Statistic
            title="已收 / 未收"
            value={formatCents(departure.collectedCents)}
            suffix={`/ ${formatCents(departure.uncollectedCents)}`}
          />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <Statistic
            title="已付 / 未付"
            value={formatCents(departure.paidCents)}
            suffix={`/ ${formatCents(departure.unpaidCents)}`}
          />
        </Col>
      </Row>
    </Card>
  )
}
