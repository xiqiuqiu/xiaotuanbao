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
import { formatReceivableBalanceAnomalyCopy } from '../utils/format-receivable-balance-anomaly'
import styles from './DepartureOverviewStatsCards.module.css'

const { Text, Title } = Typography
const EQUAL_HEIGHT_CARD_STYLE = { height: '100%' } as const

const CALCULATION_GUIDE = {
  结算应收:
    '本团当前应向客户收取的金额。计算：原始团款合计 + 调整净额 − 优惠合计。根据客源单实时统计，无需提交应收。',
  成本合计:
    '本团当前需要承担的全部成本。计算：各项资源成本合计。根据资源安排实时统计，无需提交应付。',
  当前毛利:
    '本团当前预计经营毛利。计算：结算应收 − 成本合计。根据客源团款与资源成本实时统计，不表示现金结果。',
  毛利率:
    '本团当前毛利占结算应收的比例。计算：当前毛利 ÷ 结算应收 × 100%。根据当前毛利和结算应收实时统计；',
  增收净收益:
    '本团增收记录的公司增收合计（增收金额 − 导游提成）。独立于其他应收、团款收款进度与当前毛利；不从收支流水推导；明细在「增收记录」页签。',
  团款收款进度:
    '本团结算金额的收回进度。计算：团款已收 ÷ 各单结算金额合计 × 100%。单笔团款已收 = min(游客代收已收, 结算金额) + 客户补款已收；代收溢价与返利不计入。',
  游客代收进度:
    '本团游客代收账单的收回进度。计算：游客代收已收 ÷ 各单 G约定（定金+尾款）× 100%。已收仅统计定金代收/尾款代收节点的有效核销。',
  返利:
    '本团应付给发客合作方的返利。预估按各单 max(0, G约定−结算金额)；已确认/已付/未付来自游客代收齐账后自动落账的返利应付节点。返利不计入团款收款进度。',
  资源付款:
    '本团资源成本的实际支付进度。计算：已付金额 ÷ 成本合计 × 100%。已付仅统计资源应付的有效核销；手工应付与返利应付等不计入本进度。',
  现金净流入:
    '本团当前实际发生的资金收支情况。计算：现金净流入 = 有效收入 − 有效支出。根据已关联本团的未作废收支流水实时统计。',
} as const

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
  /** First overview visit in session: card enter + progress reveal. */
  animateEnter?: boolean
}

interface AmountDetailProps {
  label: string
  amountCents: number
  danger?: boolean
  /** 待提交缺口等提醒项：金额用系统 warning（#FAAD14 / token.colorWarning） */
  warning?: boolean
  transactionLink?: {
    departureId: string
    direction: TransactionDirection
  }
}

function AmountDetail({
  label,
  amountCents,
  danger = false,
  warning = false,
  transactionLink,
}: AmountDetailProps) {
  const { token } = theme.useToken()
  if (amountCents === 0) {
    return null
  }

  return (
    <Flex justify="space-between" gap={8} wrap>
      <Text
        type={danger ? 'danger' : warning ? undefined : 'secondary'}
        style={warning ? { color: token.colorWarning } : undefined}
      >
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

function CalculationTitle({
  label,
  description,
  asHeading = false,
}: {
  label: string
  description: string
  /** 进度区小节标题用 h5，统计卡标题保持普通文案 */
  asHeading?: boolean
}) {
  const infoButton = (
    <Tooltip title={description} styles={{ root: { maxWidth: 420 } }}>
      <Button
        type="text"
        size="small"
        className={styles.calcInfoButton}
        icon={<InfoCircleOutlined />}
        aria-label={`查看${label}说明`}
        style={{ width: 24, minWidth: 24, height: 24, padding: 0 }}
      />
    </Tooltip>
  )

  const content = (
    <Flex component="span" align="center" gap={2}>
      <span>{label}</span>
      {infoButton}
    </Flex>
  )

  if (asHeading) {
    return (
      <Title level={5} style={{ margin: 0 }}>
        {content}
      </Title>
    )
  }

  return content
}

function ProgressValue({
  numerator,
  denominator,
  animate,
}: {
  numerator: number
  denominator: number
  animate: boolean
}) {
  const hasData = denominator !== 0
  const actualPercent = hasData ? (numerator / denominator) * 100 : 0
  const visualPercent = Math.min(100, Math.max(0, actualPercent))

  if (!hasData) {
    return <Text strong>暂无数据</Text>
  }

  return (
    <Flex align="center" gap={12}>
      <Progress
        className={animate ? styles.progressLoad : undefined}
        percent={visualPercent}
        showInfo={false}
        style={{ flex: 1 }}
      />
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

function SummaryCard({
  title,
  value,
  suffix,
  equationDescription,
  entry,
  animateEnter = false,
}: {
  title: string
  value: string | number
  suffix?: string
  equationDescription?: string
  /** 卡片右上角的明细入口图标按钮 */
  entry?: React.ReactNode
  animateEnter?: boolean
}) {
  const titleNode = equationDescription ? (
    <CalculationTitle label={title} description={equationDescription} />
  ) : (
    <span>{title}</span>
  )

  return (
    <Card
      className={animateEnter ? styles.metricCardEnter : undefined}
      style={EQUAL_HEIGHT_CARD_STYLE}
    >
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
  const copy = formatReceivableBalanceAnomalyCopy(anomaly)
  return (
    <Alert
      type="error"
      showIcon
      title={copy.title}
      description={copy.description}
      style={{ marginTop: 12 }}
    />
  )
}

interface OverviewSectionProps {
  departure: DepartureDetail
  animateEnter: boolean
}

function OverviewSummaryRows({ departure, animateEnter }: OverviewSectionProps) {
  const stats = departure.overviewStats
  const hasCostDetails =
    stats.confirmedPayableCents !== 0 ||
    stats.ungeneratedPayableCents !== 0 ||
    stats.otherPayableCents !== 0 ||
    stats.resourcePayableDifferenceCents !== 0
  const marginRateLabel = formatPercent(departure.estimatedMarginCents, departure.netReceivableCents)

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]} className={styles.firstRow}>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="总人数"
            value={departure.totalGuests}
            suffix="人"
            animateEnter={animateEnter}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="结算应收"
            value={formatCents(departure.netReceivableCents)}
            equationDescription={CALCULATION_GUIDE.结算应收}
            animateEnter={animateEnter}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="成本合计"
            value={formatCents(departure.payableCents)}
            equationDescription={CALCULATION_GUIDE.成本合计}
            animateEnter={animateEnter}
            entry={
              hasCostDetails ? (
                <OverviewDetailsPopover title="成本组成" buttonLabel="查看成本组成">
                  <AmountDetail label="确认应付" amountCents={stats.confirmedPayableCents} />
                  <AmountDetail label="尚未提交应付" amountCents={stats.ungeneratedPayableCents} warning />
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
            equationDescription={CALCULATION_GUIDE.当前毛利}
            animateEnter={animateEnter}
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

      <Row gutter={[16, 16]} className={styles.secondRow}>
        <Col xs={24}>
          <Card
            title="经营构成"
            role="group"
            aria-label="经营构成"
            className={animateEnter ? styles.metricCardEnter : undefined}
          >
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Statistic title="原始团款" value={formatCents(departure.grossReceivableCents)} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="优惠合计" value={formatCents(departure.discountCents)} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title={
                    <CalculationTitle label="毛利率" description={CALCULATION_GUIDE.毛利率} />
                  }
                  value={marginRateLabel ?? '暂无数据'}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title={
                    <CalculationTitle
                      label="增收净收益"
                      description={CALCULATION_GUIDE.增收净收益}
                    />
                  }
                  value={formatCents(stats.additionalIncomeNetCents)}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Space>
  )
}

function PaymentAndCashRow({ departure, animateEnter }: OverviewSectionProps) {
  const { token } = theme.useToken()
  const stats = departure.overviewStats
  const settlementReceivableCents = stats.settlementCollectionReceivableCents
  const settlementReceivedCents = stats.settlementCollectionReceivedCents
  const settlementUnreceivedCents = settlementReceivableCents - settlementReceivedCents
  const guestCollectionUnreceivedCents =
    stats.guestCollectionAgreedCents - stats.guestCollectionReceivedCents
  const hasRebateDetails =
    stats.estimatedRebateCents !== 0 ||
    stats.confirmedRebateCents !== 0 ||
    stats.rebatePaidCents !== 0 ||
    stats.rebateUnpaidCents !== 0
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
  const allPayableProgressLabel = formatPercent(stats.paidCents, stats.confirmedPayableCents)
  const receivableAnomaly = stats.anomalies.find(({ code }) => code === 'receivable_balance')
  const collectionCardStyle = receivableAnomaly
    ? { ...EQUAL_HEIGHT_CARD_STYLE, borderColor: token.colorError }
    : EQUAL_HEIGHT_CARD_STYLE

  return (
    <Row gutter={[16, 16]} className={styles.thirdRow}>
      <Col xs={24} lg={8}>
        <Card
          title="收款"
          role="region"
          aria-label="收款"
          className={animateEnter ? styles.metricCardEnter : undefined}
          style={collectionCardStyle}
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <div
              className={styles.progressSection}
              role="group"
              aria-label={receivableAnomaly ? '团款收款进度（数据异常）' : '团款收款进度'}
            >
              <Flex align="center" justify="space-between" gap={8}>
                <CalculationTitle
                  label="团款收款进度"
                  description={CALCULATION_GUIDE.团款收款进度}
                  asHeading
                />
                {hasReceivableDetails ? (
                  <OverviewDetailsPopover title="收款组成" buttonLabel="查看收款组成">
                    <AmountDetail
                      label="尚未提交应收"
                      amountCents={stats.ungeneratedReceivableCents}
                      warning
                    />
                    <AmountDetail
                      label="其中已关闭未收"
                      amountCents={stats.closedUnreceivedCents}
                      danger
                    />
                    <AmountDetail label="其他应收" amountCents={stats.otherReceivableCents} />
                  </OverviewDetailsPopover>
                ) : null}
              </Flex>
              <ProgressValue
                numerator={settlementReceivedCents}
                denominator={settlementReceivableCents}
                animate={animateEnter}
              />
              <ProgressBreakdown
                items={[
                  { label: '已收', amountCents: settlementReceivedCents },
                  { label: '未收', amountCents: settlementUnreceivedCents },
                ]}
              />
              {receivableAnomaly ? <ReceivableAnomalyAlert anomaly={receivableAnomaly} /> : null}
            </div>

            <div className={styles.progressSection} role="group" aria-label="游客代收进度">
              <CalculationTitle
                label="游客代收进度"
                description={CALCULATION_GUIDE.游客代收进度}
                asHeading
              />
              <ProgressValue
                numerator={stats.guestCollectionReceivedCents}
                denominator={stats.guestCollectionAgreedCents}
                animate={animateEnter}
              />
              <ProgressBreakdown
                items={[
                  { label: '已收', amountCents: stats.guestCollectionReceivedCents },
                  { label: '未收', amountCents: guestCollectionUnreceivedCents },
                ]}
              />
            </div>
          </Space>
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        <Card
          title="付款"
          role="region"
          aria-label="付款"
          className={animateEnter ? styles.metricCardEnter : undefined}
          style={EQUAL_HEIGHT_CARD_STYLE}
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <div className={styles.progressSection} role="group" aria-label="资源付款">
              <Flex align="center" justify="space-between" gap={8}>
                <CalculationTitle
                  label="资源付款"
                  description={CALCULATION_GUIDE.资源付款}
                  asHeading
                />
                {hasPaymentDetails ? (
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
                ) : null}
              </Flex>
              <ProgressValue
                numerator={stats.resourcePaidCents}
                denominator={departure.payableCents}
                animate={animateEnter}
              />
              <ProgressBreakdown
                items={[
                  { label: '已付', amountCents: stats.resourcePaidCents },
                  { label: '未付', amountCents: departure.payableCents - stats.resourcePaidCents },
                ]}
              />
            </div>

            <div className={styles.progressSection} role="group" aria-label="返利">
              <CalculationTitle label="返利" description={CALCULATION_GUIDE.返利} asHeading />
              {hasRebateDetails ? (
                <ProgressBreakdown
                  items={[
                    { label: '预估', amountCents: stats.estimatedRebateCents },
                    { label: '已确认', amountCents: stats.confirmedRebateCents },
                    { label: '已付', amountCents: stats.rebatePaidCents },
                    { label: '未付', amountCents: stats.rebateUnpaidCents },
                  ]}
                />
              ) : (
                <Text strong>暂无数据</Text>
              )}
            </div>
          </Space>
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        <Card
          title="现金"
          role="region"
          aria-label="现金"
          className={animateEnter ? styles.metricCardEnter : undefined}
          style={EQUAL_HEIGHT_CARD_STYLE}
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
        >
          <Flex align="center" justify="space-between" gap={16} wrap>
            <Statistic
              title={
                <CalculationTitle
                  label="现金净流入"
                  description={CALCULATION_GUIDE.现金净流入}
                />
              }
              value={formatCents(stats.cashNetInflowCents)}
            />
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
  )
}

export function DepartureOverviewStatsCards({
  departure,
  animateEnter = false,
}: DepartureOverviewStatsCardsProps) {
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <OverviewSummaryRows departure={departure} animateEnter={animateEnter} />
      <PaymentAndCashRow departure={departure} animateEnter={animateEnter} />
    </Space>
  )
}
