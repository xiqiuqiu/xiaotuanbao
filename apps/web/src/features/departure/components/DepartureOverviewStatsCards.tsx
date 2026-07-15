import {
  Alert,
  Card,
  Col,
  Collapse,
  Flex,
  Progress,
  Row,
  Space,
  Statistic,
  Typography,
  theme,
} from 'antd'
import { TransactionDirection } from '@xiaotuanbao/shared'
import type { DepartureDetail, DepartureOverviewAnomaly } from '@xiaotuanbao/shared'
import { formatCents as formatUnsignedCents } from '../catalog'
import { DepartureTransactionsLink } from '../utils/departure-transactions-link'

const { Text } = Typography
const EQUAL_HEIGHT_CARD_STYLE = { height: '100%' } as const

function formatCents(cents: number): string {
  return cents < 0 ? `-${formatUnsignedCents(Math.abs(cents))}` : formatUnsignedCents(cents)
}

interface DepartureOverviewStatsCardsProps {
  departure: DepartureDetail
}

interface AmountDetailProps {
  label: string
  amountCents: number
  danger?: boolean
  transactionLink?: {
    departureId: string
    direction: TransactionDirection
  }
}

function AmountDetail({
  label,
  amountCents,
  danger = false,
  transactionLink,
}: AmountDetailProps) {
  if (amountCents === 0) {
    return null
  }

  return (
    <Flex justify="space-between" gap={8} wrap>
      <Text type={danger ? 'danger' : 'secondary'}>
        {label} {formatCents(amountCents)}
      </Text>
      {transactionLink ? (
        <DepartureTransactionsLink
          departureId={transactionLink.departureId}
          direction={transactionLink.direction}
        >
          查看流水
        </DepartureTransactionsLink>
      ) : null}
    </Flex>
  )
}

function DetailDisclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Collapse
      ghost
      size="small"
      items={[
        {
          key: 'details',
          label,
          children: (
            <Space orientation="vertical" size={4} style={{ width: '100%' }}>
              {children}
            </Space>
          ),
        },
      ]}
      styles={{ root: { marginTop: 8 } }}
    />
  )
}

function ProgressValue({ numerator, denominator }: { numerator: number; denominator: number }) {
  if (denominator === 0) {
    return <Text strong>—</Text>
  }

  const actualPercent = Math.round((numerator / denominator) * 1_000) / 10
  const visualPercent = Math.min(100, Math.max(0, actualPercent))

  return (
    <Flex align="center" gap={12}>
      <Progress percent={visualPercent} showInfo={false} style={{ flex: 1 }} />
      <Text strong>{actualPercent}%</Text>
    </Flex>
  )
}

function SummaryCard({
  title,
  value,
  suffix,
  equation,
}: {
  title: string
  value: string | number
  suffix?: string
  equation?: string
}) {
  return (
    <Card style={EQUAL_HEIGHT_CARD_STYLE}>
      <Statistic title={title} value={value} suffix={suffix} />
      {equation ? (
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          {equation}
        </Text>
      ) : null}
    </Card>
  )
}

function ReceivableAnomalyAlert({ anomaly }: { anomaly: DepartureOverviewAnomaly }) {
  return (
    <Alert
      type="error"
      showIcon
      title="收款守恒异常"
      description={`组成合计 ${formatCents(anomaly.actualCents)}，应为 ${formatCents(anomaly.expectedCents)}，差额 ${formatCents(anomaly.differenceCents)}`}
      style={{ marginTop: 12 }}
    />
  )
}

export function DepartureOverviewStatsCards({ departure }: DepartureOverviewStatsCardsProps) {
  const { token } = theme.useToken()
  const stats = departure.overviewStats
  const unreceivedCents =
    stats.openUnreceivedCents +
    stats.closedUnreceivedCents +
    stats.ungeneratedReceivableCents
  const unpaidCents = stats.openUnpaidCents + stats.closedUnpaidCents
  const receivableAnomaly = stats.anomalies.find(({ code }) => code === 'receivable_balance')
  const anomalyCardStyle = receivableAnomaly
    ? { ...EQUAL_HEIGHT_CARD_STYLE, borderColor: token.colorError }
    : EQUAL_HEIGHT_CARD_STYLE

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard title="总人数" value={departure.totalGuests} suffix="人" />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard title="原始应收" value={formatCents(departure.grossReceivableCents)} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard title="优惠合计" value={formatCents(departure.discountCents)} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="实际应收"
            value={formatCents(departure.netReceivableCents)}
            equation={`${formatCents(departure.grossReceivableCents)} − ${formatCents(departure.discountCents)} = ${formatCents(departure.netReceivableCents)}`}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title="成本对照"
            extra={<Text type="secondary">计调报价 / 财务已确认</Text>}
            style={EQUAL_HEIGHT_CARD_STYLE}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Statistic title="预计成本" value={formatCents(departure.payableCents)} />
              </Col>
              <Col xs={24} sm={12}>
                <Statistic title="确认应付" value={formatCents(stats.confirmedPayableCents)} />
              </Col>
            </Row>
            <Text type="secondary">
              {formatCents(stats.confirmedPayableCents)} − {formatCents(departure.payableCents)} ={' '}
              {formatCents(stats.otherPayableCents)} +{' '}
              {formatCents(stats.resourcePayableDifferenceCents)} −{' '}
              {formatCents(stats.ungeneratedPayableCents)}
            </Text>
            {(stats.ungeneratedPayableCents !== 0 ||
              stats.otherPayableCents !== 0 ||
              stats.resourcePayableDifferenceCents !== 0) && (
              <DetailDisclosure label="查看成本组成">
                <AmountDetail label="尚未生成应付" amountCents={stats.ungeneratedPayableCents} />
                <AmountDetail label="其他应付" amountCents={stats.otherPayableCents} />
                <AmountDetail
                  label="资源账款差异"
                  amountCents={stats.resourcePayableDifferenceCents}
                />
              </DetailDisclosure>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="毛利对照"
            extra={<Text type="secondary">业务预计 / 财务已确认</Text>}
            style={EQUAL_HEIGHT_CARD_STYLE}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Statistic title="预估毛利" value={formatCents(departure.estimatedMarginCents)} />
              </Col>
              <Col xs={24} sm={12}>
                <Statistic title="确认毛利" value={formatCents(stats.confirmedMarginCents)} />
              </Col>
            </Row>
            <Text type="secondary">
              {formatCents(departure.netReceivableCents)} − {formatCents(departure.payableCents)} ={' '}
              {formatCents(departure.estimatedMarginCents)}；
              {formatCents(departure.netReceivableCents)} −{' '}
              {formatCents(stats.confirmedPayableCents)} = {formatCents(stats.confirmedMarginCents)}
            </Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            title="收款进度"
            role="region"
            aria-label={receivableAnomaly ? '收款进度（数据异常）' : '收款进度'}
            style={anomalyCardStyle}
          >
            <ProgressValue
              numerator={stats.receivedCents}
              denominator={departure.netReceivableCents}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
              已收 {formatCents(stats.receivedCents)} + 未收 {formatCents(unreceivedCents)} =
              实际应收 {formatCents(departure.netReceivableCents)}
            </Text>
            {(stats.ungeneratedReceivableCents !== 0 ||
              stats.closedUnreceivedCents !== 0 ||
              stats.otherReceivableCents !== 0) && (
              <DetailDisclosure label="查看收款组成">
                <AmountDetail
                  label="尚未生成应收"
                  amountCents={stats.ungeneratedReceivableCents}
                />
                <AmountDetail
                  label="其中已关闭未收"
                  amountCents={stats.closedUnreceivedCents}
                  danger
                />
                <AmountDetail label="其他应收" amountCents={stats.otherReceivableCents} />
              </DetailDisclosure>
            )}
            {receivableAnomaly ? <ReceivableAnomalyAlert anomaly={receivableAnomaly} /> : null}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title="付款进度"
            role="region"
            aria-label="付款进度"
            style={EQUAL_HEIGHT_CARD_STYLE}
          >
            <ProgressValue
              numerator={stats.paidCents}
              denominator={stats.confirmedPayableCents}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
              已付 {formatCents(stats.paidCents)} + 未付 {formatCents(unpaidCents)} = 确认应付{' '}
              {formatCents(stats.confirmedPayableCents)}
            </Text>
            {stats.closedUnpaidCents !== 0 && (
              <DetailDisclosure label="查看付款组成">
                <AmountDetail
                  label="其中已关闭未付"
                  amountCents={stats.closedUnpaidCents}
                  danger
                />
              </DetailDisclosure>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title="资金情况"
            role="region"
            aria-label="资金情况"
            style={EQUAL_HEIGHT_CARD_STYLE}
          >
            <Row gutter={[8, 12]}>
              <Col xs={24} sm={8}>
                <Statistic title="有效收入" value={formatCents(stats.incomeTransactionCents)} />
              </Col>
              <Col xs={24} sm={8}>
                <Statistic title="有效支出" value={formatCents(stats.expenseTransactionCents)} />
              </Col>
              <Col xs={24} sm={8}>
                <Statistic title="现金净流入" value={formatCents(stats.cashNetInflowCents)} />
              </Col>
            </Row>
            <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
              有效收入 {formatCents(stats.incomeTransactionCents)} − 有效支出{' '}
              {formatCents(stats.expenseTransactionCents)} = 现金净流入{' '}
              {formatCents(stats.cashNetInflowCents)}
            </Text>
            {(stats.unverifiedIncomeCents !== 0 ||
              stats.unverifiedExpenseCents !== 0 ||
              stats.verifiedFromOtherDeparturesCents !== 0 ||
              stats.verifiedToOtherDeparturesCents !== 0) && (
              <DetailDisclosure label="查看资金提示">
                <AmountDetail
                  label="未核销收入"
                  amountCents={stats.unverifiedIncomeCents}
                  transactionLink={{
                    departureId: departure.id,
                    direction: TransactionDirection.INFLOW,
                  }}
                />
                <AmountDetail
                  label="未核销支出"
                  amountCents={stats.unverifiedExpenseCents}
                  transactionLink={{
                    departureId: departure.id,
                    direction: TransactionDirection.OUTFLOW,
                  }}
                />
                <AmountDetail
                  label="核销自他团流水"
                  amountCents={stats.verifiedFromOtherDeparturesCents}
                />
                <AmountDetail
                  label="本团流水核销至他团"
                  amountCents={stats.verifiedToOtherDeparturesCents}
                />
              </DetailDisclosure>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
