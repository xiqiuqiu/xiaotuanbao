/**
 * PROTOTYPE Variant C — 报表清单：单张白纸、分组行表，不用卡片网格。
 * 右对齐金额，主指标加大；空态用「—」而非「暂无数据」占版。
 */
import type { DepartureDetail } from '@/types/api'
import { buildOverviewSnapshot, formatCents } from './shared'
import styles from './overview-prototype.module.css'

export const VARIANT_C_NAME = '报表清单 · 无卡片'

export function VariantC({ departure }: { departure: DepartureDetail }) {
  const s = buildOverviewSnapshot(departure)

  return (
    <div className={styles.root}>
      <div className={styles.cSheet} aria-label="概览报表">
        <div className={styles.cGroupTitle}>主指标</div>
        <Row label="总人数" value={`${s.totalGuests}人`} primary />
        <Row label="结算应收" value={formatCents(s.netReceivableCents)} primary />
        <Row label="成本合计" value={formatCents(s.costCents)} primary />
        <Row
          label="当前毛利"
          value={formatCents(s.marginCents)}
          primary
          negative={s.marginCents < 0}
        />

        <div className={styles.cGroupTitle}>经营构成</div>
        <Row label="原始团款" value={formatCents(s.grossReceivableCents)} />
        <Row label="优惠合计" value={formatCents(s.discountCents)} />
        <Row label="毛利率" value={s.marginRate ?? '—'} />
        <Row label="增收净收益" value={formatCents(s.additionalIncomeNetCents)} />

        <div className={styles.cGroupTitle}>收款</div>
        <Row
          label="团款收款进度"
          value={s.settlementRate ?? '—'}
          hint={
            s.settlementRate
              ? `已收 ${formatCents(s.settlementReceivedCents)} · 未收 ${formatCents(s.settlementUnreceivedCents)}`
              : undefined
          }
        />
        <Row
          label="游客代收进度"
          value={s.guestRate ?? '—'}
          hint={
            s.guestRate
              ? `已收 ${formatCents(s.guestReceivedCents)} · 未收 ${formatCents(s.guestUnreceivedCents)}`
              : undefined
          }
        />

        <div className={styles.cGroupTitle}>付款</div>
        <Row
          label="资源付款"
          value={s.paymentRate ?? '—'}
          hint={
            s.paymentRate || s.costCents > 0
              ? `已付 ${formatCents(s.resourcePaidCents)} · 未付 ${formatCents(s.resourceUnpaidCents)}`
              : undefined
          }
        />
        <Row label="返利预估" value={formatCents(s.estimatedRebateCents)} />

        <div className={styles.cGroupTitle}>现金</div>
        <Row label="现金净流入" value={formatCents(s.cashNetInflowCents)} primary />
        <Row label="有效收入" value={formatCents(s.incomeTransactionCents)} />
        <Row label="有效支出" value={formatCents(s.expenseTransactionCents)} />
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  primary,
  negative,
  hint,
}: {
  label: string
  value: string
  primary?: boolean
  negative?: boolean
  hint?: string
}) {
  return (
    <div className={`${styles.cRow} ${primary ? styles.cRowPrimary : ''}`}>
      <span className={styles.cLabel}>
        {label}
        {hint ? <span className={styles.cHint}>{hint}</span> : null}
      </span>
      <span
        className={`${styles.cValue} ${negative ? styles.cValueNeg : ''} ${value === '—' ? styles.cValueMuted : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
