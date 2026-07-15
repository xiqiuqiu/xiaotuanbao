import { Alert, Card, Col, Row, Statistic, Typography } from 'antd'
import { TransactionDirection } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { formatCents } from '../catalog'
import { DepartureTransactionsLink } from '../utils/departure-transactions-link'

interface DepartureOverviewStatsCardsProps {
  departure: DepartureDetail
}

function UnverifiedCashHint({
  departureId,
  label,
  amountCents,
  direction,
}: {
  departureId: string
  label: string
  amountCents: number
  direction: TransactionDirection
}) {
  if (amountCents <= 0) {
    return null
  }

  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 8 }}
      title={
        <Typography.Text>
          {label} {formatCents(amountCents)}
          <DepartureTransactionsLink departureId={departureId} direction={direction}>
            查看流水
          </DepartureTransactionsLink>
        </Typography.Text>
      }
    />
  )
}

export function DepartureOverviewStatsCards({ departure }: DepartureOverviewStatsCardsProps) {
  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={6} lg={6}>
          <Card>
            <Statistic title="总人数" value={departure.totalGuests} suffix="人" />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={6}>
          <Card>
            <Statistic title="原始应收" value={formatCents(departure.grossReceivableCents)} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={6}>
          <Card>
            <Statistic title="优惠合计" value={formatCents(departure.discountCents)} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={6}>
          <Card>
            <Statistic title="实际应收" value={formatCents(departure.netReceivableCents)} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={6}>
          <Card>
            <Statistic title="预计成本" value={formatCents(departure.payableCents)} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={6}>
          <Card>
            <Statistic title="预估毛利" value={formatCents(departure.estimatedMarginCents)} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={6}>
          <Card>
            <Statistic
              title="已核销应收 / 未结清应收"
              value={formatCents(departure.verifiedReceivableCents)}
              suffix={`/ ${formatCents(departure.openUnsettledReceivableCents)}`}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={6}>
          <Card>
            <Statistic
              title="已核销应付 / 未结清应付"
              value={formatCents(departure.verifiedPayableCents)}
              suffix={`/ ${formatCents(departure.openUnsettledPayableCents)}`}
            />
          </Card>
        </Col>
      </Row>

      {(departure.unverifiedIncomeCents > 0 || departure.unverifiedExpenseCents > 0) && (
        <div style={{ marginTop: 16 }}>
          <UnverifiedCashHint
            departureId={departure.id}
            label="未核销收入"
            amountCents={departure.unverifiedIncomeCents}
            direction={TransactionDirection.INFLOW}
          />
          <UnverifiedCashHint
            departureId={departure.id}
            label="未核销支出"
            amountCents={departure.unverifiedExpenseCents}
            direction={TransactionDirection.OUTFLOW}
          />
        </div>
      )}
    </>
  )
}
