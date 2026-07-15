import { Typography } from 'antd'
import { PaymentScheduleWorkspace } from '@/features/finance/components/PaymentScheduleWorkspace'
import { PartnerLedgerSummaryCards } from './PartnerLedgerSummaryCards'

/**
 * 往来账款 Tab（财务账款层）：应收（我收他）/ 应付（我付他）两个子区，
 * 各复用一次 PaymentScheduleWorkspace，按 counterpartyId 精确过滤（同名 Partner 不串）；
 * 游客代收节点（counterparty=guest）不属于该 Partner 账款，不在本 Tab 出现。
 * 每个子区上方三项汇总卡跟随出团日期筛选（与确认单周期同口径）。
 */
export function PartnerLedgerPanel({ partnerId }: { partnerId: string }) {
  return (
    <div>
      <section>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          应收（我收他）
        </Typography.Title>
        <PaymentScheduleWorkspace
          scope="partner"
          direction="receivable"
          partnerId={partnerId}
          renderSummary={({ departureDateFrom, departureDateTo }) => (
            <PartnerLedgerSummaryCards
              partnerId={partnerId}
              direction="receivable"
              departureDateFrom={departureDateFrom}
              departureDateTo={departureDateTo}
            />
          )}
        />
      </section>
      <section style={{ marginTop: 24 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          应付（我付他）
        </Typography.Title>
        <PaymentScheduleWorkspace
          scope="partner"
          direction="payable"
          partnerId={partnerId}
          renderSummary={({ departureDateFrom, departureDateTo }) => (
            <PartnerLedgerSummaryCards
              partnerId={partnerId}
              direction="payable"
              departureDateFrom={departureDateFrom}
              departureDateTo={departureDateTo}
            />
          )}
        />
      </section>
    </div>
  )
}
