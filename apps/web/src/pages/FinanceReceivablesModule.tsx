import { RightOutlined } from '@ant-design/icons'
import { DualAxes } from '@ant-design/plots'
import { useNavigate } from '@tanstack/react-router'
import { Button, Card, Empty, Flex, Space, Statistic, Tag, Tooltip, Typography, theme } from 'antd'
import type {
  WorkbenchFinanceReceivableAgingBucket,
  WorkbenchFinanceReceivableItem,
  WorkbenchModule,
} from '@/types/api'
import { formatCents } from '@/features/finance/catalog'
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

function bucketTooltipTitle(bucket: WorkbenchFinanceReceivableAgingBucket) {
  return (
    <div>
      <div>账龄：{bucket.label}</div>
      <div>节点数：{bucket.scheduleCount}</div>
      <div>未收金额：{formatCents(bucket.unsettledAmountCents)}</div>
    </div>
  )
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
  const hasAging = buckets.some((bucket) => bucket.scheduleCount > 0)
  const chartRows = buckets.map((bucket) => ({
    label: bucket.label,
    unsettledAmountYuan: bucket.unsettledAmountCents / 100,
    scheduleCount: bucket.scheduleCount,
  }))
  const bucketsByLabel = new Map(buckets.map((bucket) => [bucket.label, bucket]))

  const navigateBucket = (label: string | undefined) => {
    if (!label) {
      return
    }
    const bucket = bucketsByLabel.get(label)
    if (bucket) {
      void navigate({ to: bucket.href })
    }
  }

  const { onReady } = useWorkbenchChartElementClick(
    (event) => (event as { data?: { data?: { label?: string } } })?.data?.data?.label,
    navigateBucket,
  )

  const followUpCard = showFollowUp ? (
    <Card
      className={styles.recentDeparturesCard}
      title={module.title}
      extra={module.href ? (
        <Button type="link" onClick={() => void navigate({ to: module.href! })}>
          查看全部 {module.total ?? 0} 项 <RightOutlined />
        </Button>
      ) : null}
    >
      <Typography.Paragraph type="secondary" className={styles.moduleDescription}>
        {module.description}
      </Typography.Paragraph>
      {items.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前没有需要跟进的逾期或近期到期应收"
        />
      ) : (
        <Space orientation="vertical" size={0} className={styles.queueList}>
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={styles.queueItem}
              aria-label={item.title}
              onClick={() => void navigate({ to: item.href })}
            >
              <span>
                <Typography.Text strong>{item.title}</Typography.Text>
                <Typography.Text type="secondary" className={styles.queueMeta}>
                  {item.dueDate}
                  {' · '}
                  {formatCents(item.unsettledAmountCents)}
                  {item.overdueDays != null ? ` · 逾期 ${item.overdueDays} 天` : ' · 近期到期'}
                  {item.counterpartyName ? ` · ${item.counterpartyName}` : ''}
                </Typography.Text>
              </span>
              <span>
                {item.departureClosed ? <Tag color="default">发团已关闭</Tag> : null}
                <RightOutlined />
              </span>
            </button>
          ))}
        </Space>
      )}
    </Card>
  ) : null

  const agingCard = showAging ? (
    <Card
      className={styles.trendCard}
      title="逾期应收账龄"
      aria-label="逾期应收账龄"
    >
      <Typography.Paragraph type="secondary" className={styles.moduleDescription}>
        固定分为 1–7 天、8–30 天与 30 天以上，展示未结节点数与未收金额。
      </Typography.Paragraph>
      {!hasAging ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前没有逾期应收，因此不绘制账龄分布"
        />
      ) : (
        <div className={styles.trendBody}>
          <div data-testid="workbench-aging-chart">
            <DualAxes
              height={220}
              autoFit
              xField="label"
              legend={false}
              tooltip={false}
              onReady={onReady}
              children={[
                {
                  data: chartRows,
                  type: 'interval',
                  yField: 'unsettledAmountYuan',
                  style: { maxWidth: 36, fill: token.colorPrimary, cursor: 'pointer' },
                  axis: { y: { title: '未收金额（元）', position: 'left' } },
                },
                {
                  data: chartRows,
                  type: 'line',
                  yField: 'scheduleCount',
                  style: { lineWidth: 2, stroke: token.colorError, cursor: 'pointer' },
                  axis: { y: { title: '节点数', position: 'right' } },
                },
              ]}
            />
          </div>
          <Flex gap={8} wrap className={styles.trendDayStrip}>
            {buckets.map((bucket) => (
              <Tooltip key={bucket.key} title={bucketTooltipTitle(bucket)}>
                <button
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
              </Tooltip>
            ))}
          </Flex>
        </div>
      )}
    </Card>
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
