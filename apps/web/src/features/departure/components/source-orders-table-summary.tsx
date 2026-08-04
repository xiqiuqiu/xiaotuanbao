import { Table, Typography, theme } from 'antd'
import type { SourceOrderSummary } from '@/types/api'
import { formatCents } from '../catalog'
import {
  buildSourceOrdersListGlance,
  type SourceOrdersTableTotals,
} from '../utils/source-orders-settlement-glance'

export type { SourceOrdersTableTotals }

/** @deprecated Prefer `buildSourceOrdersListGlance(orders).tableTotals`. */
export function aggregateSourceOrdersTableTotals(
  pageData: readonly SourceOrderSummary[],
): SourceOrdersTableTotals {
  return buildSourceOrdersListGlance(pageData).tableTotals
}

function SummaryAmount({ value }: { value: number }) {
  return (
    <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
      {formatCents(value)}
    </Typography.Text>
  )
}

function SourceOrdersTableSummaryRow({ pageData }: { pageData: readonly SourceOrderSummary[] }) {
  const { token } = theme.useToken()
  const totals = buildSourceOrdersListGlance(pageData).tableTotals

  return (
    <Table.Summary fixed>
      <Table.Summary.Row style={{ background: token.colorFillAlter }}>
        <Table.Summary.Cell index={0}>
          <Typography.Text strong>合计</Typography.Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={1}>
          <Typography.Text strong>{totals.guestCount}</Typography.Text>
        </Table.Summary.Cell>
        {/* 客人名单 */}
        <Table.Summary.Cell index={2} />
        {/* 收款方式 */}
        <Table.Summary.Cell index={3} />
        <Table.Summary.Cell index={4} align="right">
          <SummaryAmount value={totals.grossReceivableCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={5} align="right">
          <SummaryAmount value={totals.fareAdjustmentNetCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={6} align="right">
          <SummaryAmount value={totals.discountCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={7} align="right">
          <SummaryAmount value={totals.netReceivableCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={8} align="right">
          <SummaryAmount value={totals.partnerCollectedCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={9} align="right">
          <SummaryAmount value={totals.guestCollectCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={10} align="right">
          <SummaryAmount value={totals.rebateDisplayCents} />
        </Table.Summary.Cell>
        {/* 应收状态～更新时间：无合计语义；操作列单独占位以对齐 fixed 列 */}
        <Table.Summary.Cell index={11} colSpan={5} />
        <Table.Summary.Cell index={16} />
      </Table.Summary.Row>
    </Table.Summary>
  )
}

/** Ant Design Table `summary` renderer; column indices match `buildSourceOrdersColumns`. */
export function renderSourceOrdersTableSummary(pageData: readonly SourceOrderSummary[]) {
  if (pageData.length === 0) {
    return null
  }

  return <SourceOrdersTableSummaryRow pageData={pageData} />
}
