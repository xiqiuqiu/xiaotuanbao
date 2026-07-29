import { Button, Popconfirm, Space, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DEPARTURE_INCOME_SETTLEMENT_COMPOSITE_LABELS,
  DEPARTURE_INCOME_TYPE_LABELS,
  DepartureIncomeCollectionStatus,
  DepartureIncomeCommissionStatus,
  DepartureIncomeSettlementComposite,
  DepartureIncomeType,
  type DepartureIncomeRecordSummary,
} from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'

const COMPOSITE_COLORS: Record<DepartureIncomeSettlementComposite, string> = {
  [DepartureIncomeSettlementComposite.PENDING_SETTLE]: 'default',
  [DepartureIncomeSettlementComposite.PENDING_COMMISSION]: 'warning',
  [DepartureIncomeSettlementComposite.PENDING_COLLECT]: 'processing',
  [DepartureIncomeSettlementComposite.SETTLED]: 'success',
}

type BuildIncomeRecordsColumnsOptions = {
  mutationLocked: boolean
  markPending: boolean
  onEdit: (item: DepartureIncomeRecordSummary) => void
  onMarkCollected: (item: DepartureIncomeRecordSummary) => void
  onMarkPaid: (item: DepartureIncomeRecordSummary) => void
  onDelete: (item: DepartureIncomeRecordSummary) => void
}

export function buildIncomeRecordsColumns({
  mutationLocked,
  markPending,
  onEdit,
  onMarkCollected,
  onMarkPaid,
  onDelete,
}: BuildIncomeRecordsColumnsOptions): TableColumnsType<DepartureIncomeRecordSummary> {
  return [
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (value: DepartureIncomeType) => DEPARTURE_INCOME_TYPE_LABELS[value],
    },
    { title: '项目名称', dataIndex: 'projectName', ellipsis: true },
    {
      title: '合作方',
      dataIndex: 'partnerSupplierName',
      width: 140,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: '增收金额',
      dataIndex: 'amountCents',
      width: 120,
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '导游',
      dataIndex: 'guideSupplierName',
      width: 120,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: '导游提成',
      dataIndex: 'commissionCents',
      width: 110,
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '公司增收',
      dataIndex: 'companyIncomeCents',
      width: 110,
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '综合状态',
      dataIndex: 'settlementComposite',
      width: 110,
      render: (value: DepartureIncomeSettlementComposite) => (
        <Tag color={COMPOSITE_COLORS[value]}>
          {DEPARTURE_INCOME_SETTLEMENT_COMPOSITE_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_value, record) =>
        mutationLocked ? (
          '-'
        ) : (
          <Space size={8}>
            <Button type="link" size="small" onClick={() => onEdit(record)}>
              编辑
            </Button>
            {record.incomeStatus === DepartureIncomeCollectionStatus.UNCOLLECTED ? (
              <Button
                type="link"
                size="small"
                loading={markPending}
                onClick={() => onMarkCollected(record)}
              >
                标记已收
              </Button>
            ) : null}
            {record.commissionStatus === DepartureIncomeCommissionStatus.UNPAID &&
            record.commissionCents > 0 ? (
              <Button
                type="link"
                size="small"
                loading={markPending}
                onClick={() => onMarkPaid(record)}
              >
                标记已付
              </Button>
            ) : null}
            {record.incomeStatus === DepartureIncomeCollectionStatus.UNCOLLECTED &&
            record.commissionStatus === DepartureIncomeCommissionStatus.UNPAID ? (
              <Popconfirm title="确认删除该增收记录？" onConfirm={() => onDelete(record)}>
                <Button type="link" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            ) : (
              <Button type="link" size="small" danger onClick={() => onDelete(record)}>
                删除
              </Button>
            )}
          </Space>
        ),
    },
  ]
}
