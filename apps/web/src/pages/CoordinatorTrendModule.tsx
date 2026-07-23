import { DualAxes } from '@ant-design/plots'
import { useNavigate } from '@tanstack/react-router'
import { Card, Empty, Flex, Tooltip, theme } from 'antd'
import type { WorkbenchCoordinatorTrendBucket, WorkbenchModule } from '@/types/api'
import styles from './HomePage.module.css'
import { useWorkbenchChartElementClick } from './use-workbench-chart-element-click'

function isCoordinatorTrendBucket(
  bucket: NonNullable<WorkbenchModule['buckets']>[number],
): bucket is WorkbenchCoordinatorTrendBucket {
  return 'date' in bucket
}

function formatShortDate(date: string): string {
  return date.slice(5)
}

function bucketAriaLabel(bucket: WorkbenchCoordinatorTrendBucket): string {
  return [
    `出团日 ${bucket.date}`,
    `发团数 ${bucket.departureCount}`,
    `客人人数 ${bucket.guestCount}`,
    `资料待补充 ${bucket.dataGapDepartureCount}`,
  ].join('，')
}

function bucketTooltipTitle(bucket: WorkbenchCoordinatorTrendBucket) {
  return (
    <div>
      <div>日期：{bucket.date}</div>
      <div>发团数：{bucket.departureCount}</div>
      <div>客人人数：{bucket.guestCount}</div>
      <div>资料待补充发团数：{bucket.dataGapDepartureCount}</div>
    </div>
  )
}

export function CoordinatorTrendModule({ module }: { module: WorkbenchModule }) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const buckets = (module.buckets ?? []).filter(isCoordinatorTrendBucket)
  const hasDepartures = buckets.some((bucket) => bucket.departureCount > 0)
  const bucketsByShortDate = new Map(
    buckets.map((bucket) => [formatShortDate(bucket.date), bucket]),
  )
  const chartRows = buckets.map((bucket) => ({
    date: formatShortDate(bucket.date),
    departureCount: bucket.departureCount,
    guestCount: bucket.guestCount,
    dataGapDepartureCount: bucket.dataGapDepartureCount,
  }))

  const navigateBucket = (shortDate: string | undefined) => {
    if (!shortDate) {
      return
    }
    const bucket = bucketsByShortDate.get(shortDate)
    if (bucket) {
      void navigate({ to: bucket.href })
    }
  }

  const { onReady, subscription } = useWorkbenchChartElementClick(
    (event) => (event as { data?: { data?: { date?: string } } })?.data?.data?.date,
    navigateBucket,
  )

  return (
    <Card
      className={styles.trendCard}
      title={module.title}
      aria-label={module.title}
    >
      {subscription}
      {!hasDepartures ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="未来 14 天暂无发团，因此不绘制团量与客流趋势"
        />
      ) : (
        <div className={styles.trendBody}>
          <DualAxes
            height={280}
            autoFit
            xField="date"
            legend={{ color: { position: 'top' } }}
            tooltip={{
              title: (datum: { date?: string }) => datum.date,
              items: [
                (datum: {
                  departureCount?: number
                  guestCount?: number
                  dataGapDepartureCount?: number
                }) => ({
                  name: '发团数',
                  value: datum.departureCount ?? 0,
                }),
                (datum: {
                  departureCount?: number
                  guestCount?: number
                  dataGapDepartureCount?: number
                }) => ({
                  name: '客人人数',
                  value: datum.guestCount ?? 0,
                }),
                (datum: {
                  departureCount?: number
                  guestCount?: number
                  dataGapDepartureCount?: number
                }) => ({
                  name: '资料待补充发团数',
                  value: datum.dataGapDepartureCount ?? 0,
                }),
              ],
            }}
            onReady={onReady}
          >
            {[
              {
                data: chartRows,
                type: 'interval',
                yField: 'departureCount',
                colorField: () => '发团数',
                style: { maxWidth: 28, fill: token.colorPrimary, cursor: 'pointer' },
                axis: { y: { title: '发团数', position: 'left' } },
                tooltip: false,
                animate: false,
                label: {
                  text: (datum: { dataGapDepartureCount: number }) =>
                    datum.dataGapDepartureCount > 0 ? String(datum.dataGapDepartureCount) : '',
                  style: {
                    fill: token.colorError,
                    fontWeight: 600,
                    dy: -4,
                  },
                  position: 'top',
                },
              },
              {
                data: chartRows,
                type: 'line',
                yField: 'guestCount',
                colorField: () => '客人人数',
                shapeField: 'smooth',
                style: { lineWidth: 2, stroke: token.colorSuccess, cursor: 'pointer' },
                axis: { y: { title: '客人人数', position: 'right' } },
                tooltip: false,
                animate: false,
              },
            ]}
          </DualAxes>

          <Flex className={styles.trendDayStrip} wrap gap={4}>
            {buckets.map((bucket) => (
              <Tooltip
                key={bucket.date}
                title={bucketTooltipTitle(bucket)}
                mouseEnterDelay={0}
                mouseLeaveDelay={0.1}
              >
                <button
                  type="button"
                  className={styles.trendDayButton}
                  aria-label={bucketAriaLabel(bucket)}
                  onClick={() => void navigate({ to: bucket.href })}
                >
                  <span className={styles.trendDayDate}>{formatShortDate(bucket.date)}</span>
                  <span className={styles.trendDayMeta}>
                    团 {bucket.departureCount} · 人 {bucket.guestCount}
                  </span>
                  <span
                    className={styles.trendDayGap}
                    data-has-gap={bucket.dataGapDepartureCount > 0 ? 'true' : 'false'}
                  >
                    待补 {bucket.dataGapDepartureCount}
                  </span>
                </button>
              </Tooltip>
            ))}
          </Flex>
        </div>
      )}
    </Card>
  )
}
