import { RightOutlined } from '@ant-design/icons'
import { DualAxes } from '@ant-design/plots'
import { useNavigate } from '@tanstack/react-router'
import { Card, Empty, Flex, Statistic, Tag, Tooltip, Typography, theme } from 'antd'
import type { WorkbenchModule, WorkbenchOrganizationScaleBucket } from '@/types/api'
import styles from './HomePage.module.css'

function isOrganizationScaleBucket(
  bucket: NonNullable<WorkbenchModule['buckets']>[number],
): bucket is WorkbenchOrganizationScaleBucket {
  return 'month' in bucket
}

function formatMonthLabel(month: string): string {
  const [, monthPart] = month.split('-')
  return `${Number(monthPart)} 月`
}

function bucketAriaLabel(bucket: WorkbenchOrganizationScaleBucket): string {
  return [
    `月份 ${bucket.month}`,
    `发团数 ${bucket.departureCount}`,
    `客源人次 ${bucket.guestCount}`,
    bucket.inProgress ? '本月进行中' : '',
    '按当前数据统计',
  ].filter(Boolean).join('，')
}

function bucketTooltipTitle(bucket: WorkbenchOrganizationScaleBucket) {
  return (
    <div>
      <div>月份：{bucket.month}</div>
      <div>发团数：{bucket.departureCount}</div>
      <div>客源人次：{bucket.guestCount}</div>
      {bucket.inProgress ? <div>本月进行中</div> : null}
      <div>按当前数据统计</div>
    </div>
  )
}

export function OrganizationScaleModule({ module }: { module: WorkbenchModule }) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const buckets = (module.buckets ?? []).filter(isOrganizationScaleBucket)
  const hasDepartures = buckets.some((bucket) => bucket.departureCount > 0)
  const bucketsByMonthLabel = new Map(
    buckets.map((bucket) => [formatMonthLabel(bucket.month), bucket]),
  )
  const chartRows = buckets.map((bucket) => ({
    month: formatMonthLabel(bucket.month),
    departureCount: bucket.departureCount,
    guestCount: bucket.guestCount,
  }))

  const navigateBucket = (monthLabel: string | undefined) => {
    if (!monthLabel) {
      return
    }
    const bucket = bucketsByMonthLabel.get(monthLabel)
    if (bucket) {
      void navigate({ to: bucket.href })
    }
  }

  return (
    <div className={styles.scaleContent}>
      <div className={styles.scaleMetricGrid}>
        {module.metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={styles.metricButton}
            aria-label={metric.label}
            disabled={!metric.href}
            onClick={() => metric.href && void navigate({ to: metric.href })}
          >
            <Statistic
              title={metric.label}
              value={metric.value ?? '—'}
              suffix={metric.suffix}
            />
            {metric.href ? <RightOutlined className={styles.metricArrow} /> : null}
          </button>
        ))}
      </div>

      <Card
        className={styles.trendCard}
        title={module.title}
        aria-label={module.title}
      >
        <Typography.Paragraph type="secondary" className={styles.moduleDescription}>
          {module.description}
        </Typography.Paragraph>

        <div className={styles.trendBody}>
          <Typography.Text type="secondary" className={styles.trendLegendNote}>
            近 6 个自然月发团数与客源人次；本月标注「本月进行中」，数值按当前数据统计。
          </Typography.Text>
          {!hasDepartures ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="近 6 个月暂无发团，因此不绘制业务规模趋势"
            />
          ) : (
            <DualAxes
              height={280}
              autoFit
              xField="month"
              legend={{ color: { position: 'top' } }}
              tooltip={{
                items: [
                  (datum: { departureCount?: number }) => ({
                    name: '发团数',
                    value: datum.departureCount ?? 0,
                  }),
                  (datum: { guestCount?: number }) => ({
                    name: '客源人次',
                    value: datum.guestCount ?? 0,
                  }),
                  () => ({
                    name: '说明',
                    value: '按当前数据统计',
                  }),
                ],
              }}
              onReady={({ chart }) => {
                chart.on('element:click', (event: { data?: { data?: { month?: string } } }) => {
                  navigateBucket(event.data?.data?.month)
                })
              }}
              children={[
                {
                  data: chartRows,
                  type: 'interval',
                  yField: 'departureCount',
                  colorField: () => '发团数',
                  style: { maxWidth: 36, fill: token.colorPrimary, cursor: 'pointer' },
                  axis: { y: { title: '发团数', position: 'left' } },
                },
                {
                  data: chartRows,
                  type: 'line',
                  yField: 'guestCount',
                  colorField: () => '客源人次',
                  shapeField: 'smooth',
                  style: { lineWidth: 2, stroke: token.colorSuccess, cursor: 'pointer' },
                  axis: { y: { title: '客源人次', position: 'right' } },
                },
              ]}
            />
          )}

          <Flex className={styles.trendDayStrip} wrap gap={4}>
            {buckets.map((bucket) => (
              <Tooltip key={bucket.month} title={bucketTooltipTitle(bucket)}>
                <button
                  type="button"
                  className={styles.trendDayButton}
                  aria-label={bucketAriaLabel(bucket)}
                  onClick={() => void navigate({ to: bucket.href })}
                >
                  <span className={styles.trendDayDate}>
                    {formatMonthLabel(bucket.month)}
                    {bucket.inProgress ? (
                      <Tag color="processing" className={styles.scaleInProgressTag}>
                        本月进行中
                      </Tag>
                    ) : null}
                  </span>
                  <span className={styles.trendDayMeta}>
                    团 {bucket.departureCount} · 人次 {bucket.guestCount}
                  </span>
                  <span className={styles.trendDayGap} data-has-gap="false">
                    按当前数据统计
                  </span>
                </button>
              </Tooltip>
            ))}
          </Flex>
        </div>
      </Card>
    </div>
  )
}
