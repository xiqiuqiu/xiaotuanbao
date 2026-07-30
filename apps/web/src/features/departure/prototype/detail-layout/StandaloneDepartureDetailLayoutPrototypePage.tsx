/**
 * PROTOTYPE — standalone page (no auth). Open without API/DB to compare layouts.
 */
import { Card, Flex, Tag, Typography } from 'antd'
import { DepartureType, type DepartureDetail } from '@xiaotuanbao/shared'
import { DepartureDetailLayoutPrototypeHost } from './DepartureDetailLayoutPrototypeHost'

const MOCK_DEPARTURE = {
  id: 'proto-dep-1',
  departureNo: 'XTB2026070011',
  name: '2026年8月1号 天吐喀伊',
  routeName: '天山喀纳斯环线',
  departureType: DepartureType.INDEPENDENT,
  startDate: '2026-07-28',
  endDate: '2026-08-06',
  totalGuests: 2,
  ownerName: '演示管理员',
  departureProgress: 'in_progress',
  status: 'editing',
} as unknown as DepartureDetail

export function StandaloneDepartureDetailLayoutPrototypePage() {
  if (import.meta.env.PROD) {
    return (
      <div style={{ padding: 48 }}>
        <Typography.Title level={4}>原型仅开发环境可用</Typography.Title>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', padding: 24 }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Flex justify="space-between" align="flex-start" wrap="wrap" gap={12}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {MOCK_DEPARTURE.name}
            </Typography.Title>
            <Typography.Text type="secondary">
              {MOCK_DEPARTURE.departureNo} · {MOCK_DEPARTURE.routeName} ·{' '}
              {MOCK_DEPARTURE.startDate} ~ {MOCK_DEPARTURE.endDate} ·{' '}
              {MOCK_DEPARTURE.totalGuests} 人
            </Typography.Text>
          </div>
          <Flex gap={8}>
            <Tag color="processing">行程·进行中</Tag>
            <Tag color="processing">财务·编辑中</Tag>
          </Flex>
        </Flex>
      </Card>

      <DepartureDetailLayoutPrototypeHost
        departure={MOCK_DEPARTURE}
        standalonePath="/prototype/departure-detail-layout"
      />
    </div>
  )
}
