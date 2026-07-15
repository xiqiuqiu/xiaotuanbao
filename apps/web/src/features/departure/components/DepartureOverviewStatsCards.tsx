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
import { EllipsisOutlined, InfoCircleOutlined } from '@ant-design/icons'
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

/** 分母为零返回 null（展示「暂无数据」）；否则固定 1 位小数，保留负数与超 100% 真实值。 */
function formatPercent(numerator: number, denominator: number): string | null {
  if (denominator === 0) {
    return null
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`
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
      <Button
        type="text"
        size="small"
        icon={<EllipsisOutlined />}
        aria-label={buttonLabel}
        style={{ width: 24, minWidth: 24, height: 24, padding: 0 }}
      />
    </Popover>
  )
}

function ProgressValue({ numerator, denominator }: { numerator: number; denominator: number }) {
  if (denominator === 0) {
    return <Text strong>暂无数据</Text>
  }

  const actualPercent = (numerator / denominator) * 100
  const visualPercent = Math.min(100, Math.max(0, actualPercent))

  return (
    <Flex align="center" gap={12}>
      <Progress percent={visualPercent} showInfo={false} style={{ flex: 1 }} />
      <Text strong>{`${actualPercent.toFixed(1)}%`}</Text>
    </Flex>
  )
}

/** 进度条下方的金额构成行：已收/未收、已付/未付，保留有符号真实金额。 */
function ProgressBreakdown({
  items,
}: {
  items: { label: string; amountCents: number }[]
}) {
  return (
    <Flex justify="space-between" gap={12} wrap className={styles.progressBreakdown}>
      {items.map(({ label, amountCents }) => (
        <Flex key={label} align="baseline" gap={8}>
          <Text type="secondary">{label}</Text>
          <Text strong>{formatCents(amountCents)}</Text>
        </Flex>
      ))}
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
  entry,
}: {
  title: string
  value: string | number
  suffix?: string
  equationDescription?: string
  equation?: string
  /** 卡片右上角的明细入口图标按钮 */
  entry?: React.ReactNode
}) {
  const titleNode =
    equation && equationDescription ? (
      <CalculationTitle label={title} description={equationDescription} equation={equation} />
    ) : (
      <span>{title}</span>
    )

  return (
    <Card className={styles.metricCard} style={EQUAL_HEIGHT_CARD_STYLE}>
      <Statistic
        title={
          entry ? (
            <Flex component="span" align="center" justify="space-between" style={{ width: '100%' }}>
              {titleNode}
              {entry}
            </Flex>
          ) : (
            titleNode
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
  const hasCostDetails =
    stats.confirmedPayableCents !== 0 ||
    stats.ungeneratedPayableCents !== 0 ||
    stats.otherPayableCents !== 0 ||
    stats.resourcePayableDifferenceCents !== 0
  const hasReceivableDetails =
    stats.ungeneratedReceivableCents !== 0 ||
    stats.closedUnreceivedCents !== 0 ||
    stats.otherReceivableCents !== 0
  const hasPaymentDetails =
    stats.confirmedPayableCents !== 0 || stats.closedUnpaidCents !== 0
  const hasCashHints =
    stats.unverifiedIncomeCents !== 0 ||
    stats.unverifiedExpenseCents !== 0 ||
    stats.verifiedFromExternalCents !== 0 ||
    stats.verifiedToOtherDeparturesCents !== 0
  const receivableAnomaly = stats.anomalies.find(({ code }) => code === 'receivable_balance')
  const anomalyCardStyle = receivableAnomaly
    ? { ...EQUAL_HEIGHT_CARD_STYLE, borderColor: token.colorError }
    : EQUAL_HEIGHT_CARD_STYLE

  const marginRateLabel = formatPercent(departure.estimatedMarginCents, departure.netReceivableCents)
  const allPayableProgressLabel = formatPercent(stats.paidCents, stats.confirmedPayableCents)

  const settlementEquation = `原始团款 ${formatCents(departure.grossReceivableCents)} − 优惠合计 ${formatCents(departure.discountCents)} = 结算应收 ${formatCents(departure.netReceivableCents)}`
  const costEquation = `确认应付 ${formatCents(stats.confirmedPayableCents)} − 成本合计 ${formatCents(departure.payableCents)} = 其他应付 ${formatCents(stats.otherPayableCents)} + 资源账款差异 ${formatCents(stats.resourcePayableDifferenceCents)} − 尚未生成应付 ${formatCents(stats.ungeneratedPayableCents)}`
  const marginEquation = `结算应收 ${formatCents(departure.netReceivableCents)} − 成本合计 ${formatCents(departure.payableCents)} = 当前毛利 ${formatCents(departure.estimatedMarginCents)}`
  const marginRateEquation = `当前毛利 ${formatCents(departure.estimatedMarginCents)} ÷ 结算应收 ${formatCents(departure.netReceivableCents)}`
  const receivableEquation = `已收 ${formatCents(stats.receivedCents)} + 未收 ${formatCents(unreceivedCents)} = 结算应收 ${formatCents(departure.netReceivableCents)}`
  const payableEquation = `资源应付已核销 ${formatCents(stats.resourcePaidCents)} ÷ 成本合计 ${formatCents(departure.payableCents)}`
  const cashEquation = `有效收入 ${formatCents(stats.incomeTransactionCents)} − 有效支出 ${formatCents(stats.expenseTransactionCents)} = 现金净流入 ${formatCents(stats.cashNetInflowCents)}`

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]} className={styles.firstRow}>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard title="总人数" value={departure.totalGuests} suffix="人" />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="结算应收"
            value={formatCents(departure.netReceivableCents)}
            equationDescription="结算应收是全部客源单优惠后的团款合计，不含手工创建的其他应收。"
            equation={settlementEquation}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="成本合计"
            value={formatCents(departure.payableCents)}
            equationDescription="成本合计是全部行程资源约定金额合计，无论是否已生成应付；确认应付来自全部非作废应付节点，两者差额由组成项解释。"
            equation={costEquation}
            entry={
              hasCostDetails ? (
                <OverviewDetailsPopover title="成本组成" buttonLabel="查看成本组成">
                  <AmountDetail label="确认应付" amountCents={stats.confirmedPayableCents} />
                  <AmountDetail label="尚未生成应付" amountCents={stats.ungeneratedPayableCents} />
                  <AmountDetail label="其他应付" amountCents={stats.otherPayableCents} />
                  <AmountDetail
                    label="资源账款差异"
                    amountCents={stats.resourcePayableDifferenceCents}
                  />
                </OverviewDetailsPopover>
              ) : null
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="当前毛利"
            value={formatCents(departure.estimatedMarginCents)}
            equationDescription="当前毛利是实时经营预估：结算应收减成本合计；确认毛利按财务已确认的应付计算，见毛利对照。"
            equation={marginEquation}
            entry={
              stats.confirmedPayableCents !== 0 ? (
                <OverviewDetailsPopover title="毛利对照" buttonLabel="查看毛利对照">
                  <Text type="secondary">
                    确认毛利 {formatCents(stats.confirmedMarginCents)}
                  </Text>
                  <Text type="secondary">确认毛利 = 结算应收 − 确认应付</Text>
                </OverviewDetailsPopover>
              ) : null
            }
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className={styles.secondRow} role="group" aria-label="经营补充">
        <Col xs={24} sm={12} xl={8}>
          <SummaryCard title="原始团款" value={formatCents(departure.grossReceivableCents)} />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <SummaryCard title="优惠合计" value={formatCents(departure.discountCents)} />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <SummaryCard
            title="毛利率"
            value={marginRateLabel ?? '暂无数据'}
            equationDescription="毛利率是当前毛利占结算应收的比例；结算应收为零时无可计算比例。"
            equation={marginRateEquation}
          />
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
                <OverviewDetailsPopover title="收款组成" buttonLabel="查看收款组成">
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
                </OverviewDetailsPopover>
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
            <ProgressBreakdown
              items={[
                { label: '已收', amountCents: stats.receivedCents },
                { label: '未收', amountCents: unreceivedCents },
              ]}
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
                description="只统计资源应付的有效核销，以成本合计为分母；手工应付与资源账款差异留在付款组成，进度可合法超过 100% 或偏低。"
                equation={payableEquation}
              />
            }
            extra={
              hasPaymentDetails ? (
                <OverviewDetailsPopover title="付款组成" buttonLabel="查看付款组成">
                  {allPayableProgressLabel != null ? (
                    <Text type="secondary">
                      全部应付核销进度 {allPayableProgressLabel}（全部已付{' '}
                      {formatCents(stats.paidCents)} ÷ 确认应付{' '}
                      {formatCents(stats.confirmedPayableCents)}）
                    </Text>
                  ) : null}
                  <AmountDetail
                    label="其中已关闭未付"
                    amountCents={stats.closedUnpaidCents}
                    danger
                  />
                </OverviewDetailsPopover>
              ) : null
            }
            role="region"
            aria-label="付款进度"
            style={EQUAL_HEIGHT_CARD_STYLE}
          >
            <ProgressValue
              numerator={stats.resourcePaidCents}
              denominator={departure.payableCents}
            />
            <ProgressBreakdown
              items={[
                { label: '已付', amountCents: stats.resourcePaidCents },
                { label: '未付', amountCents: departure.payableCents - stats.resourcePaidCents },
              ]}
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
                <OverviewDetailsPopover title="资金提示" buttonLabel="查看资金提示">
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
                    label="核销自外部流水"
                    amountCents={stats.verifiedFromExternalCents}
                  />
                  <AmountDetail
                    label="本团流水核销至他团"
                    amountCents={stats.verifiedToOtherDeparturesCents}
                  />
                </OverviewDetailsPopover>
              ) : null
            }
            role="region"
            aria-label="资金情况"
            style={EQUAL_HEIGHT_CARD_STYLE}
          >
            <Flex align="center" justify="space-between" gap={16} wrap>
              <Statistic title="现金净流入" value={formatCents(stats.cashNetInflowCents)} />
              <Flex
                vertical
                gap={4}
                role="group"
                aria-label="资金收支明细"
                className={styles.cashBreakdown}
              >
                <Flex justify="space-between" gap={12}>
                  <Text type="secondary">有效收入</Text>
                  <Text strong>{formatCents(stats.incomeTransactionCents)}</Text>
                </Flex>
                <Flex justify="space-between" gap={12}>
                  <Text type="secondary">有效支出</Text>
                  <Text strong>{formatCents(stats.expenseTransactionCents)}</Text>
                </Flex>
              </Flex>
            </Flex>
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
