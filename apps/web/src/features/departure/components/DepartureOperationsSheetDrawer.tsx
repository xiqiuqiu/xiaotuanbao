import { useMemo } from 'react'
import { Alert, Descriptions, Drawer, Empty, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import type {
  DepartureOperationsSheetResourceRow,
  DepartureOperationsSheetSnapshot,
  DepartureOperationsSheetSourceOrderRow,
} from '@xiaotuanbao/shared'
import { getDepartureOperationsSheet } from '@/services/departure.service'
import {
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_LABELS,
  OPERATIONS_SHEET_DATA_STAGE_LABELS,
  SEGMENT_PAYABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
  formatProgressCents,
} from '../catalog'

interface DepartureOperationsSheetDrawerProps {
  open: boolean
  departureId: string
  onClose: () => void
}

function nonEmptyNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function formatSnapshotTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function DepartureOperationsSheetDrawer({
  open,
  departureId,
  onClose,
}: DepartureOperationsSheetDrawerProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['departure-operations-sheet', departureId],
    queryFn: () => getDepartureOperationsSheet(departureId),
    enabled: open,
  })

  return (
    <Drawer
      title="发团运营表"
      placement="right"
      width={960}
      open={open}
      onClose={onClose}
      destroyOnHidden
      loading={isLoading}
    >
      {isError ? (
        <Alert
          type="error"
          showIcon
          title="加载失败"
          description={error instanceof Error ? error.message : '无法加载发团运营表'}
        />
      ) : null}

      {!isLoading && !isError && !data ? <Empty description="暂无数据" /> : null}

      {data ? <OperationsSheetContent sheet={data} /> : null}
    </Drawer>
  )
}

function OperationsSheetContent({ sheet }: { sheet: DepartureOperationsSheetSnapshot }) {
  const sourceColumns = useMemo<ColumnsType<DepartureOperationsSheetSourceOrderRow>>(
    () => [
      {
        title: '合作方',
        dataIndex: 'partnerName',
        width: 140,
      },
      {
        title: '游客代表',
        key: 'guestRepresentative',
        width: 140,
        render: (_, row) => {
          if (!row.guestRepresentative) {
            return '-'
          }
          return row.guestRepresentative.phone
            ? `${row.guestRepresentative.name} ${row.guestRepresentative.phone}`
            : row.guestRepresentative.name
        },
      },
      {
        title: '成人/儿童/合计',
        key: 'guests',
        width: 120,
        render: (_, row) => `${row.adultGuestCount}/${row.childGuestCount}/${row.guestCount}`,
      },
      {
        title: '约定应收',
        dataIndex: 'agreedReceivableCents',
        width: 110,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: '已收',
        dataIndex: 'receivedCents',
        width: 90,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '未收',
        dataIndex: 'unreceivedCents',
        width: 90,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '备注',
        key: 'notes',
        render: (_, row) => {
          const parts: string[] = []
          const settlementNotes = nonEmptyNote(row.settlementNotes)
          const notes = nonEmptyNote(row.notes)
          if (settlementNotes) {
            parts.push(`结算：${settlementNotes}`)
          }
          if (notes) {
            parts.push(`客源：${notes}`)
          }
          return parts.length > 0 ? parts.join('；') : '-'
        },
      },
    ],
    [],
  )

  const resourceColumns = useMemo<ColumnsType<DepartureOperationsSheetResourceRow>>(
    () => [
      {
        title: '资源种类',
        dataIndex: 'resourceKindLabel',
        width: 90,
      },
      {
        title: '对手方',
        dataIndex: 'counterpartyName',
        width: 140,
      },
      {
        title: '名称',
        dataIndex: 'title',
        width: 140,
      },
      {
        title: '约定应付',
        key: 'payable',
        width: 150,
        align: 'right',
        render: (_, row) => {
          if (
            row.schedulePayableCents != null &&
            row.schedulePayableCents !== row.agreedPayableCents
          ) {
            return (
              <Space direction="vertical" size={0} style={{ width: '100%', alignItems: 'flex-end' }}>
                <Typography.Text>业务 {formatCents(row.agreedPayableCents)}</Typography.Text>
                <Typography.Text type="secondary">
                  财务 {formatCents(row.schedulePayableCents)}
                </Typography.Text>
              </Space>
            )
          }
          return formatCents(row.agreedPayableCents)
        },
      },
      {
        title: '已付',
        dataIndex: 'paidCents',
        width: 90,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '未付',
        dataIndex: 'unpaidCents',
        width: 90,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '进度',
        key: 'progress',
        width: 110,
        render: (_, row) => {
          if (row.payableStatus === 'not_generated') {
            return '—'
          }
          const progressLabel = catalogLabel(SEGMENT_PAYABLE_STATUS_LABELS, row.payableStatus)
          if (row.needsReview) {
            return progressLabel === '—' ? '需核对' : `${progressLabel} · 需核对`
          }
          return progressLabel
        },
      },
      {
        title: '备注',
        dataIndex: 'notes',
        render: (value: string | null) => nonEmptyNote(value) ?? '-',
      },
    ],
    [],
  )

  const departureNotes = nonEmptyNote(sheet.departure.notes)

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          发团与数据阶段
        </Typography.Title>
        <Descriptions
          size="small"
          bordered
          column={{ xs: 1, sm: 2, md: 3 }}
          items={[
            { label: '企业', children: sheet.organizationName },
            { label: '发团编号', children: sheet.departure.departureNo },
            { label: '发团名称', children: sheet.departure.name },
            { label: '路线', children: sheet.departure.routeName },
            {
              label: '日期',
              children: `${sheet.departure.startDate} ~ ${sheet.departure.endDate}（${sheet.departure.dayCount} 天）`,
            },
            { label: '负责人', children: sheet.departure.ownerName },
            {
              label: '发团状态',
              children: catalogLabel(DEPARTURE_STATUS_LABELS, sheet.departure.status),
            },
            {
              label: '出团进度',
              children: catalogLabel(DEPARTURE_PROGRESS_LABELS, sheet.departure.departureProgress),
            },
            {
              label: '数据阶段',
              children: catalogLabel(OPERATIONS_SHEET_DATA_STAGE_LABELS, sheet.dataStage),
            },
            { label: '快照时间', children: formatSnapshotTime(sheet.exportedAt) },
            { label: '导出人', children: sheet.exportedByName || '-' },
          ]}
        />
      </div>

      <div>
        <Typography.Title level={5}>客源及应收</Typography.Title>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          columns={sourceColumns}
          dataSource={sheet.sourceOrders}
          locale={{ emptyText: '暂无客源单' }}
          scroll={{ x: 900 }}
        />
      </div>

      <div>
        <Typography.Title level={5}>行程段资源及应付</Typography.Title>
        {sheet.segments.length === 0 ? (
          <Empty description="暂无行程段" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {sheet.segments.map((segment) => {
              const segmentNotes = nonEmptyNote(segment.notes)
              const dateLabel =
                segment.startDate && segment.endDate
                  ? `${segment.startDate} ~ ${segment.endDate}`
                  : '日期待定'
              const dayLabel = segment.dayCount != null ? `${segment.dayCount} 天` : null

              return (
                <div key={segment.id}>
                  <Typography.Text strong>{segment.name}</Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    {[dateLabel, dayLabel, segment.destination].filter(Boolean).join(' · ')}
                    {segmentNotes ? ` · 备注：${segmentNotes}` : ''}
                  </Typography.Paragraph>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    columns={resourceColumns}
                    dataSource={segment.resources}
                    locale={{ emptyText: '该段暂无资源' }}
                    scroll={{ x: 980 }}
                  />
                </div>
              )
            })}
          </Space>
        )}
      </div>

      {departureNotes ? (
        <div>
          <Typography.Title level={5}>发团级备注</Typography.Title>
          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
            {departureNotes}
          </Typography.Paragraph>
        </div>
      ) : null}
    </Space>
  )
}
