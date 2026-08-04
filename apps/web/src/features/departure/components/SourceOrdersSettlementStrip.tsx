import { formatCents } from '../catalog'
import type { SourceOrdersSettlementStripSummary } from '../utils/source-orders-settlement-glance'
import styles from './SourceOrdersSettlementStrip.module.css'

interface SourceOrdersSettlementStripProps {
  summary: SourceOrdersSettlementStripSummary
}

/** Read-only settlement glance above the source-orders table (scheme A). */
export function SourceOrdersSettlementStrip({
  summary,
}: SourceOrdersSettlementStripProps) {
  if (summary.orderCount === 0) {
    return null
  }

  const pendingLabel =
    summary.ungeneratedCount > 0 ? `${summary.ungeneratedCount} 单待提交` : '无待办'

  return (
    <ul
      className={styles.settlementStrip}
      aria-label="客源结算汇总"
    >
      <li className={`${styles.settlementStripCell} ${styles.settlementStripHero}`}>
        <span className={styles.settlementStripLabel}>结算应收</span>
        <span className={styles.settlementStripTotal}>
          {formatCents(summary.netReceivableCents)}
        </span>
        <span className={styles.settlementStripCount}>
          {summary.orderCount} 单 · {summary.totalGuests} 人
        </span>
      </li>
      <li className={styles.settlementStripCell}>
        <span className={styles.settlementStripLabel}>客户已收</span>
        <span className={styles.settlementStripMetricValue}>
          {formatCents(summary.partnerCollectedCents)}
        </span>
      </li>
      <li className={styles.settlementStripCell}>
        <span className={styles.settlementStripLabel}>我方代收约定</span>
        <span className={styles.settlementStripMetricValue}>
          {formatCents(summary.guestCollectCents)}
        </span>
      </li>
      <li
        className={`${styles.settlementStripCell} ${
          summary.ungeneratedCount > 0 ? styles.settlementStripMetricWarn : ''
        }`}
      >
        <span className={styles.settlementStripLabel}>尚未提交应收</span>
        <span className={styles.settlementStripMetricValue}>
          {formatCents(summary.ungeneratedCents)}
        </span>
        <span className={styles.settlementStripCount}>{pendingLabel}</span>
      </li>
    </ul>
  )
}
