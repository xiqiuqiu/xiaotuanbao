/**
 * PROTOTYPE Variant A — 强化主指标带：四格连成一条 KPI，数字更大；
 * 经营构成与收付现仍分块，但进度用百分比数字主导。
 */
import { Progress } from 'antd'
import type { DepartureDetail } from '@/types/api'
import { buildOverviewSnapshot, formatCents } from './shared'
import styles from './overview-prototype.module.css'

export const VARIANT_A_NAME = '强化主指标带'

export function VariantA({ departure }: { departure: DepartureDetail }) {
  const s = buildOverviewSnapshot(departure)

  return (
    <div className={styles.root}>
      <div className={styles.aHero} aria-label="主指标">
        <div className={styles.aHeroCell}>
          <div className={styles.aHeroLabel}>总人数</div>
          <div className={styles.aHeroValue}>{s.totalGuests}人</div>
        </div>
        <div className={styles.aHeroCell}>
          <div className={styles.aHeroLabel}>结算应收</div>
          <div className={styles.aHeroValue}>{formatCents(s.netReceivableCents)}</div>
        </div>
        <div className={styles.aHeroCell}>
          <div className={styles.aHeroLabel}>成本合计</div>
          <div className={styles.aHeroValue}>{formatCents(s.costCents)}</div>
        </div>
        <div className={styles.aHeroCell}>
          <div className={styles.aHeroLabel}>当前毛利</div>
          <div
            className={`${styles.aHeroValue} ${s.marginCents < 0 ? styles.aHeroValueNeg : ''}`}
          >
            {formatCents(s.marginCents)}
          </div>
        </div>
      </div>

      <div className={styles.aSection} aria-label="经营构成">
        <div className={styles.aSectionTitle}>经营构成</div>
        <div className={styles.aCompRow}>
          <div>
            <div className={styles.aCompLabel}>原始团款</div>
            <div className={styles.aCompValue}>{formatCents(s.grossReceivableCents)}</div>
          </div>
          <div>
            <div className={styles.aCompLabel}>优惠合计</div>
            <div className={styles.aCompValue}>{formatCents(s.discountCents)}</div>
          </div>
          <div>
            <div className={styles.aCompLabel}>毛利率</div>
            <div className={styles.aCompValue}>{s.marginRate ?? '暂无数据'}</div>
          </div>
          <div>
            <div className={styles.aCompLabel}>增收净收益</div>
            <div className={styles.aCompValue}>{formatCents(s.additionalIncomeNetCents)}</div>
          </div>
        </div>
      </div>

      <div className={styles.aOps}>
        <div className={styles.aOpsCard} aria-label="收款">
          <div className={styles.aOpsTitle}>收款</div>
          <ProgressBlock
            name="团款收款进度"
            rate={s.settlementRate}
            received={s.settlementReceivedCents}
            unpaid={s.settlementUnreceivedCents}
            percentNum={s.settlementReceivableCents}
            percentDen={s.settlementReceivedCents}
          />
          <div className={styles.aOpsBlock}>
            <ProgressBlock
              name="游客代收进度"
              rate={s.guestRate}
              received={s.guestReceivedCents}
              unpaid={s.guestUnreceivedCents}
              percentNum={s.guestAgreedCents}
              percentDen={s.guestReceivedCents}
            />
          </div>
        </div>
        <div className={styles.aOpsCard} aria-label="付款">
          <div className={styles.aOpsTitle}>付款</div>
          <ProgressBlock
            name="资源付款"
            rate={s.paymentRate}
            received={s.resourcePaidCents}
            unpaid={s.resourceUnpaidCents}
            paidLabel="已付"
            unpaidLabel="未付"
            percentNum={s.costCents}
            percentDen={s.resourcePaidCents}
          />
          <div className={styles.aOpsBlock}>
            <div className={styles.aOpsMetric}>
              <span className={styles.aOpsMetricName}>返利预估</span>
              <span className={styles.aOpsMetricRate}>
                {s.estimatedRebateCents === 0 ? '暂无数据' : formatCents(s.estimatedRebateCents)}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.aOpsCard} aria-label="现金">
          <div className={styles.aOpsTitle}>现金</div>
          <div className={styles.aOpsMetric}>
            <span className={styles.aOpsMetricName}>现金净流入</span>
            <span className={styles.aOpsMetricRate}>{formatCents(s.cashNetInflowCents)}</span>
          </div>
          <div className={styles.aOpsSub}>
            <span>有效收入 {formatCents(s.incomeTransactionCents)}</span>
            <span>有效支出 {formatCents(s.expenseTransactionCents)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProgressBlock({
  name,
  rate,
  received,
  unpaid,
  paidLabel = '已收',
  unpaidLabel = '未收',
  percentNum,
  percentDen,
}: {
  name: string
  rate: string | null
  received: number
  unpaid: number
  paidLabel?: string
  unpaidLabel?: string
  percentNum: number
  percentDen: number
}) {
  const pct = percentNum > 0 ? Math.min(100, (percentDen / percentNum) * 100) : 0
  return (
    <div>
      <div className={styles.aOpsMetric}>
        <span className={styles.aOpsMetricName}>{name}</span>
        <span className={styles.aOpsMetricRate}>{rate ?? '暂无数据'}</span>
      </div>
      {rate ? <Progress percent={Number(pct.toFixed(1))} showInfo={false} size="small" /> : null}
      <div className={styles.aOpsSub}>
        <span>
          {paidLabel} {formatCents(received)}
        </span>
        <span>
          {unpaidLabel} {formatCents(unpaid)}
        </span>
      </div>
    </div>
  )
}
