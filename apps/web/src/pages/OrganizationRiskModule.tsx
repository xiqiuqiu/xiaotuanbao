import { RightOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { Card, Empty, Flex, Statistic, Tag, Typography, theme } from 'antd'
import type {
  WorkbenchMetric,
  WorkbenchModule,
  WorkbenchOrganizationRiskItem,
  WorkbenchOrganizationRiskSeverity,
} from '@/types/api'
import { formatCents } from '@/features/finance/catalog'
import styles from './HomePage.module.css'

function isRiskItem(
  item: WorkbenchModule['items'][number],
): item is WorkbenchOrganizationRiskItem {
  return 'kind' in item && item.kind === 'organization-risk'
}

function severityLabel(severity: WorkbenchOrganizationRiskSeverity): string {
  return severity === 'high' ? '高风险' : '需关注'
}

function severityColor(severity: WorkbenchOrganizationRiskSeverity): string {
  return severity === 'high' ? 'error' : 'warning'
}

function formatAmount(amountCents: number | null | undefined): string | null {
  if (amountCents == null) {
    return null
  }
  return formatCents(amountCents)
}

function RiskSummaryStrip({ metrics }: { metrics: WorkbenchMetric[] }) {
  return (
    <Flex className={styles.riskSummaryStrip} gap={16} wrap>
      {metrics.map((metric) => (
        <div key={metric.key} aria-label={metric.label}>
          <Statistic
            title={metric.label}
            value={metric.value ?? '—'}
            suffix={metric.suffix}
            styles={{
              content: {
                color: metric.key === 'high-risk'
                  ? 'var(--ant-color-error)'
                  : 'var(--ant-color-warning)',
              },
            }}
          />
        </div>
      ))}
    </Flex>
  )
}

export function OrganizationRiskModule({ module }: { module: WorkbenchModule }) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const items = module.items.filter(isRiskItem)
  const summaryMetrics = module.metrics.filter(
    (metric) => metric.key === 'high-risk' || metric.key === 'attention',
  )
  const categoryMetrics = module.metrics.filter((metric) => metric.key.startsWith('risk-'))
  const showCalmEmpty = items.length === 0 && (module.total ?? 0) === 0

  return (
    <Card
      className={styles.riskCard}
      title={module.title}
      aria-label={module.title}
      extra={
        <Typography.Text type="secondary">共 {module.total ?? 0} 项</Typography.Text>
      }
    >
      {summaryMetrics.length > 0 ? <RiskSummaryStrip metrics={summaryMetrics} /> : null}

      {categoryMetrics.length > 0 ? (
        <Flex vertical gap={0} className={styles.queueList}>
          {categoryMetrics.map((metric) => {
            const meta = `${metric.value ?? 0}${metric.suffix ? ` ${metric.suffix}` : ''}`
            return (
              <button
                type="button"
                key={metric.key}
                className={styles.queueItem}
                aria-label={metric.label}
                disabled={!metric.href}
                onClick={() => metric.href && void navigate({ to: metric.href })}
              >
                <Flex vertical gap={token.marginXXS} className={styles.queueBody}>
                  <Flex align="center" gap={token.marginXS} className={styles.queueTitleRow}>
                    <Typography.Text
                      strong
                      ellipsis={{ tooltip: metric.label }}
                      className={styles.queueTitle}
                    >
                      {metric.label}
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
                {metric.href ? (
                  <RightOutlined aria-hidden className={styles.queueChevron} />
                ) : null}
              </button>
            )
          })}
        </Flex>
      ) : null}

      {showCalmEmpty ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前没有需要关注的经营风险"
        />
      ) : (
        <Flex vertical gap={0} className={styles.queueList}>
          {items.map((item) => {
            const amountLabel = formatAmount(item.amountCents)
            const meta = [
              item.reason,
              item.overdueDays != null ? `逾期 ${item.overdueDays} 天` : null,
              item.daysUntilStart != null
                ? item.daysUntilStart === 0
                  ? '今天出发'
                  : item.daysUntilStart === 1
                    ? '明天出发'
                    : `${item.daysUntilStart} 天后出发`
                : null,
              item.unsettledDays != null ? `未核销 ${item.unsettledDays} 天` : null,
              amountLabel,
            ].filter(Boolean).join(' · ')
            return (
              <button
                type="button"
                key={item.id}
                className={styles.queueItem}
                aria-label={`${severityLabel(item.severity)} ${item.title}`}
                title={item.title}
                onClick={() => void navigate({ to: item.href })}
              >
                <Flex vertical gap={token.marginXXS} className={styles.queueBody}>
                  <Flex align="center" gap={token.marginXS} className={styles.queueTitleRow}>
                    <Tag color={severityColor(item.severity)} style={{ marginInlineEnd: 0 }}>
                      {severityLabel(item.severity)}
                    </Tag>
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
                <RightOutlined aria-hidden className={styles.queueChevron} />
              </button>
            )
          })}
        </Flex>
      )}
    </Card>
  )
}
