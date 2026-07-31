import { useMemo } from 'react'
import { Button, Dropdown, Space, Tag, Typography } from 'antd'
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
import { DepartureHistoryDrawer } from './DepartureHistoryDrawer'
import styles from './DepartureHeaderCard.module.css'

type DepartureHeaderCardProps = {
  departure: DepartureDetail
  menuItems: NonNullable<MenuProps['items']>
  primaryAction?: { label: string; onClick: () => void } | null
  historyOpen: boolean
  onHistoryOpenChange: (open: boolean) => void
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.metaChip}>
      <span className={styles.metaChipLabel}>{label}</span>
      <span className={styles.metaChipValue}>{value}</span>
    </span>
  )
}

function displayOrDash(value: string | null | undefined): string {
  return value?.trim() || '-'
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
    <div className={styles.shell}>
      <div className={styles.top}>
        <Button
          type="text"
          aria-label={backLabel}
          icon={<ArrowLeftOutlined aria-hidden />}
          className={styles.backButton}
          onClick={handleBack}
        />

        <div className={styles.identity}>
          <div className={styles.titleRow}>
            <Typography.Title
              level={5}
              ellipsis={{ tooltip: departure.name }}
              className={styles.title}
            >
              {departure.name}
            </Typography.Title>
            <span className={styles.statusTags}>
              <Tag color={DEPARTURE_PROGRESS_COLORS[departure.departureProgress] ?? 'default'}>
                行程 · {catalogLabel(DEPARTURE_PROGRESS_LABELS, departure.departureProgress)}
              </Tag>
              <Tag
                color={DEPARTURE_STATUS_COLORS[departure.status as DepartureStatus] ?? 'default'}
              >
                发团 · {catalogLabel(DEPARTURE_STATUS_LABELS, departure.status)}
              </Tag>
            </span>
          </div>
        </div>

        <div className={styles.actions} aria-label="发团操作">
          <Space size={4}>
            {primaryAction ? (
              <Button type="primary" size="small" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </Button>
            ) : null}
            <Dropdown menu={{ items: mergedMenuItems }} trigger={['click']}>
              <Button type="text" size="small" aria-label="更多操作">
                更多操作 <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
        </div>
      </div>

      <div className={styles.metaRow} aria-label="发团摘要">
        <span>{departure.departureNo}</span>
        <span>
          {departure.startDate} ~ {departure.endDate}
        </span>
        <MetaChip label="人数" value={`${departure.totalGuests} 人`} />
        <MetaChip label="负责人" value={displayOrDash(departure.ownerName)} />
        <span className={styles.crewGroup} aria-label="执行班组">
          <MetaChip label="司机" value={displayOrDash(departure.driverSupplierName)} />
          <MetaChip label="导游" value={displayOrDash(departure.guideSupplierName)} />
          <MetaChip label="车牌" value={displayOrDash(departure.vehiclePlate)} />
          <MetaChip label="电话" value={displayOrDash(departure.contactPhone)} />
        </span>
      </div>

      <DepartureHistoryDrawer
        open={historyOpen}
        onClose={() => onHistoryOpenChange(false)}
        archiveHistory={departure.archiveHistory ?? []}
        settlementHistory={departure.settlementHistory ?? []}
      />
    </div>
  )
}
