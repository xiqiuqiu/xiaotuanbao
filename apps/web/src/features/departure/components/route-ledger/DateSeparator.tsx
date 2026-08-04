import { Typography } from 'antd'
import { formatRouteLedgerChineseDate } from '../../utils/route-ledger-reports'
import styles from './RouteLedgerReport.module.css'

export function DateSeparator({ startDate }: { startDate: string }) {
  return (
    <div className={styles.dateSeparator} role="separator" aria-label={formatRouteLedgerChineseDate(startDate)}>
      <span className={styles.dateSeparatorMark} aria-hidden />
      <Typography.Text strong className={styles.dateSeparatorLabel}>
        {formatRouteLedgerChineseDate(startDate)}
      </Typography.Text>
    </div>
  )
}
