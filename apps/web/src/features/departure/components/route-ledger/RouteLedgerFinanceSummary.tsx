import { Flex, Typography } from 'antd'
import type { RouteLedgerDepartureGroup } from '@/types/api'
import { formatCents } from '../../catalog'
import styles from './RouteLedgerReport.module.css'

function summarizeDeparture(departure: RouteLedgerDepartureGroup) {
  const netReceivableCents = departure.totals.netReceivableCents
  const costCents = departure.costResources.reduce((sum, row) => sum + row.amountCents, 0)
  const outsourceCents = departure.outsource.totalAmountCents
  return {
    netReceivableCents,
    costCents,
    outsourceCents,
    marginCents: netReceivableCents - costCents - outsourceCents,
  }
}

export function RouteLedgerFinanceSummary({
  departure,
}: {
  departure: RouteLedgerDepartureGroup
}) {
  const summary = summarizeDeparture(departure)

  return (
    <Flex className={styles.summaryStrip} align="baseline" gap={16} wrap="wrap">
      <span className={styles.summaryMetric}>
        <Typography.Text type="secondary" className={styles.summaryMetricLabel}>
          结算{' '}
        </Typography.Text>
        <Typography.Text strong className={styles.summaryMetricValue}>
          {formatCents(summary.netReceivableCents)}
        </Typography.Text>
      </span>
      <span className={styles.summaryMetric}>
        <Typography.Text type="secondary" className={styles.summaryMetricLabel}>
          成本{' '}
        </Typography.Text>
        <Typography.Text strong className={styles.summaryMetricValue}>
          {formatCents(summary.costCents)}
        </Typography.Text>
      </span>
      <span className={styles.summaryMetric}>
        <Typography.Text type="secondary" className={styles.summaryMetricLabel}>
          拼出{' '}
        </Typography.Text>
        <Typography.Text strong className={styles.summaryMetricValue}>
          {formatCents(summary.outsourceCents)}
        </Typography.Text>
      </span>
      <span className={styles.summaryMetric}>
        <Typography.Text type="secondary" className={styles.summaryMetricLabel}>
          毛利{' '}
        </Typography.Text>
        <Typography.Text
          strong
          type={summary.marginCents >= 0 ? 'success' : 'danger'}
          className={styles.summaryMetricValue}
        >
          {formatCents(summary.marginCents)}
        </Typography.Text>
      </span>
    </Flex>
  )
}
