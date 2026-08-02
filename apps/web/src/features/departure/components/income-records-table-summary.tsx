import { Table, Typography, theme } from 'antd'
import type { DepartureIncomeRecordSummary } from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'

export interface IncomeRecordsTableTotals {
  amountCents: number
  commissionCents: number
  companyIncomeCents: number
}

export function aggregateIncomeRecordsTableTotals(
  pageData: readonly DepartureIncomeRecordSummary[],
): IncomeRecordsTableTotals {
  return pageData.reduce<IncomeRecordsTableTotals>(
    (totals, row) => ({
      amountCents: totals.amountCents + row.amountCents,
      commissionCents: totals.commissionCents + row.commissionCents,
      companyIncomeCents: totals.companyIncomeCents + row.companyIncomeCents,
    }),
    { amountCents: 0, commissionCents: 0, companyIncomeCents: 0 },
  )
}

function SummaryAmount({ value }: { value: number }) {
  return (
    <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
      {formatCents(value)}
    </Typography.Text>
  )
}

function IncomeRecordsTableSummaryRow({
  pageData,
}: {
  pageData: readonly DepartureIncomeRecordSummary[]
}) {
  const { token } = theme.useToken()
  const totals = aggregateIncomeRecordsTableTotals(pageData)

  return (
    <Table.Summary fixed>
      <Table.Summary.Row style={{ background: token.colorFillAlter }}>
        <Table.Summary.Cell index={0}>
          <Typography.Text strong>合计</Typography.Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={1} />
        <Table.Summary.Cell index={2} />
        <Table.Summary.Cell index={3} align="right">
          <SummaryAmount value={totals.amountCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={4} />
        <Table.Summary.Cell index={5} align="right">
          <SummaryAmount value={totals.commissionCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={6} align="right">
          <SummaryAmount value={totals.companyIncomeCents} />
        </Table.Summary.Cell>
        <Table.Summary.Cell index={7} />
        <Table.Summary.Cell index={8} />
      </Table.Summary.Row>
    </Table.Summary>
  )
}

/** Ant Design Table `summary` renderer; column indices match `buildIncomeRecordsColumns`. */
export function renderIncomeRecordsTableSummary(
  pageData: readonly DepartureIncomeRecordSummary[],
) {
  if (pageData.length === 0) {
    return null
  }

  return <IncomeRecordsTableSummaryRow pageData={pageData} />
}
