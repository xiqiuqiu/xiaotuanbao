import { Button, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd'
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'
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
import {
  getIncompleteCompletionLabels,
} from '../utils/departure-transition'
import type { DepartureListSearch } from '../utils/departure-list-search'

type DepartureColumnsActions = {
  onCopy: (departureId: string) => void
  onPurge: (departure: DepartureSummary) => void
  purgePendingId?: string | null
}

/**
 * 与 `buildDepartureColumns` 列宽之和对齐（含复制+删除操作列）。
 * Table `scroll.x` 不得小于此值，否则 fixed 操作列会压住左侧内容。
 * 发团视图不单独占「路线名称」列（160），路线改在团名悬停展示；
 * 完成情况只铺待办缺口 Tag，列宽收敛。
 */
export const DEPARTURE_LIST_TABLE_SCROLL_X = 2020

export function buildDepartureColumns(
  actions: DepartureColumnsActions,
  canEdit: boolean,
  listSearch?: DepartureListSearch,
): ColumnsType<DepartureSummary> {
  const columns: ColumnsType<DepartureSummary> = [
    {
      title: '团号',
      dataIndex: 'departureNo',
      fixed: 'left',
      width: 150,
      render: (_value: string, record) => (
        <DepartureDetailPrefetchLink record={record} strong listSearch={listSearch}>
          <span style={{ whiteSpace: 'nowrap' }}>{record.departureNo}</span>
        </DepartureDetailPrefetchLink>
      ),
    },
    {
      title: '团名',
      dataIndex: 'name',
      width: 200,
      ellipsis: { showTitle: false },
      render: (name: string, record) => {
        const routeLabel = record.routeName?.trim()
        const cell = (
          <DepartureDetailPrefetchLink record={record} listSearch={listSearch}>
            <EllipsisTooltipText empty="-" tooltip={routeLabel ? false : undefined}>
              {name}
            </EllipsisTooltipText>
          </DepartureDetailPrefetchLink>
        )
        if (!routeLabel) return cell
        return (
          <Tooltip
            title={
              <>
                <div>{name || '-'}</div>
                <div>路线名称：{routeLabel}</div>
              </>
            }
          >
            <span style={{ display: 'inline-block', maxWidth: '100%' }}>{cell}</span>
          </Tooltip>
        )
      },
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
      width: 200,
      render: (_value, record) => {
        const allLabels = renderCompletionTags(record.completionTags).map((tag) => tag.label)
        const incompleteLabels = getIncompleteCompletionLabels(record.completionTags)
        const tooltip = (
          <Space orientation="vertical" size={2}>
            {allLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </Space>
        )

        if (incompleteLabels.length === 0) {
          return (
            <Tooltip title={tooltip}>
              <Typography.Text type="secondary">已齐</Typography.Text>
            </Tooltip>
          )
        }

        return (
          <Tooltip title={tooltip}>
            <Space size={[4, 4]} wrap>
              {incompleteLabels.map((label) => (
                <Tag key={label} color="warning" style={{ marginInlineEnd: 0 }}>
                  {label}
                </Tag>
              ))}
            </Space>
          </Tooltip>
        )
      },
    },
    { title: '结算应收', dataIndex: 'netReceivableCents', width: 110, render: (value: number) => formatCents(value) },
    { title: '成本合计', dataIndex: 'payableCents', width: 110, render: (value: number) => formatCents(value) },
    { title: '当前毛利', dataIndex: 'estimatedMarginCents', width: 110, render: (value: number) => formatCents(value) },
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

  // 复制/删除均要 departure:write；财务无此权限，隐藏整列操作。
  if (canEdit) {
    columns.push({
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 160,
      render: (_value, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => actions.onCopy(record.id)}
          >
            复制
          </Button>
          {record.canPurge ? (
            <Popconfirm
              title="确认删除该发团？"
              description={`将永久删除 ${record.departureNo}「${record.name}」，不可恢复。`}
              okText="删除"
              okButtonProps={{ danger: true, loading: actions.purgePendingId === record.id }}
              cancelText="取消"
              onConfirm={() => actions.onPurge(record)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    })
  }

  return columns
}
