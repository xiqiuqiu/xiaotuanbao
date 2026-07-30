import { useMemo } from 'react'
import { Button, Card, Dropdown, Space, Tag, Typography } from 'antd'
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
import styles from './DepartureHeaderCard.module.css'

type DepartureHeaderCardProps = {
  departure: DepartureDetail
  menuItems: NonNullable<MenuProps['items']>
  primaryAction?: { label: string; onClick: () => void } | null
  historyOpen: boolean
  onHistoryOpenChange: (open: boolean) => void
  /** Optional on-site contact phone (prototype / future crew field). */
  crewContactPhone?: string | null
}

function HeaderMetaItem({
  label,
  value,
}: {
  label?: string
  value: string
}) {
  return (
    <Typography.Text type="secondary" className={styles.metaItem}>
      {label ? <span className={styles.metaItemLabel}>{label}</span> : null}
      <span className={styles.metaItemValue}>{value}</span>
    </Typography.Text>
  )
}

export function DepartureHeaderCard({
  departure,
  menuItems,
  primaryAction = null,
  historyOpen,
  onHistoryOpenChange,
  crewContactPhone,
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

  const mergedMenuItems: NonNullable<MenuProps['items']> = [
    {
      key: 'history',
      label: `状态与履历（${historyCount}）`,
      onClick: () => onHistoryOpenChange(true),
    },
    ...(menuItems.length > 0
      ? ([{ type: 'divider' }, ...menuItems] as NonNullable<MenuProps['items']>)
      : []),
  ]

  return (
    <Card
      size="small"
      className={styles.headerCard}
      classNames={{ body: styles.headerBody }}
    >
      <Button
        type="text"
        aria-label={backLabel}
        icon={<ArrowLeftOutlined aria-hidden />}
        className={styles.backButton}
        onClick={handleBack}
      />

      <div className={styles.identity}>
        <div className={styles.titleRow}>
          <Typography.Title level={4} ellipsis={{ tooltip: departure.name }}>
            {departure.name}
          </Typography.Title>
          <Space size={4} wrap>
            <Tag color={DEPARTURE_PROGRESS_COLORS[departure.departureProgress] ?? 'default'}>
              行程 · {catalogLabel(DEPARTURE_PROGRESS_LABELS, departure.departureProgress)}
            </Tag>
            <Tag color={DEPARTURE_STATUS_COLORS[departure.status as DepartureStatus] ?? 'default'}>
              财务 · {catalogLabel(DEPARTURE_STATUS_LABELS, departure.status)}
            </Tag>
          </Space>
        </div>

        <Space
          className={styles.metaLine}
          size={[8, 2]}
          wrap
          separator={<span className={styles.metaSep} aria-hidden>·</span>}
        >
          <HeaderMetaItem value={departure.departureNo} />
          <HeaderMetaItem value={departure.routeName} />
          <HeaderMetaItem value={`${departure.startDate} ~ ${departure.endDate}`} />
          <HeaderMetaItem label="负责人" value={ownerLabel} />
          <HeaderMetaItem value={`${departure.totalGuests} 人`} />
        </Space>

        <Space
          className={styles.crewLine}
          size={[12, 4]}
          wrap
          aria-label="执行班组"
        >
          <HeaderMetaItem
            label="司机名称"
            value={departure.driverSupplierName?.trim() || '-'}
          />
          <HeaderMetaItem
            label="导游名称"
            value={departure.guideSupplierName?.trim() || '-'}
          />
          <HeaderMetaItem
            label="司机车牌"
            value={departure.vehiclePlate?.trim() || '-'}
          />
          <HeaderMetaItem
            label="联系电话"
            value={crewContactPhone?.trim() || '-'}
          />
        </Space>

        <Typography.Text type="secondary" className={styles.timestamps}>
          最近更新 {formatBusinessDateTime(departure.updatedAt)}
          <Typography.Text type="secondary" className={styles.createdAt}>
            创建于 {formatBusinessDateTime(departure.createdAt)}
          </Typography.Text>
        </Typography.Text>
      </div>

      <Space wrap className={styles.actions}>
        {primaryAction ? (
          <Button type="primary" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        ) : null}
        <Dropdown menu={{ items: mergedMenuItems }} trigger={['click']}>
          <Button aria-label="状态与操作">
            状态与操作 <DownOutlined />
          </Button>
        </Dropdown>
      </Space>

      <DepartureHistoryDrawer
        open={historyOpen}
        onClose={() => onHistoryOpenChange(false)}
        archiveHistory={departure.archiveHistory ?? []}
        settlementHistory={departure.settlementHistory ?? []}
      />
    </Card>
  )
}
