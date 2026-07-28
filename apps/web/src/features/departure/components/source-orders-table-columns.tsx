import type { ColumnsType } from 'antd/es/table'
import { Button, Popconfirm, Space, Tag } from 'antd'
import type { UseMutationResult } from '@tanstack/react-query'
import {
  SegmentPayableStatus,
  SourceOrderCollectionMode,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import {
  SOURCE_ORDER_COLLECTION_LABELS,
  SOURCE_ORDER_RECEIVABLE_STATUS_LABELS,
  SEGMENT_PAYABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'

interface BuildSourceOrdersColumnsOptions {
  /** 持有 `departure:write` 且发团未关闭：显示编辑/客人名单/删除。 */
  canEdit: boolean
  /** 发团未关闭（持有 `/departure`）：显示生成应收；财务只读仍可见。 */
  canGenerate: boolean
  deleteMutation: UseMutationResult<unknown, Error, string, unknown>
  generateMutation: UseMutationResult<unknown, Error, string, unknown>
  /** 打开同一客源单抽屉；`viewOnly` 时只读（无写权限或发团只读）。 */
  onOpen: (record: SourceOrderSummary, viewOnly: boolean) => void
  onOpenGuests: (record: SourceOrderSummary) => void
  onViewReceivables: (record: SourceOrderSummary) => void
  /** 跳转到发团应付并定位该客源单返利。 */
  onViewRebate: (record: SourceOrderSummary) => void
}

function canGenerateReceivable(record: SourceOrderSummary): boolean {
  return (
    record.receivableStatus === SourceOrderReceivableStatus.NOT_GENERATED ||
    record.hasIncompleteReceivablePaths
  )
}

/** 返利已落账且仍待付/部分付时，操作列追加跳转入口。 */
export function canViewRebatePayable(record: SourceOrderSummary): boolean {
  return (
    record.rebateStatus === SegmentPayableStatus.PENDING ||
    record.rebateStatus === SegmentPayableStatus.PARTIAL
  )
}

function renderCents(value: number) {
  return <span style={{ whiteSpace: 'nowrap' }}>{formatCents(value)}</span>
}

/** 列表展示：未落账用预计金额，已落账用应付金额。 */
export function sourceOrderRebateDisplayCents(order: SourceOrderSummary): number {
  return order.rebateStatus === SegmentPayableStatus.NOT_GENERATED
    ? order.estimatedRebateCents
    : order.rebateCents
}

/** 是否有返利轨迹（已落账，或按公式预计 > 0）。无返利时列表用「-」，不展示 0 / 未生成。 */
export function sourceOrderHasRebateTrack(order: SourceOrderSummary): boolean {
  if (order.rebateStatus !== SegmentPayableStatus.NOT_GENERATED) {
    return true
  }
  return order.estimatedRebateCents > 0
}

/** 返利状态文案：有预计金额但未落账时用「待生成」；无返利轨迹用「-」。 */
export function sourceOrderRebateStatusLabel(order: SourceOrderSummary): string {
  if (!sourceOrderHasRebateTrack(order)) {
    return '-'
  }
  if (
    order.rebateStatus === SegmentPayableStatus.NOT_GENERATED &&
    order.estimatedRebateCents > 0
  ) {
    return '待生成'
  }

  return catalogLabel(SEGMENT_PAYABLE_STATUS_LABELS, order.rebateStatus)
}

function renderRebateStatus(order: SourceOrderSummary) {
  if (!sourceOrderHasRebateTrack(order)) {
    return <span>-</span>
  }
  return <Tag>{sourceOrderRebateStatusLabel(order)}</Tag>
}

/** 我方代收列：拆定金/尾款，避免只看合计看不清账期。 */
export function formatGuestCollectBreakdown(
  order: Pick<
    SourceOrderSummary,
    'collectionMode' | 'depositCents' | 'balanceCents' | 'guestCollectCents'
  >,
): string {
  if (order.collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED) {
    return formatCents(order.guestCollectCents)
  }
  if (order.collectionMode === SourceOrderCollectionMode.SPLIT) {
    return `尾款 ${formatCents(order.balanceCents)}`
  }
  return `定金 ${formatCents(order.depositCents)} · 尾款 ${formatCents(order.balanceCents)}`
}

/** 单元格内定金/尾款分行右对齐，金额右缘与合计列对齐，避免单行长文案「看起来偏左」。 */
export function renderGuestCollectBreakdown(
  order: Pick<
    SourceOrderSummary,
    'collectionMode' | 'depositCents' | 'balanceCents' | 'guestCollectCents'
  >,
) {
  if (order.collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED) {
    return (
      <span style={{ display: 'block', textAlign: 'right', width: '100%', whiteSpace: 'nowrap' }}>
        {formatCents(order.guestCollectCents)}
      </span>
    )
  }

  if (order.collectionMode === SourceOrderCollectionMode.SPLIT) {
    return (
      <div data-guest-collect="stacked" style={{ textAlign: 'right', width: '100%', lineHeight: 1.45 }}>
        <div>尾款 {formatCents(order.balanceCents)}</div>
      </div>
    )
  }

  return (
    <div data-guest-collect="stacked" style={{ textAlign: 'right', width: '100%', lineHeight: 1.45 }}>
      <div>定金 {formatCents(order.depositCents)}</div>
      <div>尾款 {formatCents(order.balanceCents)}</div>
    </div>
  )
}

export function buildSourceOrdersColumns({
  canEdit,
  canGenerate,
  deleteMutation,
  generateMutation,
  onOpen,
  onOpenGuests,
  onViewReceivables,
  onViewRebate,
}: BuildSourceOrdersColumnsOptions): ColumnsType<SourceOrderSummary> {
  return [
    { title: '客户', dataIndex: 'partnerName', width: 140 },
    { title: '总人数', dataIndex: 'guestCount', width: 80, align: 'right' },
    {
      title: '原始应收',
      dataIndex: 'grossReceivableCents',
      width: 120,
      align: 'right',
      render: renderCents,
    },
    {
      title: '调整净额',
      dataIndex: 'fareAdjustmentNetCents',
      width: 120,
      align: 'right',
      render: renderCents,
    },
    {
      title: '优惠金额',
      dataIndex: 'discountCents',
      width: 120,
      align: 'right',
      render: renderCents,
    },
    {
      title: '结算金额',
      dataIndex: 'netReceivableCents',
      width: 120,
      align: 'right',
      render: renderCents,
    },
    {
      title: '收款方式',
      dataIndex: 'collectionMode',
      width: 150,
      render: (value: string) => catalogLabel(SOURCE_ORDER_COLLECTION_LABELS, value),
    },
    {
      title: '客户已收',
      dataIndex: 'partnerCollectedCents',
      width: 120,
      align: 'right',
      render: renderCents,
    },
    {
      title: '我方代收',
      key: 'guestCollectBreakdown',
      width: 200,
      align: 'right',
      render: (_: unknown, record: SourceOrderSummary) => renderGuestCollectBreakdown(record),
    },
    {
      title: '应收状态',
      dataIndex: 'receivableStatus',
      width: 100,
      render: (value: string) => (
        <Tag>{catalogLabel(SOURCE_ORDER_RECEIVABLE_STATUS_LABELS, value)}</Tag>
      ),
    },
    {
      title: '返利金额',
      key: 'rebateAmount',
      width: 120,
      align: 'right',
      render: (_: unknown, record: SourceOrderSummary) =>
        sourceOrderHasRebateTrack(record) ? (
          renderCents(sourceOrderRebateDisplayCents(record))
        ) : (
          <span>-</span>
        ),
    },
    {
      title: '返利状态',
      dataIndex: 'rebateStatus',
      width: 100,
      render: (_: string, record: SourceOrderSummary) => renderRebateStatus(record),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      width: 160,
      ellipsis: { showTitle: false },
      render: (value: string | null) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
    },
    ...buildBusinessTimestampColumns<SourceOrderSummary>(),
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 320,
      render: (_: unknown, record: SourceOrderSummary) => {
        const allowGenerate = canGenerateReceivable(record)
        const viewOnly = !canEdit
        const showViewReceivables =
          record.receivableStatus !== SourceOrderReceivableStatus.NOT_GENERATED

        return (
          <Space size="small" wrap>
            <Button type="link" size="small" onClick={() => onOpen(record, viewOnly)}>
              {viewOnly ? '查看' : '编辑'}
            </Button>
            {showViewReceivables ? (
              <Button type="link" size="small" onClick={() => onViewReceivables(record)}>
                查看应收
              </Button>
            ) : null}
            {canViewRebatePayable(record) ? (
              <Button type="link" size="small" onClick={() => onViewRebate(record)}>
                查看返利
              </Button>
            ) : null}
            {canEdit ? (
              <Button type="link" size="small" onClick={() => onOpenGuests(record)}>
                客人名单
              </Button>
            ) : null}
            {canGenerate && allowGenerate ? (
              <Button
                type="link"
                size="small"
                loading={
                  generateMutation.isPending && generateMutation.variables === record.id
                }
                onClick={() => generateMutation.mutate(record.id)}
              >
                {record.hasIncompleteReceivablePaths ? '补全应收' : '生成应收'}
              </Button>
            ) : null}
            {canEdit && allowGenerate ? (
              <Popconfirm
                title="确认删除该客源单？"
                onConfirm={() => deleteMutation.mutate(record.id)}
              >
                <Button type="link" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        )
      },
    },
  ]
}
