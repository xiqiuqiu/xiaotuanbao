/**
 * PROTOTYPE Variant B — 损益纵轴 + 进度环（调优）。
 * - 人数提到顶作上下文，不混进损益行
 * - 负毛利用左边线强调，避免整行粉底过吵
 * - 进度环空态统一为轨道 +「未建立」，不再「— / 暂无数据 / 0%」混用
 * - 返利从现金条挪到付款侧；现金拆成三格
 */
import { Progress } from 'antd'
import type { DepartureDetail } from '@/types/api'
import { buildOverviewSnapshot, formatCents, progressPercent } from './shared'
import styles from './overview-prototype.module.css'

export const VARIANT_B_NAME = '损益纵轴 · 进度环'

export function VariantB({ departure }: { departure: DepartureDetail }) {
  const s = buildOverviewSnapshot(departure)

  return (
    <div className={styles.root}>
      <div className={styles.bLayout}>
        <div className={styles.bPnl} aria-label="经营损益">
          <div className={styles.bPnlHead}>
            <div className={styles.bPnlTitle}>经营损益</div>
            <span className={styles.bGuestChip}>{s.totalGuests} 人</span>
          </div>

          <div className={styles.bPnlRow}>
            <span className={styles.bPnlLabel}>结算应收</span>
            <span className={styles.bPnlValue}>{formatCents(s.netReceivableCents)}</span>
          </div>
          <div className={styles.bPnlRow}>
            <span className={styles.bPnlLabel}>成本合计</span>
            <span className={styles.bPnlValue}>{formatCents(s.costCents)}</span>
          </div>
          <div
            className={`${styles.bPnlRow} ${styles.bPnlEmphasis} ${s.marginCents < 0 ? styles.bPnlEmphasisNeg : ''}`}
          >
            <span className={styles.bPnlLabel}>当前毛利</span>
            <span className={`${styles.bPnlValue} ${s.marginCents < 0 ? styles.bPnlNeg : ''}`}>
              {formatCents(s.marginCents)}
            </span>
          </div>

          <div className={styles.bPnlSecondary}>
            <div className={styles.bPnlRow}>
              <span className={styles.bPnlLabel}>毛利率</span>
              <span className={styles.bPnlValueSm}>{s.marginRate ?? '—'}</span>
            </div>
            <div className={styles.bPnlRow}>
              <span className={styles.bPnlLabel}>增收净收益</span>
              <span className={styles.bPnlValueSm}>{formatCents(s.additionalIncomeNetCents)}</span>
            </div>
          </div>

          <p className={styles.bMeta}>
            原始团款 {formatCents(s.grossReceivableCents)}
            <span className={styles.bMetaSep}>·</span>
            优惠 {formatCents(s.discountCents)}
          </p>
        </div>

        <div className={styles.bRight}>
          <div className={styles.bRings} aria-label="收付款进度">
            <Ring
              label="团款收款"
              hasBase={s.settlementReceivableCents > 0}
              rate={s.settlementRate}
              percent={progressPercent(s.settlementReceivedCents, s.settlementReceivableCents)}
              doneLabel="已收"
              doneCents={s.settlementReceivedCents}
              restLabel="未收"
              restCents={s.settlementUnreceivedCents}
            />
            <Ring
              label="游客代收"
              hasBase={s.guestAgreedCents > 0}
              rate={s.guestRate}
              percent={progressPercent(s.guestReceivedCents, s.guestAgreedCents)}
              doneLabel="已收"
              doneCents={s.guestReceivedCents}
              restLabel="未收"
              restCents={s.guestUnreceivedCents}
            />
            <Ring
              label="资源付款"
              hasBase={s.costCents > 0}
              rate={s.paymentRate}
              percent={progressPercent(s.resourcePaidCents, s.costCents)}
              doneLabel="已付"
              doneCents={s.resourcePaidCents}
              restLabel="未付"
              restCents={s.resourceUnpaidCents}
            />
          </div>

          <div className={styles.bPayMeta} aria-label="返利">
            <span className={styles.bPayMetaLabel}>返利预估</span>
            <span className={styles.bPayMetaValue}>{formatCents(s.estimatedRebateCents)}</span>
          </div>

          <div className={styles.bCash} aria-label="现金">
            <div className={styles.bCashCell}>
              <div className={styles.bCashLabel}>现金净流入</div>
              <div className={styles.bCashMain}>{formatCents(s.cashNetInflowCents)}</div>
            </div>
            <div className={styles.bCashCell}>
              <div className={styles.bCashLabel}>有效收入</div>
              <div className={styles.bCashSideValue}>{formatCents(s.incomeTransactionCents)}</div>
            </div>
            <div className={styles.bCashCell}>
              <div className={styles.bCashLabel}>有效支出</div>
              <div className={styles.bCashSideValue}>{formatCents(s.expenseTransactionCents)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Ring({
  label,
  hasBase,
  rate,
  percent,
  doneLabel,
  doneCents,
  restLabel,
  restCents,
}: {
  label: string
  hasBase: boolean
  rate: string | null
  percent: number
  doneLabel: string
  doneCents: number
  restLabel: string
  restCents: number
}) {
  const display = hasBase ? (rate ?? '0.0%') : '—'
  return (
    <div className={styles.bRingCell}>
      <Progress
        type="circle"
        percent={hasBase ? Number(percent.toFixed(1)) : 0}
        size={88}
        strokeWidth={8}
        strokeColor={hasBase ? undefined : 'var(--ant-color-border)'}
        trailColor="var(--ant-color-fill-secondary)"
        format={() => (
          <span className={hasBase ? styles.bRingPct : styles.bRingPctEmpty}>{display}</span>
        )}
      />
      <div className={styles.bRingLabel}>{label}</div>
      {hasBase ? (
        <div className={styles.bRingSub}>
          {doneLabel} {formatCents(doneCents)}
          <span className={styles.bMetaSep}>·</span>
          {restLabel} {formatCents(restCents)}
        </div>
      ) : (
        <div className={styles.bRingSubEmpty}>尚未建立口径</div>
      )}
    </div>
  )
}
