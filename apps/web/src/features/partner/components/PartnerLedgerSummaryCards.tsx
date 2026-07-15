import { Col, Row, Statistic, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { getPartnerPaymentScheduleSummary } from '@/services/finance.service'
import { formatCents } from '@/features/departure/catalog'
import { PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY } from '@/features/finance/queries/finance-query-keys'

interface PartnerLedgerSummaryCardsProps {
  partnerId: string
  direction: 'receivable' | 'payable'
  departureDateFrom?: string
  departureDateTo?: string
}

/**
 * 往来账款 Tab 每方向三项汇总卡：约定合计／已核销合计／未结清合计，
 * 跟随出团日期筛选；已关闭、已作废节点不计入。
 * 应收侧约定合计拆显「客户补款／其他应收」，客户补款与同周期确认单
 * 「客户已收押金」列合计同口径。
 */
export function PartnerLedgerSummaryCards({
  partnerId,
  direction,
  departureDateFrom,
  departureDateTo,
}: PartnerLedgerSummaryCardsProps) {
  const { data, isLoading } = useQuery({
    queryKey: [
      PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY,
      partnerId,
      departureDateFrom ?? null,
      departureDateTo ?? null,
    ],
    queryFn: ({ signal }) =>
      getPartnerPaymentScheduleSummary(
        partnerId,
        { departureDateFrom, departureDateTo },
        signal,
      ),
    ...operationalQueryOptions(),
  })

  const isReceivable = direction === 'receivable'
  const groups = (data?.groups ?? []).filter((group) => group.direction === direction)
  const amountCents = groups.reduce((sum, group) => sum + group.amountCents, 0)
  const settledAmountCents = groups.reduce(
    (sum, group) => sum + group.settledAmountCents,
    0,
  )
  const unsettledAmountCents = groups.reduce(
    (sum, group) => sum + group.unsettledAmountCents,
    0,
  )
  const customerSettlementCents = groups
    .filter(
      (group) =>
        group.sourceType ===
        PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    )
    .reduce((sum, group) => sum + group.amountCents, 0)
  const otherReceivableCents = amountCents - customerSettlementCents

  return (
    <Row
      gutter={[16, 16]}
      role="group"
      aria-label={isReceivable ? '应收账款汇总' : '应付账款汇总'}
      style={{ marginBottom: 16 }}
    >
      <Col xs={24} sm={8}>
        <Statistic
          title={isReceivable ? '应收约定合计' : '应付约定合计'}
          value={formatCents(amountCents)}
          loading={isLoading}
        />
        {isReceivable && !isLoading ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            客户补款 {formatCents(customerSettlementCents)} ／ 其他应收{' '}
            {formatCents(otherReceivableCents)}
          </Typography.Text>
        ) : null}
      </Col>
      <Col xs={12} sm={8}>
        <Statistic
          title="已核销合计"
          value={formatCents(settledAmountCents)}
          loading={isLoading}
        />
      </Col>
      <Col xs={12} sm={8}>
        <Statistic
          title="未结清合计"
          value={formatCents(unsettledAmountCents)}
          loading={isLoading}
        />
      </Col>
    </Row>
  )
}
