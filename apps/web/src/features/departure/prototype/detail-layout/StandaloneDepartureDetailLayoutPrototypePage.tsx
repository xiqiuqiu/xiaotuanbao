/**
 * PROTOTYPE — standalone page (no auth). Header mirrors production DepartureHeaderCard.
 */
import { Button, Card, Dropdown, Space, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, DownOutlined } from '@ant-design/icons'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { DepartureStatus, DepartureType, type DepartureDetail } from '@xiaotuanbao/shared'
import {
  DEPARTURE_PROGRESS_COLORS,
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
  catalogLabel,
} from '../../catalog'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
import { DepartureDetailLayoutPrototypeHost } from './DepartureDetailLayoutPrototypeHost'
import headerStyles from '../../components/DepartureHeaderCard.module.css'

const MOCK_DEPARTURE = {
  id: 'proto-dep-1',
  departureNo: 'XTB2026070011',
  name: '2026年8月1号 天吐喀伊',
  routeName: 'A线：天吐喀伊',
  departureType: DepartureType.INDEPENDENT,
  startDate: '2026-07-28',
  endDate: '2026-08-06',
  totalGuests: 2,
  ownerName: '演示管理员',
  departureProgress: 'in_progress',
  status: DepartureStatus.EDITING,
  createdAt: '2026-07-28T04:48:00.000Z',
  updatedAt: '2026-07-29T04:50:00.000Z',
} as unknown as DepartureDetail

export function StandaloneDepartureDetailLayoutPrototypePage() {
  const navigate = useNavigate()
  const router = useRouter()

  if (import.meta.env.PROD) {
    return (
      <div style={{ padding: 48 }}>
        <Typography.Title level={4}>原型仅开发环境可用</Typography.Title>
      </div>
    )
  }

  const handleBack = () => {
    if (router.history.canGoBack()) {
      router.history.back()
      return
    }
    void navigate({ to: '/departure' })
  }

  const stubAction = (label: string) => () => {
    message.info(`原型占位：${label}`)
  }

  const menuItems = [
    {
      key: 'history',
      label: '状态与履历（0）',
      onClick: stubAction('状态与履历'),
    },
    { type: 'divider' as const },
    {
      key: 'operations-sheet',
      label: '发团运营表',
      onClick: stubAction('发团运营表'),
    },
    {
      key: 'save-route',
      label: '保存为常用路线',
      onClick: stubAction('保存为常用路线'),
    },
    {
      key: 'pending-settlement',
      label: '切换为待结算',
      onClick: stubAction('切换为待结算'),
    },
    {
      key: 'close',
      label: '关闭发团',
      danger: true,
      onClick: stubAction('关闭发团'),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', padding: 24 }}>
      <Card
        size="small"
        className={headerStyles.headerCard}
        classNames={{ body: headerStyles.headerBody }}
      >
        <Button
          type="text"
          aria-label="返回发团管理"
          icon={<ArrowLeftOutlined aria-hidden />}
          className={headerStyles.backButton}
          onClick={handleBack}
        />

        <div className={headerStyles.identity}>
          <div className={headerStyles.titleRow}>
            <Typography.Title level={4} ellipsis={{ tooltip: MOCK_DEPARTURE.name }}>
              {MOCK_DEPARTURE.name}
            </Typography.Title>
            <Space size={4} wrap>
              <Tag
                color={
                  DEPARTURE_PROGRESS_COLORS[MOCK_DEPARTURE.departureProgress] ?? 'default'
                }
              >
                行程 ·{' '}
                {catalogLabel(
                  DEPARTURE_PROGRESS_LABELS,
                  MOCK_DEPARTURE.departureProgress,
                )}
              </Tag>
              <Tag
                color={
                  DEPARTURE_STATUS_COLORS[MOCK_DEPARTURE.status as DepartureStatus] ??
                  'default'
                }
              >
                财务 · {catalogLabel(DEPARTURE_STATUS_LABELS, MOCK_DEPARTURE.status)}
              </Tag>
            </Space>
          </div>

          <Space
            className={headerStyles.metaLine}
            size={[8, 2]}
            wrap
            separator={<Typography.Text type="secondary">·</Typography.Text>}
          >
            <Typography.Text type="secondary">{MOCK_DEPARTURE.departureNo}</Typography.Text>
            <Typography.Text type="secondary">{MOCK_DEPARTURE.routeName}</Typography.Text>
            <Typography.Text type="secondary">
              {MOCK_DEPARTURE.startDate} ~ {MOCK_DEPARTURE.endDate}
            </Typography.Text>
            <Typography.Text type="secondary">
              负责人 {MOCK_DEPARTURE.ownerName ?? '-'}
            </Typography.Text>
            <Typography.Text type="secondary">{MOCK_DEPARTURE.totalGuests} 人</Typography.Text>
          </Space>

          <Typography.Text type="secondary" className={headerStyles.timestamps}>
            最近更新 {formatBusinessDateTime(MOCK_DEPARTURE.updatedAt)}
            <Typography.Text type="secondary" className={headerStyles.createdAt}>
              创建于 {formatBusinessDateTime(MOCK_DEPARTURE.createdAt)}
            </Typography.Text>
          </Typography.Text>
        </div>

        <Space wrap className={headerStyles.actions}>
          <Button type="primary" onClick={stubAction('编辑发团')}>
            编辑发团
          </Button>
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button aria-label="状态与操作">
              状态与操作 <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      </Card>

      <DepartureDetailLayoutPrototypeHost
        departure={MOCK_DEPARTURE}
        standalonePath="/prototype/departure-detail-layout"
      />
    </div>
  )
}
