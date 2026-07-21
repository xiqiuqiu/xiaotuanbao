import { RightOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { Card, Empty, Flex, Space, Statistic, Tag, Typography } from 'antd'
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
      <Typography.Paragraph type="secondary" className={styles.moduleDescription}>
        {module.description}
      </Typography.Paragraph>

      {summaryMetrics.length > 0 ? <RiskSummaryStrip metrics={summaryMetrics} /> : null}

      {categoryMetrics.length > 0 ? (
        <Space orientation="vertical" size={0} className={styles.queueList}>
          {categoryMetrics.map((metric) => (
            <button
              type="button"
              key={metric.key}
              className={styles.queueItem}
              aria-label={metric.label}
              disabled={!metric.href}
              onClick={() => metric.href && void navigate({ to: metric.href })}
            >
              <span>
                <Typography.Text strong>{metric.label}</Typography.Text>
                <Typography.Text type="secondary" className={styles.queueMeta}>
                  {metric.value ?? 0}
                  {metric.suffix ? ` ${metric.suffix}` : ''}
                </Typography.Text>
              </span>
              {metric.href ? <RightOutlined /> : null}
            </button>
          ))}
        </Space>
      ) : null}

      {showCalmEmpty ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前没有需要关注的经营风险"
        />
      ) : (
        <Space orientation="vertical" size={0} className={styles.queueList}>
          {items.map((item) => {
            const amountLabel = formatAmount(item.amountCents)
            return (
              <button
                type="button"
                key={item.id}
                className={styles.queueItem}
                aria-label={`${severityLabel(item.severity)} ${item.title}`}
                onClick={() => void navigate({ to: item.href })}
              >
                <span>
                  <Typography.Text strong>
                    <Tag color={severityColor(item.severity)}>
                      {severityLabel(item.severity)}
                    </Tag>
                    {item.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" className={styles.queueMeta}>
                    {item.reason}
                    {item.overdueDays != null ? ` · 逾期 ${item.overdueDays} 天` : ''}
                    {item.daysUntilStart != null
                      ? item.daysUntilStart === 0
                        ? ' · 今天出发'
                        : item.daysUntilStart === 1
                          ? ' · 明天出发'
                          : ` · ${item.daysUntilStart} 天后出发`
                      : ''}
                    {item.unsettledDays != null ? ` · 未核销 ${item.unsettledDays} 天` : ''}
                    {amountLabel ? ` · ${amountLabel}` : ''}
                  </Typography.Text>
                </span>
                <RightOutlined />
              </button>
            )
          })}
        </Space>
      )}
    </Card>
  )
}
