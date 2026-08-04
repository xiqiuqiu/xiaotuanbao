import { Flex, Typography } from 'antd'
import {
  formatCents,
  formatChineseDate,
  summarizeDeparture,
  type ProtoDepartureReport,
} from './shared'
import styles from './route-ledger-mode-prototype.module.css'

export function DateSeparator({ startDate }: { startDate: string }) {
  return (
    <div className={styles.dateSeparator}>
      <span className={styles.dateSeparatorMark} aria-hidden />
      <Typography.Text strong className={styles.dateSeparatorLabel}>
        {formatChineseDate(startDate)}
      </Typography.Text>
    </div>
  )
}

/** A/C 版头部右侧：结算｜成本｜拼出｜毛利（拼出明细改由 Segmented 分面进入，不再重复链出）。 */
export function FinanceSummaryStrip({ report }: { report: ProtoDepartureReport }) {
  const summary = summarizeDeparture(report)
  return (
    <Flex className={styles.summaryStrip} align="center" gap={6} wrap="wrap">
      <span className={styles.summaryMetric}>
        <span className={styles.summaryMetricLabel}>结算</span>
        <Typography.Text strong className={styles.summaryMetricValue}>
          {formatCents(summary.netReceivableCents)}
        </Typography.Text>
      </span>
      <span className={styles.summaryMetric}>
        <span className={styles.summaryMetricLabel}>成本</span>
        <Typography.Text strong className={styles.summaryMetricValue}>
          {formatCents(summary.costCents)}
        </Typography.Text>
      </span>
      <span className={styles.summaryMetric}>
        <span className={styles.summaryMetricLabel}>拼出</span>
        <Typography.Text strong className={styles.summaryMetricValue}>
          {formatCents(summary.outsourceCents)}
        </Typography.Text>
      </span>
      <span className={`${styles.summaryMetric} ${styles.summaryMetricHighlight}`}>
        <span className={styles.summaryMetricLabel}>毛利</span>
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
