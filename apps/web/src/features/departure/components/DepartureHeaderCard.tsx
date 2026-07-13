import { Button, Card, Col, Descriptions, Dropdown, Row, Space, Tag, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { ArrowLeftOutlined, DownOutlined } from '@ant-design/icons'
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
} from '../catalog'
import { DepartureArchiveHistory } from './DepartureArchiveHistory'
import { DepartureSettlementHistory } from './DepartureSettlementHistory'

const responsiveColumns = { xs: 1, sm: 2, md: 3, xl: 4 } as const

type DepartureHeaderCardProps = {
  departure: DepartureDetail
  menuItems: NonNullable<MenuProps['items']>
}

export function DepartureHeaderCard({ departure, menuItems }: DepartureHeaderCardProps) {
  const ownerLabel = departure.ownerName ?? '-'

  return (
    <Card style={{ marginBottom: 16 }}>
      <Link to="/departure">
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 16 }}>
          返回发团列表
        </Button>
      </Link>

      <Row justify="space-between" align="top" gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Typography.Text type="secondary">{departure.departureNo}</Typography.Text>
          <Typography.Title level={4} style={{ marginTop: 4, marginBottom: 0 }}>
            {departure.name}
          </Typography.Title>
        </Col>
        <Col xs={24} lg={10} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Space wrap align="center">
            <Tag color={DEPARTURE_PROGRESS_COLORS[departure.departureProgress] ?? 'default'}>
              {catalogLabel(DEPARTURE_PROGRESS_LABELS, departure.departureProgress)}
            </Tag>
            <Tag color={DEPARTURE_STATUS_COLORS[departure.status as DepartureStatus] ?? 'default'}>
              {catalogLabel(DEPARTURE_STATUS_LABELS, departure.status)}
            </Tag>
            <Dropdown menu={{ items: menuItems }}>
              <Button type="link" style={{ paddingInline: 0 }}>
                操作 <DownOutlined />
              </Button>
            </Dropdown>
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
          { label: '发团负责人', children: ownerLabel },
        ]}
      />

      <DepartureArchiveHistory items={departure.archiveHistory ?? []} />
      <DepartureSettlementHistory items={departure.settlementHistory ?? []} />
    </Card>
  )
}
