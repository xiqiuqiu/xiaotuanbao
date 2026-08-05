import { Link } from '@tanstack/react-router'
import {
  Alert,
  Button,
  Card,
  Flex,
  Popover,
  Progress,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  InfoCircleOutlined,
  RightOutlined,
} from '@ant-design/icons'
import type { DepartureDetail, DepartureOverviewAnomaly } from '@xiaotuanbao/shared'
import { formatCents as formatUnsignedCents } from '../catalog'
import {
  buildDepartureOverviewViewModel,
  type DepartureOverviewViewModel,
} from '../utils/departure-overview-view-model'
import { formatReceivableBalanceAnomalyCopy } from '../utils/format-receivable-balance-anomaly'
import { RECEIVABLE_SETTLEMENT_CALCULATION_GUIDE as CALCULATION_GUIDE } from '../utils/receivable-settlement-metrics.copy'
import styles from './DepartureOverviewStatsCards.module.css'

const { Text, Title } = Typography

function formatCents(cents: number): string {
  return cents < 0 ? `-${formatUnsignedCents(Math.abs(cents))}` : formatUnsignedCents(cents)
}

type CompositionDetailItem = { label: string; value: string }

function buildCompositionDetails(vm: DepartureOverviewViewModel) {
  return {
    settlement: [
      { label: '原始团款', value: formatCents(vm.income.grossReceivableCents) },
      { label: '优惠合计', value: formatCents(vm.income.discountCents) },
      { label: '团款调整', value: formatCents(vm.income.fareAdjustmentNetCents) },
    ],
    additional: [
      { label: '增收收入', value: formatCents(vm.income.additionalGrossCents) },
      { label: '增收支出', value: formatCents(vm.income.additionalExpenseCents) },
    ],
    revenue: [
      { label: '结算应收', value: formatCents(vm.income.settlementReceivableCents) },
      { label: '增收净收益', value: formatCents(vm.income.additionalNetCents) },
    ],
    cost: [
      { label: '资源成本', value: formatCents(vm.cost.resourceCostCents) },
      { label: '拼出成本', value: formatCents(vm.cost.outsourceCostCents) },
    ],
  }
}

interface DepartureOverviewStatsCardsProps {
  departure: DepartureDetail
  /** First overview visit in session: card enter + progress reveal. */
  animateEnter?: boolean
}

function SectionShell({
  title,
  children,
  className,
  animateEnter = false,
}: {
  title: string
  children: React.ReactNode
  className?: string
  animateEnter?: boolean
}) {
  return (
    <Card
      className={[
        styles.sectionCard,
        animateEnter ? styles.sectionCardEnter : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      styles={{ body: { padding: '14px 16px' } }}
    >
      <Flex justify="space-between" align="center" gap={12} className={styles.sectionHeader}>
        <Title level={5} className={styles.sectionTitle}>
          {title}
        </Title>
      </Flex>
      {children}
    </Card>
  )
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" gap={12} className={styles.metricLineAux}>
      <Text type="secondary">{label}</Text>
      <Text>{value}</Text>
    </Flex>
  )
}

function CompositionDetailsPopover({
  title,
  buttonLabel,
  items,
}: {
  title: string
  buttonLabel: string
  items: CompositionDetailItem[]
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={title}
      content={
        <div className={styles.compositionPopover}>
          {items.map((item) => (
            <MetricLine key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      }
    >
      <Button
        type="text"
        size="small"
        icon={<InfoCircleOutlined />}
        aria-label={buttonLabel}
        className={styles.compositionDetailIcon}
      />
    </Popover>
  )
}

function CompositionMetricCell({
  label,
  value,
  popoverTitle,
  popoverLabel,
  details = [],
  total = false,
  featured = false,
  hint,
  valueHint,
}: {
  label: string
  value: string
  popoverTitle?: string
  popoverLabel?: string
  details?: CompositionDetailItem[]
  total?: boolean
  featured?: boolean
  hint?: string
  valueHint?: string
}) {
  const { token } = theme.useToken()
  const labelNode = hint ? (
    <Tooltip title={hint}>
      <Text type="secondary" className={styles.compositionStripLabelHint}>
        {label}
      </Text>
    </Tooltip>
  ) : (
    <Text type="secondary" className={styles.compositionStripLabel}>
      {label}
    </Text>
  )

  const cellClass = featured
    ? styles.compositionStripCellFeatured
    : total
      ? styles.compositionStripCellTotal
      : styles.compositionStripCell

  return (
    <div
      className={cellClass}
      style={
        featured
          ? {
              borderColor: token.colorPrimaryBorder,
              background: token.colorPrimaryBg,
            }
          : undefined
      }
    >
      <Flex justify="space-between" align="center" gap={4} className={styles.compositionStripHead}>
        {labelNode}
        {details.length > 0 && popoverTitle && popoverLabel ? (
          <CompositionDetailsPopover
            title={popoverTitle}
            buttonLabel={popoverLabel}
            items={details}
          />
        ) : null}
      </Flex>
      <Text
        strong
        className={featured ? styles.compositionStripValueFeatured : styles.compositionStripValue}
      >
        {value}
      </Text>
      {valueHint ? (
        <Text
          type="secondary"
          className={styles.compositionStripValueHint}
          style={{ color: token.colorPrimary }}
        >
          {valueHint}
        </Text>
      ) : null}
    </div>
  )
}

function TodoReminderSection({
  vm,
  animateEnter,
}: {
  vm: DepartureOverviewViewModel
  animateEnter: boolean
}) {
  const { token } = theme.useToken()

  return (
    <SectionShell title="待办提醒" animateEnter={animateEnter}>
      <div className={styles.todoBoard}>
        {vm.todos.map((todo) => {
          const hasIssue = todo.count > 0
          return (
            <Link
              key={todo.key}
              to="/departure/$departureId"
              params={{ departureId: vm.departureId }}
              search={{ tab: todo.tab }}
              className={styles.todoLink}
            >
              <div
                className={hasIssue ? styles.todoChipWarn : styles.todoChipOk}
                style={
                  hasIssue
                    ? {
                        borderColor: token.colorWarningBorder,
                        background: token.colorWarningBg,
                      }
                    : undefined
                }
              >
                <Flex
                  justify="space-between"
                  align="flex-start"
                  gap={8}
                  className={styles.todoBoardHead}
                >
                  <Flex align="center" gap={6} className={styles.todoTileHead}>
                    {hasIssue ? (
                      <ExclamationCircleFilled
                        className={styles.todoChipIcon}
                        style={{ color: token.colorWarning }}
                      />
                    ) : (
                      <CheckCircleFilled
                        className={styles.todoChipIcon}
                        style={{ color: token.colorSuccess }}
                      />
                    )}
                    <Text type="secondary" className={styles.todoChipLabel}>
                      {todo.label}
                    </Text>
                  </Flex>
                  <RightOutlined className={styles.todoChipArrow} />
                </Flex>
                <Text
                  strong
                  className={styles.todoBoardValue}
                  style={hasIssue ? { color: token.colorWarning } : undefined}
                >
                  {hasIssue ? todo.detail : '正常'}
                </Text>
              </div>
            </Link>
          )
        })}
      </div>
    </SectionShell>
  )
}

function BusinessMetricsStrip({ vm }: { vm: DepartureOverviewViewModel }) {
  const details = buildCompositionDetails(vm)

  return (
    <div className={styles.compositionMetricStrip}>
      <CompositionMetricCell
        label="结算应收"
        value={formatCents(vm.income.settlementReceivableCents)}
        popoverTitle="团款组成"
        popoverLabel="查看团款组成"
        details={details.settlement}
        hint={CALCULATION_GUIDE.结算应收简}
      />
      <CompositionMetricCell
        label="增收净收益"
        value={formatCents(vm.income.additionalNetCents)}
        popoverTitle="增收组成"
        popoverLabel="查看增收组成"
        details={details.additional}
      />
      <CompositionMetricCell
        label="收入合计"
        value={formatCents(vm.income.revenueTotalCents)}
        popoverTitle="收入组成"
        popoverLabel="查看收入组成"
        details={details.revenue}
        total
        hint={CALCULATION_GUIDE.收入合计简}
      />
      <div className={styles.compositionStripDivider} aria-hidden />
      <CompositionMetricCell
        label="成本合计"
        value={formatCents(vm.cost.costTotalCents)}
        popoverTitle="成本组成"
        popoverLabel="查看成本组成"
        details={details.cost}
        total
      />
      <CompositionMetricCell
        label="当前毛利"
        value={formatCents(vm.margin.currentMarginCents)}
        featured
        hint={CALCULATION_GUIDE.当前毛利简}
        valueHint={vm.margin.marginRate ? `毛利率 ${vm.margin.marginRate}` : undefined}
      />
    </div>
  )
}

function shortenProgressLabel(label: string): string {
  return label.replace('合计', '').replace('金额', '')
}

function ProgressAmountStrip({ rows }: { rows: { label: string; amountCents: number }[] }) {
  const { token } = theme.useToken()

  return (
    <div className={styles.progressAmountInline}>
      {rows.map((row, index) => {
        const isOutstanding = row.label.includes('未收') || row.label.includes('未付')
        const highlight = isOutstanding && row.amountCents > 0
        return (
          <Flex key={row.label} align="center" gap={0} className={styles.progressAmountItemWrap}>
            {index > 0 ? (
              <Text type="secondary" className={styles.progressAmountSep}>
                ·
              </Text>
            ) : null}
            <span className={styles.progressAmountItem}>
              <Text type="secondary">{shortenProgressLabel(row.label)}</Text>
              <Text strong style={highlight ? { color: token.colorWarning } : undefined}>
                {formatCents(row.amountCents)}
              </Text>
            </span>
          </Flex>
        )
      })}
    </div>
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
      style={{ marginTop: 4 }}
    />
  )
}

function ProgressPanel({
  title,
  progress,
  rows,
  hints,
  variant,
  anomaly,
  animateEnter,
}: {
  title: string
  progress: string | null
  rows: { label: string; amountCents: number }[]
  hints?: { label: string; amountCents: number }[]
  variant: 'collection' | 'payment'
  anomaly?: DepartureOverviewAnomaly
  animateEnter: boolean
}) {
  const { token } = theme.useToken()
  const visualPercent = progress != null ? Math.min(100, Math.max(0, parseFloat(progress))) : 0
  const complete = visualPercent >= 100
  const panelClass = `${styles.progressPanel} ${
    variant === 'collection' ? styles.progressPanelCollection : styles.progressPanelPayment
  }`

  const percentTone =
    variant === 'collection'
      ? complete
        ? { color: token.colorSuccess, background: token.colorSuccessBg }
        : { color: token.colorPrimary, background: token.colorPrimaryBg }
      : complete
        ? { color: token.colorSuccess, background: token.colorSuccessBg }
        : { color: token.colorTextSecondary, background: token.colorFillQuaternary }

  return (
    <div className={panelClass} role="region" aria-label={title}>
      <Flex justify="space-between" align="center" gap={8} className={styles.progressHead}>
        <Text strong className={styles.progressTitle}>
          {title}
        </Text>
        <Text strong className={styles.progressPercentBadge} style={percentTone}>
          {progress ?? '暂无数据'}
        </Text>
      </Flex>
      <div className={styles.progressBarWrap}>
        <Progress
          percent={visualPercent}
          showInfo={false}
          strokeColor={
            complete
              ? token.colorSuccess
              : variant === 'payment' && visualPercent === 0
                ? token.colorTextQuaternary
                : token.colorPrimary
          }
          railColor={token.colorFillSecondary}
          className={animateEnter ? `${styles.progressBar} ${styles.progressLoad}` : styles.progressBar}
          strokeLinecap="round"
        />
      </div>
      <div className={styles.progressAmountMeta}>
        <ProgressAmountStrip rows={rows} />
      </div>
      {hints && hints.length > 0 ? (
        <Flex vertical gap={6} className={styles.collectionHints}>
          {hints.map((hint) => (
            <Flex
              key={hint.label}
              align="center"
              gap={8}
              className={styles.collectionHintItem}
              style={{
                borderColor: token.colorWarningBorder,
                background: token.colorWarningBg,
              }}
            >
              <ExclamationCircleFilled style={{ color: token.colorWarning }} />
              <Text>
                {hint.label}{' '}
                <Text strong style={{ color: token.colorWarning }}>
                  {formatCents(hint.amountCents)}
                </Text>
              </Text>
            </Flex>
          ))}
        </Flex>
      ) : null}
      {anomaly ? <ReceivableAnomalyAlert anomaly={anomaly} /> : null}
    </div>
  )
}

function BusinessAndPaymentSection({
  vm,
  animateEnter,
}: {
  vm: DepartureOverviewViewModel
  animateEnter: boolean
}) {
  return (
    <SectionShell title="经营概况" animateEnter={animateEnter} className={styles.businessSection}>
      <BusinessMetricsStrip vm={vm} />
      <div className={styles.businessPaymentDivider} />
      <Text type="secondary" className={styles.progressSectionLabel}>
        收付款进度
      </Text>
      <div className={styles.progressSection}>
        <ProgressPanel
          variant="collection"
          title="收款进度"
          progress={vm.collection.progress}
          rows={[
            { label: '应收合计', amountCents: vm.collection.totalCents },
            { label: '已收金额', amountCents: vm.collection.receivedCents },
            { label: '未收金额', amountCents: vm.collection.unreceivedCents },
          ]}
          hints={vm.collection.hints}
          anomaly={vm.receivableAnomaly}
          animateEnter={animateEnter}
        />
        <ProgressPanel
          variant="payment"
          title="付款进度"
          progress={vm.payment.progress}
          rows={[
            { label: '应付合计', amountCents: vm.payment.totalCents },
            { label: '已付金额', amountCents: vm.payment.paidCents },
            { label: '未付金额', amountCents: vm.payment.unpaidCents },
          ]}
          animateEnter={animateEnter}
        />
      </div>
    </SectionShell>
  )
}

export function DepartureOverviewStatsCards({
  departure,
  animateEnter = false,
}: DepartureOverviewStatsCardsProps) {
  const vm = buildDepartureOverviewViewModel(departure)

  return (
    <Flex vertical gap={12} className={styles.layoutRoot}>
      <TodoReminderSection vm={vm} animateEnter={animateEnter} />
      <BusinessAndPaymentSection vm={vm} animateEnter={animateEnter} />
    </Flex>
  )
}
