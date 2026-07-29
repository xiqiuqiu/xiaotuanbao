import { useMemo } from 'react'
import { Button, Card, Col, Dropdown, Row, Space, Tag, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { ArrowLeftOutlined, DownOutlined } from '@ant-design/icons'
import { useNavigate, useRouter, useRouterState, useSearch } from '@tanstack/react-router'
import type { DepartureDetail } from '@/types/api'
import { DepartureStatus } from '@xiaotuanbao/shared'
import {
  DEPARTURE_PROGRESS_COLORS,
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
  catalogLabel,
} from '../catalog'
import { resolveDepartureDetailBackAction } from '../utils/departure-detail-back'
import { mergeDepartureHistoryItems } from '../utils/departure-history'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
import { DepartureHistoryDrawer } from './DepartureHistoryDrawer'

type DepartureHeaderCardProps = {
  departure: DepartureDetail
  menuItems: NonNullable<MenuProps['items']>
  primaryAction?: { label: string; onClick: () => void } | null
  historyOpen: boolean
  onHistoryOpenChange: (open: boolean) => void
}

export function DepartureHeaderCard({
  departure,
  menuItems,
  primaryAction = null,
  historyOpen,
  onHistoryOpenChange,
}: DepartureHeaderCardProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const locationState = useRouterState({ select: (state) => state.location.state })
  const search = useSearch({ strict: false }) as { listReturn?: string }
  const ownerLabel = departure.ownerName ?? '-'

  const historyItems = useMemo(
    () =>
      mergeDepartureHistoryItems({
        archiveHistory: departure.archiveHistory ?? [],
        settlementHistory: departure.settlementHistory ?? [],
      }),
    [departure.archiveHistory, departure.settlementHistory],
  )
  const latestHistory = historyItems[0]
  const historyCount = historyItems.length
  const backAction = resolveDepartureDetailBackAction(locationState, search.listReturn)
  const backLabel = backAction.type === 'departure-list' ? '返回发团管理' : '返回'

  const handleBack = () => {
    if (backAction.type === 'departure-list') {
      void navigate({ to: '/departure', search: backAction.search })
      return
    }

    if (router.history.canGoBack()) {
      router.history.back()
      return
    }

    void navigate({ to: '/departure' })
  }

  const metaLine = [
    departure.routeName,
    `${departure.startDate} ~ ${departure.endDate}`,
    `负责人 ${ownerLabel}`,
    `${departure.totalGuests} 人`,
  ].join(' · ')

  return (
    <Card style={{ marginBottom: 16 }}>
      <Button
        type="text"
        aria-label={backLabel}
        icon={<ArrowLeftOutlined aria-hidden />}
        style={{ paddingLeft: 0, marginBottom: 12 }}
        onClick={handleBack}
      >
        {backLabel}
      </Button>

      <Row justify="space-between" align="top" gutter={[16, 12]}>
        <Col xs={24} lg={14}>
          <Typography.Text type="secondary">{departure.departureNo}</Typography.Text>
          <Typography.Title level={4} style={{ marginTop: 4, marginBottom: 8 }}>
            {departure.name}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            {metaLine}
          </Typography.Paragraph>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            最近更新 {formatBusinessDateTime(departure.updatedAt)}
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
              创建于 {formatBusinessDateTime(departure.createdAt)}
            </Typography.Text>
          </Typography.Text>
        </Col>

        <Col xs={24} lg={10}>
          <Space orientation="vertical" size={12} style={{ width: '100%', alignItems: 'flex-end' }}>
            <Space wrap>
              <Tag color={DEPARTURE_PROGRESS_COLORS[departure.departureProgress] ?? 'default'}>
                行程 · {catalogLabel(DEPARTURE_PROGRESS_LABELS, departure.departureProgress)}
              </Tag>
              <Tag color={DEPARTURE_STATUS_COLORS[departure.status as DepartureStatus] ?? 'default'}>
                财务 · {catalogLabel(DEPARTURE_STATUS_LABELS, departure.status)}
              </Tag>
            </Space>

            <Space wrap>
              {primaryAction ? (
                <Button type="primary" onClick={primaryAction.onClick}>
                  {primaryAction.label}
                </Button>
              ) : null}
              <Dropdown menu={{ items: menuItems }}>
                <Button>
                  更多 <DownOutlined />
                </Button>
              </Dropdown>
            </Space>

            <Button type="link" style={{ paddingInline: 0 }} onClick={() => onHistoryOpenChange(true)}>
              {historyCount === 0
                ? '状态与履历'
                : latestHistory
                  ? `状态与履历（${historyCount}）· ${latestHistory.title}`
                  : `状态与履历（${historyCount}）`}
            </Button>
          </Space>
        </Col>
      </Row>

      <DepartureHistoryDrawer
        open={historyOpen}
        onClose={() => onHistoryOpenChange(false)}
        archiveHistory={departure.archiveHistory ?? []}
        settlementHistory={departure.settlementHistory ?? []}
      />
    </Card>
  )
}
