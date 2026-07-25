import { Table, Typography, theme } from 'antd'
import type { SourceOrderSummary } from '@/types/api'
import { formatCents } from '../catalog'

/** Numeric totals for the source-orders table footer (current filtered page). */
export interface SourceOrdersTableTotals {
  guestCount: number
  grossReceivableCents: number
  fareAdjustmentNetCents: number
  discountCents: number
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
}

export function aggregateSourceOrdersTableTotals(
  pageData: readonly SourceOrderSummary[],
): SourceOrdersTableTotals {
  return pageData.reduce<SourceOrdersTableTotals>(
    (totals, order) => ({
      guestCount: totals.guestCount + order.guestCount,
      grossReceivableCents: totals.grossReceivableCents + order.grossReceivableCents,
      fareAdjustmentNetCents: totals.fareAdjustmentNetCents + order.fareAdjustmentNetCents,
      discountCents: totals.discountCents + order.discountCents,
      netReceivableCents: totals.netReceivableCents + order.netReceivableCents,
      partnerCollectedCents: totals.partnerCollectedCents + order.partnerCollectedCents,
      guestCollectCents: totals.guestCollectCents + order.guestCollectCents,
    }),
    {
      guestCount: 0,
      grossReceivableCents: 0,
      fareAdjustmentNetCents: 0,
      discountCents: 0,
      netReceivableCents: 0,
      partnerCollectedCents: 0,
      guestCollectCents: 0,
    },
  )
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
  const totals = aggregateSourceOrdersTableTotals(pageData)

  return (
    <Table.Summary fixed>
      <Table.Summary.Row style={{ background: token.colorFillAlter }}>
        <Table.Summary.Cell index={0}>
          <Typography.Text strong>合计</Typography.Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={1} align="right">
          <Typography.Text strong>{totals.guestCount}</Typography.Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={2} align="right">
          <SummaryAmount value={totals.grossReceivableCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={3} align="right">
          <SummaryAmount value={totals.fareAdjustmentNetCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={4} align="right">
          <SummaryAmount value={totals.discountCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={5} align="right">
          <SummaryAmount value={totals.netReceivableCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={6} align="right">
          <SummaryAmount value={totals.partnerCollectedCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={7} align="right">
          <SummaryAmount value={totals.guestCollectCents} />
        </Table.Summary.Cell>
        {/* 收款方式～更新时间：无合计语义，合并占位；操作列单独占位以对齐 fixed 列 */}
        <Table.Summary.Cell index={8} colSpan={5} />
        <Table.Summary.Cell index={13} />
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
