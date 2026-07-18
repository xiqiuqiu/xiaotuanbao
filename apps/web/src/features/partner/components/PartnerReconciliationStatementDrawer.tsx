import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Row,
  Space,
  Statistic,
  Table,
  Typography,
  message,
  theme,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import { PARTNER_RECONCILIATION_CONFIRMATION_NOTES } from '@xiaotuanbao/shared'
import type {
  PartnerReconciliationStatementRow,
  PartnerReconciliationStatementSnapshot,
  PartnerSummary,
} from '@/types/api'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import {
  downloadPartnerReconciliationStatement,
  getPartnerReconciliationStatement,
} from '@/services/source-order.service'
import { formatCents } from '@/features/departure/catalog'

type StatementPeriod = [string, string] | null

/** 预览与导出物同构：对外整套使用客户习惯名（豁免仅限确认单，见 CONTEXT.md）。 */
const DETAIL_COLUMNS: ColumnsType<PartnerReconciliationStatementRow> = [
  {
    title: '序号',
    key: 'sequence',
    width: 56,
    align: 'center',
    render: (_: unknown, _record, index) => index + 1,
  },
  { title: '出团日期', dataIndex: 'departureDate', width: 110 },
  { title: '团单编号', dataIndex: 'departureNo', width: 150 },
  {
    title: '线路/团单名称',
    dataIndex: 'routeName',
    width: 180,
    ellipsis: { showTitle: false },
    render: (value: string) => <EllipsisTooltipText empty="">{value}</EllipsisTooltipText>,
  },
  // 游客代表/联系电话：名单空则留空（#112 决议），与导出物同构，不显示占位符
  {
    title: '游客代表',
    dataIndex: 'guestRepresentativeName',
    width: 100,
    ellipsis: { showTitle: false },
    render: (value: string | null) => (
      <EllipsisTooltipText empty="">{value}</EllipsisTooltipText>
    ),
  },
  {
    title: '联系电话',
    dataIndex: 'guestRepresentativePhone',
    width: 130,
    ellipsis: { showTitle: false },
    render: (value: string | null) => (
      <EllipsisTooltipText empty="">{value}</EllipsisTooltipText>
    ),
  },
  { title: '成人', dataIndex: 'adultGuestCount', width: 60, align: 'center' },
  { title: '儿童', dataIndex: 'childGuestCount', width: 60, align: 'center' },
  { title: '合计', dataIndex: 'totalGuestCount', width: 60, align: 'center' },
  {
    title: '拼入单价（成人）',
    dataIndex: 'adultUnitPriceCents',
    width: 130,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '拼入单价（儿童）',
    key: 'childUnitPrice',
    width: 130,
    align: 'right',
    render: (_: unknown, record) =>
      record.childGuestCount > 0 ? formatCents(record.childUnitPriceCents) : '-',
  },
  {
    title: '原始应收（拼入合计）',
    dataIndex: 'originalReceivableCents',
    width: 150,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '优惠金额',
    dataIndex: 'discountCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '实际应收',
    dataIndex: 'actualReceivableCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '客户已收押金',
    dataIndex: 'customerDepositCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '游客代收',
    dataIndex: 'guestCollectCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '备注',
    dataIndex: 'notes',
    width: 160,
    ellipsis: { showTitle: false },
    render: (value: string | null) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
  },
]

interface PartnerReconciliationStatementDrawerProps {
  open: boolean
  partner: PartnerSummary
  /** 对账周期预填当前筛选区间；不限时间时传 null，引导先选区间 */
  initialPeriod: StatementPeriod
  onClose: () => void
}

export function PartnerReconciliationStatementDrawer({
  open,
  partner,
  initialPeriod,
  onClose,
}: PartnerReconciliationStatementDrawerProps) {
  const [period, setPeriod] = useState<StatementPeriod>(initialPeriod)
  const [exporting, setExporting] = useState(false)

  // 每次打开重新预填当前筛选区间（不限时间时为 null，引导先选区间）
  useEffect(() => {
    if (open) {
      setPeriod(initialPeriod)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const hasPeriod = Boolean(period?.[0] && period?.[1])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['partner-reconciliation-statement', partner.id, period],
    queryFn: () =>
      getPartnerReconciliationStatement(partner.id, {
        periodStart: period![0],
        periodEnd: period![1],
      }),
    enabled: open && hasPeriod,
  })

  async function handleExport() {
    if (!period) {
      return
    }
    setExporting(true)
    try {
      await downloadPartnerReconciliationStatement(partner.id, {
        periodStart: period[0],
        periodEnd: period[1],
      })
      message.success('已开始下载 Excel')
    } catch {
      // downloadBinary 已提示错误
    } finally {
      setExporting(false)
    }
  }

  return (
    <Drawer
      title="往来账确认单"
      placement="right"
      width="min(1080px, 100vw)"
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button
          type="primary"
          loading={exporting}
          disabled={!hasPeriod || !data || isError}
          onClick={handleExport}
        >
          导出 Excel
        </Button>
      }
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Flex align="center" gap={12} wrap>
          <Typography.Text>对账周期（按出团日期）</Typography.Text>
          <DatePicker.RangePicker
            allowClear={false}
            value={period ? [dayjs(period[0]), dayjs(period[1])] : null}
            onChange={(values) => {
              if (values?.[0] && values[1]) {
                setPeriod([values[0].format('YYYY-MM-DD'), values[1].format('YYYY-MM-DD')])
              }
            }}
          />
        </Flex>

        {!hasPeriod ? (
          <Alert
            type="info"
            showIcon
            title="请先选择对账周期"
            description="确认单标题与行范围由对账周期（所属发团出团日期区间）生成，选择后即可预览并导出。"
          />
        ) : null}

        {isError ? (
          <Alert
            type="error"
            showIcon
            title="加载失败"
            description={error instanceof Error ? error.message : '无法加载往来账确认单'}
          />
        ) : null}

        {hasPeriod && !isLoading && !isError && data && data.rows.length === 0 ? (
          <Empty description="该周期内暂无客源团单，可调整对账周期" />
        ) : null}

        {hasPeriod && !isError ? (
          <StatementPreview snapshot={data} loading={isLoading} />
        ) : null}
      </Space>
    </Drawer>
  )
}

function StatementPreview({
  snapshot,
  loading,
}: {
  snapshot: PartnerReconciliationStatementSnapshot | undefined
  loading: boolean
}) {
  const { token } = theme.useToken()
  // 单据页边框：与抽屉工作面区分，形成「一页确认单」的阅读边界（DESIGN：色面 + 细边框）
  const pageStyle = {
    width: '100%',
    padding: token.paddingLG,
    background: token.colorBgContainer,
    border: `1px solid ${token.colorBorder}`,
    borderRadius: token.borderRadiusLG,
  } as const

  if (!snapshot) {
    return (
      <div style={pageStyle}>
        <Table
          rowKey="sourceOrderId"
          loading={loading}
          columns={DETAIL_COLUMNS}
          dataSource={[]}
          pagination={false}
        />
      </div>
    )
  }

  const { totals } = snapshot

  return (
    <div style={pageStyle}>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            {snapshot.title}
          </Typography.Title>
          <Typography.Text type="secondary">
            合作方：{snapshot.partnerName}　对账周期：{snapshot.periodStart} 至{' '}
            {snapshot.periodEnd}（按出团日期）　导出时间：
            {dayjs(snapshot.exportedAt).format('YYYY-MM-DD HH:mm')}
          </Typography.Text>
        </div>

        <Row gutter={[16, 16]} role="group" aria-label="确认单汇总">
          <Col xs={12} sm={8} xl={4}>
            <Statistic title="客源单数" value={totals.orderCount} />
          </Col>
          <Col xs={12} sm={8} xl={4}>
            <Statistic title="总人数" value={totals.totalGuestCount} />
          </Col>
          <Col xs={12} sm={8} xl={4}>
            <Statistic title="拼入合计" value={formatCents(totals.originalReceivableCents)} />
          </Col>
          <Col xs={12} sm={8} xl={4}>
            <Statistic title="优惠合计" value={formatCents(totals.discountCents)} />
          </Col>
          <Col xs={12} sm={8} xl={4}>
            <Statistic title="实际应收" value={formatCents(totals.actualReceivableCents)} />
          </Col>
          <Col xs={12} sm={8} xl={4}>
            <Statistic title="游客代收" value={formatCents(totals.guestCollectCents)} />
          </Col>
        </Row>

        <Table
          rowKey="sourceOrderId"
          size="small"
          loading={loading}
          columns={DETAIL_COLUMNS}
          dataSource={snapshot.rows}
          pagination={false}
          scroll={{ x: 1900 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={6}>
                <Typography.Text strong>合计</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="center">
                <Typography.Text strong>{totals.adultGuestCount}</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="center">
                <Typography.Text strong>{totals.childGuestCount}</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={8} align="center">
                <Typography.Text strong>{totals.totalGuestCount}</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={9} colSpan={2} />
              <Table.Summary.Cell index={11} align="right">
                <Typography.Text strong>
                  {formatCents(totals.originalReceivableCents)}
                </Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={12} align="right">
                <Typography.Text strong>{formatCents(totals.discountCents)}</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={13} align="right">
                <Typography.Text strong>
                  {formatCents(totals.actualReceivableCents)}
                </Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={14} align="right">
                <Typography.Text strong>
                  {formatCents(totals.customerDepositCents)}
                </Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={15} align="right">
                <Typography.Text strong>{formatCents(totals.guestCollectCents)}</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={16} />
            </Table.Summary.Row>
          )}
        />

        <div>
          <Typography.Text strong>确认说明</Typography.Text>
          <div>
            {PARTNER_RECONCILIATION_CONFIRMATION_NOTES.map((line) => (
              <Typography.Paragraph key={line} type="secondary" style={{ marginBottom: 4 }}>
                {line}
              </Typography.Paragraph>
            ))}
          </div>
        </div>

        <Row gutter={[24, 16]}>
          <Col xs={24} md={12}>
            <Space orientation="vertical" size={4}>
              <Typography.Text strong>我方确认（盖章）：{snapshot.organizationName}</Typography.Text>
              <Typography.Text type="secondary">确认人：____________</Typography.Text>
              <Typography.Text type="secondary">确认日期：____年__月__日</Typography.Text>
            </Space>
          </Col>
          <Col xs={24} md={12}>
            <Space orientation="vertical" size={4}>
              <Typography.Text strong>客户确认（盖章）：{snapshot.partnerName}</Typography.Text>
              <Typography.Text type="secondary">确认人：____________</Typography.Text>
              <Typography.Text type="secondary">确认日期：____年__月__日</Typography.Text>
            </Space>
          </Col>
        </Row>
      </Space>
    </div>
  )
}
