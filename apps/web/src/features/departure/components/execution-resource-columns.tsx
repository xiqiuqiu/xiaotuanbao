import { Button, Popconfirm, Space, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import type { SegmentResourceSummary } from '@/types/api'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import {
  RESOURCE_KIND_LABELS,
  SEGMENT_PAYABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'

function canGeneratePayable(record: SegmentResourceSummary): boolean {
  return record.payableStatus === SegmentPayableStatus.NOT_GENERATED
}

function payableStatusTagColor(status: string): string | undefined {
  switch (status) {
    case SegmentPayableStatus.PAID:
      return 'success'
    case SegmentPayableStatus.PARTIAL:
      return 'warning'
    case SegmentPayableStatus.PENDING:
      return 'processing'
    default:
      return 'default'
  }
}

export type BuildExecutionResourceColumnsOptions = {
  mutationLocked: boolean
  /** 持有 `departure:write`：显示编辑/删除/作废应付；财务无则只读。生成应付不受此限。 */
  canEdit: boolean
  /**
   * 可执行财务账款操作（持有 /finance/*，见 capability `financeMutate`）。关闭节点走
   * `POST /finance/payment-schedules/:id/cancel`（要 /finance/receivable），计调无此权限，
   * 故须据此 gating，否则计调点「关闭节点」会 403。
   */
  canMutateFinance: boolean
  generatingId?: string
  onEdit: (resource: SegmentResourceSummary, viewOnly: boolean) => void
  onViewPayables: (resource: SegmentResourceSummary) => void
  onGenerate: (resourceId: string) => void
  onDelete: (resourceId: string) => void
  onVoidPayable: (resource: SegmentResourceSummary) => void
  onClosePayable: (resource: SegmentResourceSummary) => void
}

export function buildExecutionResourceColumns({
  mutationLocked,
  canEdit,
  canMutateFinance,
  generatingId,
  onEdit,
  onViewPayables,
  onGenerate,
  onDelete,
  onVoidPayable,
  onClosePayable,
}: BuildExecutionResourceColumnsOptions): ColumnsType<SegmentResourceSummary> {
  return [
    {
      title: '资源种类',
      dataIndex: 'resourceKind',
      width: 90,
      render: (value: string) => catalogLabel(RESOURCE_KIND_LABELS, value),
    },
    {
      title: '供应商',
      dataIndex: 'counterpartyName',
      width: 140,
    },
    {
      title: '资源名称',
      dataIndex: 'title',
      width: 180,
      render: (value: string, record) => (
        <Space size={6} wrap>
          <span>{value || '-'}</span>
          {record.pendingCheck ? <Tag color="warning">待检查</Tag> : null}
        </Space>
      ),
    },
    {
      title: '资源金额',
      dataIndex: 'amountCents',
      width: 110,
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '应付状态',
      dataIndex: 'payableStatus',
      width: 100,
      render: (value: string) => (
        <Tag color={payableStatusTagColor(value)}>
          {catalogLabel(SEGMENT_PAYABLE_STATUS_LABELS, value)}
        </Tag>
      ),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      ellipsis: { showTitle: false },
      render: (value: string | null) => <EllipsisTooltipText>{value || null}</EllipsisTooltipText>,
    },
    ...buildBusinessTimestampColumns<SegmentResourceSummary>(),
    {
      title: '操作',
      width: 260,
      fixed: 'right',
      render: (_, record) => {
        const allowGenerate = canGeneratePayable(record)
        const allowVoid =
          !mutationLocked &&
          canEdit &&
          Boolean(record.paymentScheduleId) &&
          !record.financeTouched &&
          record.payableStatus !== SegmentPayableStatus.CLOSED
        const allowClose =
          !mutationLocked &&
          canMutateFinance &&
          Boolean(record.paymentScheduleId) &&
          record.financeTouched &&
          (record.unsettledAmountCents ?? 0) > 0 &&
          record.payableStatus !== SegmentPayableStatus.CLOSED

        return (
          <Space size={0} wrap>
            <Button
              type="link"
              size="small"
              onClick={() => onEdit(record, record.amountFieldsLocked || !canEdit)}
            >
              {mutationLocked || record.amountFieldsLocked || !canEdit ? '查看' : '编辑'}
            </Button>
            {!allowGenerate ? (
              <Button type="link" size="small" onClick={() => onViewPayables(record)}>
                查看应付
              </Button>
            ) : null}
            {!mutationLocked && allowGenerate ? (
              <Button
                type="link"
                size="small"
                onClick={() => onGenerate(record.id)}
                loading={generatingId === record.id}
              >
                生成应付
              </Button>
            ) : null}
            {allowVoid ? (
              <Button type="link" size="small" danger onClick={() => onVoidPayable(record)}>
                作废应付
              </Button>
            ) : null}
            {allowClose ? (
              <Button type="link" size="small" danger onClick={() => onClosePayable(record)}>
                关闭节点
              </Button>
            ) : null}
            {!mutationLocked && canEdit && allowGenerate ? (
              <Popconfirm
                title="确定删除该资源？"
                onConfirm={() => onDelete(record.id)}
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
