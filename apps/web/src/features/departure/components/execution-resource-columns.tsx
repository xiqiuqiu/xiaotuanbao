import { Button, Popconfirm, Space, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import type { SegmentResourceSummary } from '@/types/api'
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
  generatingId?: string
  onEdit: (resource: SegmentResourceSummary, viewOnly: boolean) => void
  onViewPayables: (resource: SegmentResourceSummary) => void
  onGenerate: (resourceId: string) => void
  onDelete: (resourceId: string) => void
}

export function buildExecutionResourceColumns({
  mutationLocked,
  generatingId,
  onEdit,
  onViewPayables,
  onGenerate,
  onDelete,
}: BuildExecutionResourceColumnsOptions): ColumnsType<SegmentResourceSummary> {
  return [
    {
      title: '资源种类',
      dataIndex: 'resourceKind',
      width: 90,
      render: (value: string) => catalogLabel(RESOURCE_KIND_LABELS, value),
    },
    {
      title: '对手方',
      dataIndex: 'counterpartyName',
      width: 140,
    },
    {
      title: '资源项目',
      dataIndex: 'title',
      width: 140,
      render: (value: string) => value || '-',
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
      ellipsis: true,
      render: (value: string | null) => value || '-',
    },
    {
      title: '操作',
      width: 260,
      fixed: 'right',
      render: (_, record) => {
        const allowGenerate = canGeneratePayable(record)

        return (
          <Space size={0} wrap>
            <Button
              type="link"
              size="small"
              onClick={() => onEdit(record, record.amountFieldsLocked)}
            >
              {mutationLocked || record.amountFieldsLocked ? '查看' : '编辑'}
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
            {!mutationLocked && allowGenerate ? (
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
