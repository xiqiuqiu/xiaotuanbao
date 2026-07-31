import { Table, Typography, theme } from 'antd'
import { formatCents } from '../catalog'
import type { ExecutionResourceRow } from './execution-resource-columns'

export interface ExecutionResourceTableTotals {
  amountCents: number
}

export function aggregateExecutionResourceTableTotals(
  pageData: readonly ExecutionResourceRow[],
): ExecutionResourceTableTotals {
  return pageData.reduce<ExecutionResourceTableTotals>(
    (totals, row) => ({
      amountCents: totals.amountCents + row.amountCents,
    }),
    { amountCents: 0 },
  )
}

function ExecutionResourceTableSummaryRow({
  pageData,
}: {
  pageData: readonly ExecutionResourceRow[]
}) {
  const { token } = theme.useToken()
  const totals = aggregateExecutionResourceTableTotals(pageData)

  return (
    <Table.Summary fixed>
      <Table.Summary.Row style={{ background: token.colorFillAlter }}>
        <Table.Summary.Cell index={0}>
          <Typography.Text strong>合计</Typography.Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={1} />
        <Table.Summary.Cell index={2} />
        <Table.Summary.Cell index={3} align="right">
          <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
            {formatCents(totals.amountCents)}
          </Typography.Text>
        </Table.Summary.Cell>
        {/* 应付状态～更新时间 */}
        <Table.Summary.Cell index={4} colSpan={4} />
        <Table.Summary.Cell index={8} />
      </Table.Summary.Row>
    </Table.Summary>
  )
}

/** Ant Design Table `summary` renderer; column indices match `buildExecutionResourceColumns`. */
export function renderExecutionResourceTableSummary(
  pageData: readonly ExecutionResourceRow[],
) {
  if (pageData.length === 0) {
    return null
  }

  return <ExecutionResourceTableSummaryRow pageData={pageData} />
}
