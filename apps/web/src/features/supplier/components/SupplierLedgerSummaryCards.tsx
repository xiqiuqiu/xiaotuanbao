import { Col, Row, Statistic } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { getSupplierPaymentScheduleSummary } from '@/services/finance.service'
import { formatCents } from '@/features/departure/catalog'
import { SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY } from '@/features/finance/queries/finance-query-keys'

interface SupplierLedgerSummaryCardsProps {
  supplierId: string
  departureDateFrom?: string
  departureDateTo?: string
}

/**
 * 供应商往来账款 Tab 三项汇总卡：应付约定合计／已核销合计／未结清合计，
 * 跟随出团日期筛选；已关闭、已作废节点不计入。
 * 仅应付方向，无应收拆显（供应商结构上只有应付）。
 */
export function SupplierLedgerSummaryCards({
  supplierId,
  departureDateFrom,
  departureDateTo,
}: SupplierLedgerSummaryCardsProps) {
  const { data, isLoading } = useQuery({
    queryKey: [
      SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY,
      supplierId,
      departureDateFrom ?? null,
      departureDateTo ?? null,
    ],
    queryFn: ({ signal }) =>
      getSupplierPaymentScheduleSummary(
        supplierId,
        { departureDateFrom, departureDateTo },
        signal,
      ),
    ...operationalQueryOptions(),
  })

  const groups = (data?.groups ?? []).filter((group) => group.direction === 'payable')
  const amountCents = groups.reduce((sum, group) => sum + group.amountCents, 0)
  const settledAmountCents = groups.reduce(
    (sum, group) => sum + group.settledAmountCents,
    0,
  )
  const unsettledAmountCents = groups.reduce(
    (sum, group) => sum + group.unsettledAmountCents,
    0,
  )

  return (
    <Row
      gutter={[16, 16]}
      role="group"
      aria-label="应付账款汇总"
      style={{ marginBottom: 16 }}
    >
      <Col xs={24} sm={8}>
        <Statistic
          title="应付约定合计"
          value={formatCents(amountCents)}
          loading={isLoading}
        />
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
