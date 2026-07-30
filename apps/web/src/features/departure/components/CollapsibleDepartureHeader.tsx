import { useState } from 'react'
import { Button, Card, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
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
import { DepartureHeaderCard } from './DepartureHeaderCard'
import styles from './CollapsibleDepartureHeader.module.css'

type CollapsibleDepartureHeaderProps = {
  departure: DepartureDetail
  menuItems: NonNullable<MenuProps['items']>
  primaryAction?: { label: string; onClick: () => void } | null
  historyOpen: boolean
  onHistoryOpenChange: (open: boolean) => void
}

function displayOrDash(value: string | null | undefined): string {
  return value?.trim() || '-'
}

export function CollapsibleDepartureHeader({
  departure,
  menuItems,
  primaryAction = null,
  historyOpen,
  onHistoryOpenChange,
}: CollapsibleDepartureHeaderProps) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const router = useRouter()
  const locationState = useRouterState({ select: (state) => state.location.state })
  const search = useSearch({ strict: false }) as { listReturn?: string }
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

  if (expanded) {
    return (
      <div className={styles.headerCollapse}>
        <div className={styles.headerCollapseToolbar}>
          <Button
            type="link"
            size="small"
            icon={<UpOutlined aria-hidden />}
            onClick={() => setExpanded(false)}
          >
            收起发团信息
          </Button>
        </div>
        <DepartureHeaderCard
          departure={departure}
          menuItems={menuItems}
          primaryAction={primaryAction}
          historyOpen={historyOpen}
          onHistoryOpenChange={onHistoryOpenChange}
        />
      </div>
    )
  }

  return (
    <Card
      size="small"
      className={styles.headerCollapsedCard}
      classNames={{ body: styles.headerCollapsedBody }}
    >
      <Button
        type="text"
        aria-label={backLabel}
        icon={<ArrowLeftOutlined aria-hidden />}
        className={styles.headerCollapsedBack}
        onClick={handleBack}
      />
      <div className={styles.headerCollapsedIdentity}>
        <Typography.Text
          strong
          ellipsis={{ tooltip: departure.name }}
          className={styles.headerCollapsedTitle}
        >
          {departure.name}
        </Typography.Text>
        <Tag
          color={DEPARTURE_PROGRESS_COLORS[departure.departureProgress] ?? 'default'}
          className={styles.headerCollapsedTag}
        >
          {catalogLabel(DEPARTURE_PROGRESS_LABELS, departure.departureProgress)}
        </Tag>
        <Tag
          color={DEPARTURE_STATUS_COLORS[departure.status as DepartureStatus] ?? 'default'}
          className={styles.headerCollapsedTag}
        >
          {catalogLabel(DEPARTURE_STATUS_LABELS, departure.status)}
        </Tag>
        <span className={styles.headerCollapsedSep} aria-hidden>
          ·
        </span>
        <span className={styles.headerCollapsedValue}>{departure.departureNo}</span>
        <span className={styles.headerCollapsedSep} aria-hidden>
          ·
        </span>
        <span className={styles.headerCollapsedValue}>
          {departure.startDate} ~ {departure.endDate}
        </span>
        <span className={styles.headerCollapsedSep} aria-hidden>
          ·
        </span>
        <span className={styles.headerCollapsedValue}>{departure.totalGuests} 人</span>
        <span className={styles.headerCollapsedSep} aria-hidden>
          ·
        </span>
        <span className={styles.headerCollapsedCrew} aria-label="执行班组">
          <span className={styles.headerCollapsedPair}>
            <span className={styles.headerCollapsedLabel}>司机</span>
            <span className={styles.headerCollapsedCrewValue}>
              {displayOrDash(departure.driverSupplierName)}
            </span>
          </span>
          <span className={styles.headerCollapsedPair}>
            <span className={styles.headerCollapsedLabel}>导游</span>
            <span className={styles.headerCollapsedCrewValue}>
              {displayOrDash(departure.guideSupplierName)}
            </span>
          </span>
          <span className={styles.headerCollapsedPair}>
            <span className={styles.headerCollapsedLabel}>车牌</span>
            <span className={styles.headerCollapsedCrewValue}>
              {displayOrDash(departure.vehiclePlate)}
            </span>
          </span>
          <span className={styles.headerCollapsedPair}>
            <span className={styles.headerCollapsedLabel}>电话</span>
            <span className={styles.headerCollapsedCrewValue}>-</span>
          </span>
        </span>
      </div>
      <Button
        type="link"
        size="small"
        icon={<DownOutlined aria-hidden />}
        onClick={() => setExpanded(true)}
      >
        展开
      </Button>
    </Card>
  )
}
