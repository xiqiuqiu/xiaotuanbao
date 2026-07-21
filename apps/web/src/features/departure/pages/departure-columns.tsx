import { Button, Space, Tag } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { DepartureSummary } from '@/types/api'
import { DepartureStatus } from '@xiaotuanbao/shared'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import { DepartureDetailPrefetchLink } from '../components/DepartureDetailPrefetchLink'
import {
  DEPARTURE_PROGRESS_COLORS,
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
  DEPARTURE_TYPE_LABELS,
  catalogLabel,
  formatCents,
  renderCompletionTags,
} from '../catalog'

export function buildDepartureColumns(
  onCopy: (departureId: string) => void,
  canEdit: boolean,
): ColumnsType<DepartureSummary> {
  const columns: ColumnsType<DepartureSummary> = [
    {
      title: '团号',
      dataIndex: 'departureNo',
      fixed: 'left',
      width: 150,
      render: (_value: string, record) => (
        <DepartureDetailPrefetchLink record={record} strong>
          <span style={{ whiteSpace: 'nowrap' }}>{record.departureNo}</span>
        </DepartureDetailPrefetchLink>
      ),
    },
    {
      title: '团名',
      dataIndex: 'name',
      width: 200,
      ellipsis: { showTitle: false },
      render: (name: string, record) => (
        <DepartureDetailPrefetchLink record={record}>
          <EllipsisTooltipText empty="">{name}</EllipsisTooltipText>
        </DepartureDetailPrefetchLink>
      ),
    },
    {
      title: '路线名称',
      dataIndex: 'routeName',
      width: 160,
      ellipsis: { showTitle: false },
      render: (value: string) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
    },
    {
      title: '发团类型',
      dataIndex: 'departureType',
      width: 90,
      render: (value: string) => catalogLabel(DEPARTURE_TYPE_LABELS, value),
    },
    {
      title: '出团日期',
      dataIndex: 'startDate',
      width: 180,
      render: (value: string, record) => `${value} ~ ${record.endDate}`,
    },
    {
      title: '出团进度',
      dataIndex: 'departureProgress',
      width: 90,
      render: (value: string) => (
        <Tag color={DEPARTURE_PROGRESS_COLORS[value] ?? 'default'}>
          {catalogLabel(DEPARTURE_PROGRESS_LABELS, value)}
        </Tag>
      ),
    },
    {
      title: '发团状态',
      dataIndex: 'status',
      width: 90,
      render: (status: DepartureStatus) => (
        <Tag color={DEPARTURE_STATUS_COLORS[status] ?? 'default'}>
          {catalogLabel(DEPARTURE_STATUS_LABELS, status)}
        </Tag>
      ),
    },
    { title: '总人数', dataIndex: 'totalGuests', width: 80, render: (value: number) => `${value}人` },
    {
      title: '完成情况',
      key: 'completionTags',
      width: 320,
      render: (_value, record) => (
        <Space size={[0, 4]} wrap>
          {renderCompletionTags(record.completionTags).map((tag) => (
            <Tag key={tag.label}>{tag.label}</Tag>
          ))}
        </Space>
      ),
    },
    { title: '实际应收', dataIndex: 'netReceivableCents', width: 110, render: (value: number) => formatCents(value) },
    { title: '应付合计', dataIndex: 'payableCents', width: 110, render: (value: number) => formatCents(value) },
    { title: '预估毛利', dataIndex: 'estimatedMarginCents', width: 110, render: (value: number) => formatCents(value) },
    {
      title: '负责人',
      dataIndex: 'ownerName',
      width: 120,
      ellipsis: { showTitle: false },
      render: (value: string | undefined, record) => (
        <EllipsisTooltipText>{value ?? record.ownerUserId}</EllipsisTooltipText>
      ),
    },
    ...buildBusinessTimestampColumns<DepartureSummary>(),
  ]

  // 复制会走 POST /departures/:id/copy（要 departure:write）；财务无此权限，隐藏整列操作。
  if (canEdit) {
    columns.push({
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 80,
      render: (_value, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => onCopy(record.id)}>
            复制
          </Button>
        </Space>
      ),
    })
  }

  return columns
}
