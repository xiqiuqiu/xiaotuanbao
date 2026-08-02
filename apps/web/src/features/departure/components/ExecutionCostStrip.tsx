import { formatCents } from '../catalog'
import type { ExecutionCostStripSummary } from '../utils/execution-cost-strip-summary'
import styles from './ExecutionCostStrip.module.css'

interface ExecutionCostStripProps {
  summary: ExecutionCostStripSummary
}

/** Read-only whole-trip cost glance above departure / day resource blocks. */
export function ExecutionCostStrip({ summary }: ExecutionCostStripProps) {
  if (summary.totalCount === 0) {
    return null
  }

  const pendingLabel =
    summary.ungeneratedCount > 0
      ? `${summary.ungeneratedCount} 项待提交`
      : '已齐'

  return (
    <div className={styles.costStrip} aria-label="整团成本汇总" role="list">
      <div className={`${styles.costStripCell} ${styles.costStripHero}`} role="listitem">
        <span className={styles.costStripLabel}>成本合计</span>
        <span className={styles.costStripTotal}>{formatCents(summary.totalCents)}</span>
        <span className={styles.costStripCount}>{summary.totalCount} 项资源</span>
      </div>
      <div className={styles.costStripCell} role="listitem">
        <span className={styles.costStripLabel}>发团级</span>
        <span className={styles.costStripMetricValue}>
          {formatCents(summary.departure.resourceAmountCents)}
        </span>
        <span className={styles.costStripCount}>{summary.departure.resourceCount} 项</span>
      </div>
      <div className={styles.costStripCell} role="listitem">
        <span className={styles.costStripLabel}>按日</span>
        <span className={styles.costStripMetricValue}>
          {formatCents(summary.segment.resourceAmountCents)}
        </span>
        <span className={styles.costStripCount}>{summary.segment.resourceCount} 项</span>
      </div>
      <div
        className={`${styles.costStripCell} ${
          summary.ungeneratedCount > 0 ? styles.costStripMetricWarn : ''
        }`}
        role="listitem"
      >
        <span className={styles.costStripLabel}>尚未提交应付</span>
        <span className={styles.costStripMetricValue}>
          {formatCents(summary.ungeneratedCents)}
        </span>
        <span className={styles.costStripCount}>{pendingLabel}</span>
      </div>
    </div>
  )
}
