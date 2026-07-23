import { useState } from 'react'
import { RightOutlined } from '@ant-design/icons'
import { Column } from '@ant-design/plots'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Card,
  Empty,
  Flex,
  Segmented,
  Statistic,
  Tag,
  Typography,
  theme,
} from 'antd'
import type {
  WorkbenchFinanceReceivableAgingBucket,
  WorkbenchFinanceReceivableItem,
  WorkbenchModule,
} from '@/types/api'
import { formatCents } from '@/features/finance/catalog'
import {
  buildFinanceAgingChartSpec,
  FINANCE_AGING_VIEW_MODE_OPTIONS,
  type FinanceAgingChartSpec,
  type FinanceAgingViewMode,
} from './finance-aging-chart'
import styles from './HomePage.module.css'
import { useWorkbenchChartElementClick } from './use-workbench-chart-element-click'

function isAgingBucket(
  bucket: NonNullable<WorkbenchModule['buckets']>[number],
): bucket is WorkbenchFinanceReceivableAgingBucket {
  return 'key' in bucket && typeof bucket.key === 'string' && bucket.key.startsWith('aging_')
}

function isReceivableItem(
  item: WorkbenchModule['items'][number],
): item is WorkbenchFinanceReceivableItem {
  return 'kind' in item && item.kind === 'finance-receivable'
}

function formatMetricValue(value: number | null | undefined): string {
  if (value == null) {
    return '-'
  }
  return formatCents(value)
}

function bucketAriaLabel(bucket: WorkbenchFinanceReceivableAgingBucket): string {
  return [
    `账龄 ${bucket.label}`,
    `节点数 ${bucket.scheduleCount}`,
    `未收金额 ${formatCents(bucket.unsettledAmountCents)}`,
  ].join('，')
}

export type FinanceReceivablesSection = 'metrics' | 'follow-up' | 'aging'

function isMoneyMetric(metric: WorkbenchModule['metrics'][number]): boolean {
  return (
    metric.key === 'overdue-receivables'
    || metric.key === 'due-within-7-days'
    || metric.key === 'pending-payment'
    || metric.key === 'pending-settlement'
  )
}

export function FinanceMetricStrip({
  metrics,
  columns = 2,
}: {
  metrics: WorkbenchModule['metrics']
  columns?: 2 | 4
}) {
  const navigate = useNavigate()
  return (
    <div
      className={columns === 4 ? styles.financeMetricGridFour : styles.financeMetricGrid}
    >
      {metrics.map((metric) => (
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
            value={
              isMoneyMetric(metric)
                ? formatMetricValue(metric.value)
                : (metric.value ?? '—')
            }
            suffix={isMoneyMetric(metric) ? undefined : metric.suffix}
          />
          {metric.secondaryValue != null ? (
            <Typography.Text type="secondary" className={styles.metricSecondary}>
              {metric.secondaryValue}
              {metric.secondarySuffix ? ` ${metric.secondarySuffix}` : ''}
            </Typography.Text>
          ) : null}
          {metric.href ? <RightOutlined className={styles.metricArrow} /> : null}
        </button>
      ))}
    </div>
  )
}

function FinanceReceivablesAgingCard({
  buckets,
  agingChart,
  initialViewMode,
}: {
  buckets: WorkbenchFinanceReceivableAgingBucket[]
  agingChart: FinanceAgingChartSpec
  initialViewMode: FinanceAgingViewMode
}) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  // 由父级 key={suggestedMode} 在推荐模式变化时整卡 remount，避免 useEffect 手写重置。
  const [agingViewMode, setAgingViewMode] = useState(initialViewMode)
  const bucketsByLabel = new Map(buckets.map((bucket) => [bucket.label, bucket]))
  const hasAging = buckets.some((bucket) => bucket.scheduleCount > 0)

  const navigateBucket = (label: string | undefined) => {
    if (!label) {
      return
    }
    const bucket = bucketsByLabel.get(label)
    if (bucket) {
      void navigate({ to: bucket.href })
    }
  }

  const { onReady, subscription } = useWorkbenchChartElementClick(
    (event) => (event as { data?: { data?: { label?: string } } })?.data?.data?.label,
    navigateBucket,
  )

  return (
    <Card
      className={[styles.trendCard, !hasAging ? styles.cardBodyCenteredEmpty : '']
        .filter(Boolean)
        .join(' ')}
      title="逾期应收账龄"
      aria-label="逾期应收账龄"
      extra={hasAging ? (
        <Segmented<FinanceAgingViewMode>
          size="small"
          value={agingViewMode}
          options={FINANCE_AGING_VIEW_MODE_OPTIONS}
          onChange={setAgingViewMode}
          aria-label="账龄图表显示模式"
        />
      ) : null}
    >
      {subscription}
      {!hasAging ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前没有逾期应收，因此不绘制账龄分布"
        />
      ) : (
        <div className={styles.trendBody}>
          <div data-testid="workbench-aging-chart">
            {agingViewMode === 'share' ? (
              <div
                className={styles.agingShareList}
                data-testid="workbench-aging-share-list"
              >
                {agingChart.data.map((row) => {
                  const bucket = bucketsByLabel.get(row.label)
                  return (
                    <button
                      key={row.label}
                      type="button"
                      className={styles.agingShareRow}
                      aria-label={
                        bucket
                          ? bucketAriaLabel(bucket)
                          : `账龄 ${row.label}，${row.countLabel}，未收金额 ${row.amountLabel}`
                      }
                      disabled={!bucket}
                      onClick={() => navigateBucket(row.label)}
                    >
                      <span className={styles.agingShareHeader}>
                        <Typography.Text strong>{row.label}</Typography.Text>
                        <Typography.Text>{row.amountLabel}</Typography.Text>
                      </span>
                      <span className={styles.agingShareTrack} aria-hidden>
                        <span
                          className={styles.agingShareFill}
                          style={{
                            ['--aging-share' as string]: Math.min(
                              Math.max(row.sharePercent / 100, 0),
                              1,
                            ),
                          }}
                        />
                      </span>
                      <Typography.Text type="secondary" className={styles.agingShareMeta}>
                        {row.countLabel}
                        {' · '}
                        占逾期
                        {' '}
                        {row.shareLabel}
                      </Typography.Text>
                    </button>
                  )
                })}
              </div>
            ) : (
              <Column
                height={220}
                autoFit
                data={agingChart.data}
                xField={agingChart.xField}
                yField={agingChart.yField}
                legend={false}
                tooltip={false}
                scale={{ y: { type: agingChart.scaleYType, nice: true } }}
                axis={{ y: { title: '未收金额（元）' } }}
                style={{ maxWidth: 48, fill: token.colorPrimary, cursor: 'pointer' }}
                labels={[
                  {
                    text: 'amountLabel',
                    position: 'top',
                    style: {
                      fill: token.colorText,
                      fontSize: 11,
                      dy: -14,
                    },
                  },
                  {
                    text: 'countLabel',
                    position: 'top',
                    style: {
                      fill: token.colorTextSecondary,
                      fontSize: 11,
                      dy: -2,
                    },
                  },
                ]}
                animate={false}
                onReady={onReady}
              />
            )}
          </div>
          {agingViewMode === 'column' ? (
            <Flex gap={8} wrap className={styles.trendDayStrip}>
              {buckets.map((bucket) => (
                <button
                  key={bucket.key}
                  type="button"
                  className={styles.trendDayButton}
                  aria-label={bucketAriaLabel(bucket)}
                  onClick={() => void navigate({ to: bucket.href })}
                >
                  <Typography.Text strong>{bucket.label}</Typography.Text>
                  <Typography.Text type="secondary">
                    {bucket.scheduleCount} 个节点
                  </Typography.Text>
                  <Typography.Text>{formatCents(bucket.unsettledAmountCents)}</Typography.Text>
                </button>
              ))}
            </Flex>
          ) : null}
        </div>
      )}
    </Card>
  )
}

export function FinanceReceivablesModule({
  module,
  sections = ['metrics', 'follow-up', 'aging'],
}: {
  module: WorkbenchModule
  sections?: FinanceReceivablesSection[]
}) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const showMetrics = sections.includes('metrics')
  const showFollowUp = sections.includes('follow-up')
  const showAging = sections.includes('aging')
  const items = module.items.filter(isReceivableItem)
  const buckets = (module.buckets ?? []).filter(isAgingBucket)
  const agingChart = buildFinanceAgingChartSpec(buckets)

  const followUpCard = showFollowUp ? (
    <Card
      className={[
        styles.recentDeparturesCard,
        items.length === 0 ? styles.cardBodyCenteredEmpty : '',
      ].filter(Boolean).join(' ')}
      title={module.title}
      extra={module.href ? (
        <Button
          type="link"
          icon={<RightOutlined />}
          iconPlacement="end"
          styles={{ root: { paddingInline: 0 } }}
          onClick={() => void navigate({ to: module.href! })}
        >
          查看全部 {module.total ?? 0} 项
        </Button>
      ) : null}
    >
      {items.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前没有需要跟进的逾期或近期到期应收"
        />
      ) : (
        <Flex vertical gap={0} className={styles.queueList}>
          {items.map((item) => {
            const meta = [
              item.dueDate,
              formatCents(item.unsettledAmountCents),
              item.overdueDays != null ? `逾期 ${item.overdueDays} 天` : '近期到期',
              item.counterpartyName,
            ].filter(Boolean).join(' · ')
            return (
              <button
                type="button"
                key={item.id}
                className={styles.queueItem}
                aria-label={item.title}
                title={item.title}
                onClick={() => void navigate({ to: item.href })}
              >
                <Flex vertical gap={token.marginXXS} className={styles.queueBody}>
                  <Flex align="center" gap={token.marginXS} className={styles.queueTitleRow}>
                    <Typography.Text
                      strong
                      ellipsis={{ tooltip: item.title }}
                      className={styles.queueTitle}
                    >
                      {item.title}
                    </Typography.Text>
                  </Flex>
                  <Typography.Text
                    type="secondary"
                    ellipsis={{ tooltip: meta }}
                    className={styles.queueMeta}
                  >
                    {meta}
                  </Typography.Text>
                </Flex>
                <Flex align="center" gap={token.marginXXS} className={styles.queueTrailing}>
                  {item.departureClosed ? <Tag color="default">发团已关闭</Tag> : null}
                  <RightOutlined aria-hidden className={styles.queueChevron} />
                </Flex>
              </button>
            )
          })}
        </Flex>
      )}
    </Card>
  ) : null

  // suggestedMode 变化时 remount，状态随推荐默认重置；同推荐下用户手动切换得以保留。
  const agingCard = showAging ? (
    <FinanceReceivablesAgingCard
      key={agingChart.suggestedMode}
      buckets={buckets}
      agingChart={agingChart}
      initialViewMode={agingChart.suggestedMode}
    />
  ) : null

  return (
    <div className={styles.financeReceivablesContent}>
      {showMetrics ? <FinanceMetricStrip metrics={module.metrics} /> : null}

      {showFollowUp && showAging ? (
        <div className={styles.financeMainGrid}>
          {followUpCard}
          {agingCard}
        </div>
      ) : (
        <>
          {followUpCard}
          {agingCard}
        </>
      )}
    </div>
  )
}
