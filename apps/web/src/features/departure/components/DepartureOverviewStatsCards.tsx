import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Popover,
  Progress,
  Row,
  Space,
  Statistic,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { TransactionDirection } from '@xiaotuanbao/shared'
import type { DepartureDetail, DepartureOverviewAnomaly } from '@xiaotuanbao/shared'
import { formatCents as formatUnsignedCents } from '../catalog'
import { DepartureTransactionsLink } from '../utils/departure-transactions-link'
import styles from './DepartureOverviewStatsCards.module.css'

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

function OverviewDetailsPopover({
  title,
  buttonLabel,
  children,
}: {
  title: string
  buttonLabel: string
  children: React.ReactNode
}) {
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={title}
      content={
        <Space orientation="vertical" size={8} style={{ width: 280 }}>
          {children}
        </Space>
      }
    >
      <Button type="link" size="small">
        {buttonLabel}
      </Button>
    </Popover>
  )
}

function CostDetailsPopover({
  ungeneratedPayableCents,
  otherPayableCents,
  resourcePayableDifferenceCents,
}: {
  ungeneratedPayableCents: number
  otherPayableCents: number
  resourcePayableDifferenceCents: number
}) {
  return (
    <OverviewDetailsPopover title="成本组成" buttonLabel="查看成本组成">
      <AmountDetail label="尚未生成应付" amountCents={ungeneratedPayableCents} />
      <AmountDetail label="其他应付" amountCents={otherPayableCents} />
      <AmountDetail label="资源账款差异" amountCents={resourcePayableDifferenceCents} />
    </OverviewDetailsPopover>
  )
}

function ReceivableDetailsPopover({
  ungeneratedReceivableCents,
  closedUnreceivedCents,
  otherReceivableCents,
}: {
  ungeneratedReceivableCents: number
  closedUnreceivedCents: number
  otherReceivableCents: number
}) {
  return (
    <OverviewDetailsPopover title="收款组成" buttonLabel="查看收款组成">
      <AmountDetail label="尚未生成应收" amountCents={ungeneratedReceivableCents} />
      <AmountDetail label="其中已关闭未收" amountCents={closedUnreceivedCents} danger />
      <AmountDetail label="其他应收" amountCents={otherReceivableCents} />
    </OverviewDetailsPopover>
  )
}

function PaymentDetailsPopover({ closedUnpaidCents }: { closedUnpaidCents: number }) {
  return (
    <OverviewDetailsPopover title="付款组成" buttonLabel="查看付款组成">
      <AmountDetail label="其中已关闭未付" amountCents={closedUnpaidCents} danger />
    </OverviewDetailsPopover>
  )
}

function CashHintsPopover({
  departureId,
  unverifiedIncomeCents,
  unverifiedExpenseCents,
  verifiedFromOtherDeparturesCents,
  verifiedToOtherDeparturesCents,
}: {
  departureId: string
  unverifiedIncomeCents: number
  unverifiedExpenseCents: number
  verifiedFromOtherDeparturesCents: number
  verifiedToOtherDeparturesCents: number
}) {
  return (
    <OverviewDetailsPopover title="资金提示" buttonLabel="查看资金提示">
      <AmountDetail
        label="未核销收入"
        amountCents={unverifiedIncomeCents}
        transactionLink={{
          departureId,
          direction: TransactionDirection.INFLOW,
        }}
      />
      <AmountDetail
        label="未核销支出"
        amountCents={unverifiedExpenseCents}
        transactionLink={{
          departureId,
          direction: TransactionDirection.OUTFLOW,
        }}
      />
      <AmountDetail
        label="核销自他团流水"
        amountCents={verifiedFromOtherDeparturesCents}
      />
      <AmountDetail
        label="本团流水核销至他团"
        amountCents={verifiedToOtherDeparturesCents}
      />
    </OverviewDetailsPopover>
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

function CalculationTitle({
  label,
  description,
  equation,
}: {
  label: string
  description: string
  equation: string
}) {
  return (
    <Flex component="span" align="center" gap={2}>
      <span>{label}</span>
      <Tooltip
        title={
          <Space orientation="vertical" size={4}>
            <span>{description}</span>
            <span>计算：{equation}</span>
          </Space>
        }
        styles={{ root: { maxWidth: 420 } }}
      >
        <Button
          type="text"
          size="small"
          icon={<InfoCircleOutlined />}
          aria-label={`查看${label}计算方式`}
          style={{ width: 24, minWidth: 24, height: 24, padding: 0 }}
        />
      </Tooltip>
    </Flex>
  )
}

function SummaryCard({
  title,
  value,
  suffix,
  equationDescription,
  equation,
}: {
  title: string
  value: string | number
  suffix?: string
  equationDescription?: string
  equation?: string
}) {
  return (
    <Card className={styles.metricCard} style={EQUAL_HEIGHT_CARD_STYLE}>
      <Statistic
        title={
          equation && equationDescription ? (
            <CalculationTitle
              label={title}
              description={equationDescription}
              equation={equation}
            />
          ) : (
            title
          )
        }
        value={value}
        suffix={suffix}
      />
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
  const hasCostDetails =
    stats.ungeneratedPayableCents !== 0 ||
    stats.otherPayableCents !== 0 ||
    stats.resourcePayableDifferenceCents !== 0
  const hasReceivableDetails =
    stats.ungeneratedReceivableCents !== 0 ||
    stats.closedUnreceivedCents !== 0 ||
    stats.otherReceivableCents !== 0
  const hasCashHints =
    stats.unverifiedIncomeCents !== 0 ||
    stats.unverifiedExpenseCents !== 0 ||
    stats.verifiedFromOtherDeparturesCents !== 0 ||
    stats.verifiedToOtherDeparturesCents !== 0
  const receivableAnomaly = stats.anomalies.find(({ code }) => code === 'receivable_balance')
  const anomalyCardStyle = receivableAnomaly
    ? { ...EQUAL_HEIGHT_CARD_STYLE, borderColor: token.colorError }
    : EQUAL_HEIGHT_CARD_STYLE
  const costEquation = `${formatCents(stats.confirmedPayableCents)} − ${formatCents(departure.payableCents)} = ${formatCents(stats.otherPayableCents)} + ${formatCents(stats.resourcePayableDifferenceCents)} − ${formatCents(stats.ungeneratedPayableCents)}`
  const marginEquation = `${formatCents(departure.netReceivableCents)} − ${formatCents(departure.payableCents)} = ${formatCents(departure.estimatedMarginCents)}；${formatCents(departure.netReceivableCents)} − ${formatCents(stats.confirmedPayableCents)} = ${formatCents(stats.confirmedMarginCents)}`
  const receivableEquation = `已收 ${formatCents(stats.receivedCents)} + 未收 ${formatCents(unreceivedCents)} = 实际应收 ${formatCents(departure.netReceivableCents)}`
  const payableEquation = `已付 ${formatCents(stats.paidCents)} + 未付 ${formatCents(unpaidCents)} = 确认应付 ${formatCents(stats.confirmedPayableCents)}`
  const cashEquation = `有效收入 ${formatCents(stats.incomeTransactionCents)} − 有效支出 ${formatCents(stats.expenseTransactionCents)} = 现金净流入 ${formatCents(stats.cashNetInflowCents)}`

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]} className={styles.firstRow}>
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
            equationDescription="原始应收是优惠前团款，优惠合计是全部优惠金额；实际应收是优惠后的应收金额。"
            equation={`${formatCents(departure.grossReceivableCents)} − ${formatCents(departure.discountCents)} = ${formatCents(departure.netReceivableCents)}`}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className={styles.secondRow}>
        <Col xs={24} lg={12}>
          <Card
            className={styles.metricCard}
            title={
              <CalculationTitle
                label="成本对照"
                description="预计成本来自本团全部行程资源约定金额；确认应付来自全部非作废应付节点。两者差额由其他应付、资源账款差异和尚未生成应付共同解释。"
                equation={costEquation}
              />
            }
            extra={
              hasCostDetails ? (
                <CostDetailsPopover
                  ungeneratedPayableCents={stats.ungeneratedPayableCents}
                  otherPayableCents={stats.otherPayableCents}
                  resourcePayableDifferenceCents={stats.resourcePayableDifferenceCents}
                />
              ) : null
            }
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
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            className={styles.metricCard}
            title={
              <CalculationTitle
                label="毛利对照"
                description="预估毛利按预计成本计算，确认毛利按财务已确认的应付计算；两者都以实际应收作为收入。"
                equation={marginEquation}
              />
            }
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
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className={styles.thirdRow}>
        <Col xs={24} lg={8}>
          <Card
            className={styles.metricCard}
            title={
              <CalculationTitle
                label="收款进度"
                description="已收仅统计客源路径已核销金额；未收包含开放未收、已关闭未收和尚未生成应收，其他应收不计入本进度。"
                equation={receivableEquation}
              />
            }
            extra={
              hasReceivableDetails ? (
                <ReceivableDetailsPopover
                  ungeneratedReceivableCents={stats.ungeneratedReceivableCents}
                  closedUnreceivedCents={stats.closedUnreceivedCents}
                  otherReceivableCents={stats.otherReceivableCents}
                />
              ) : null
            }
            role="region"
            aria-label={receivableAnomaly ? '收款进度（数据异常）' : '收款进度'}
            style={anomalyCardStyle}
          >
            <ProgressValue
              numerator={stats.receivedCents}
              denominator={departure.netReceivableCents}
            />
            {receivableAnomaly ? <ReceivableAnomalyAlert anomaly={receivableAnomaly} /> : null}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            className={styles.metricCard}
            title={
              <CalculationTitle
                label="付款进度"
                description="已付统计全部非作废应付节点的有效核销金额；未付包含开放未付和已关闭未付。"
                equation={payableEquation}
              />
            }
            extra={
              stats.closedUnpaidCents !== 0 ? (
                <PaymentDetailsPopover closedUnpaidCents={stats.closedUnpaidCents} />
              ) : null
            }
            role="region"
            aria-label="付款进度"
            style={EQUAL_HEIGHT_CARD_STYLE}
          >
            <ProgressValue
              numerator={stats.paidCents}
              denominator={stats.confirmedPayableCents}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            className={styles.metricCard}
            title={
              <CalculationTitle
                label="资金情况"
                description="有效收入和有效支出统计本团全部未作废流水，包含已核销与未核销；现金净流入表示实际资金净流动，不代表利润。"
                equation={cashEquation}
              />
            }
            extra={
              hasCashHints ? (
                <CashHintsPopover
                  departureId={departure.id}
                  unverifiedIncomeCents={stats.unverifiedIncomeCents}
                  unverifiedExpenseCents={stats.unverifiedExpenseCents}
                  verifiedFromOtherDeparturesCents={stats.verifiedFromOtherDeparturesCents}
                  verifiedToOtherDeparturesCents={stats.verifiedToOtherDeparturesCents}
                />
              ) : null
            }
            role="region"
            aria-label="资金情况"
            style={EQUAL_HEIGHT_CARD_STYLE}
          >
            <Row gutter={[8, 12]}>
              <Col xs={24} sm={8} lg={24} xxl={8}>
                <Statistic title="有效收入" value={formatCents(stats.incomeTransactionCents)} />
              </Col>
              <Col xs={24} sm={8} lg={24} xxl={8}>
                <Statistic title="有效支出" value={formatCents(stats.expenseTransactionCents)} />
              </Col>
              <Col xs={24} sm={8} lg={24} xxl={8}>
                <Statistic title="现金净流入" value={formatCents(stats.cashNetInflowCents)} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
