import { Button, Space, Tag } from 'antd'
import { Link } from '@tanstack/react-router'
import type { ColumnsType } from 'antd/es/table'
import type { PartnerSummary } from '@/types/api'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import { DIRECTORY_PROFILE_STATUS_LABELS, SETTLEMENT_CYCLE_LABELS, SETTLEMENT_METHOD_LABELS } from '@/features/directory/catalog'
import { PARTNER_KIND_LABELS, PARTNER_TYPE_LABELS, catalogLabel } from '../catalog'

export function buildPartnerColumns(
  includeArchived: boolean,
  onEdit: (partner: PartnerSummary) => void,
  onArchive: (partner: PartnerSummary) => void,
  onRestore: (partnerId: string) => void,
  canEdit: boolean,
): ColumnsType<PartnerSummary> {
  return [
    {
      title: '合作伙伴名称', dataIndex: 'name', render: (name: string, record) => (
        <Link className={nameLinkStyles.nameLink} to="/partner/$partnerId" params={{ partnerId: record.id }}>{name}</Link>
      ),
    },
    { title: '合作伙伴类型', dataIndex: 'partnerType', render: (value: string) => catalogLabel(PARTNER_TYPE_LABELS, value) },
    { title: '合作方向', dataIndex: 'partnerKind', render: (value: string) => catalogLabel(PARTNER_KIND_LABELS, value) },
    { title: '主联系人', dataIndex: 'contactName', render: (value) => value ?? '-' },
    { title: '联系方式', dataIndex: 'contactPhone', render: (value) => value ?? '-' },
    { title: '结算方式', dataIndex: 'settlementMethod', render: (value: string | null) => catalogLabel(SETTLEMENT_METHOD_LABELS, value) },
    { title: '账期规则', dataIndex: 'paymentTermRule', render: (value: string | null) => catalogLabel(SETTLEMENT_CYCLE_LABELS, value) },
    {
      title: '状态', dataIndex: 'status', render: (status: string) => {
        const color = status === DirectoryProfileStatus.ACTIVE ? 'success' : status === DirectoryProfileStatus.ARCHIVED ? 'default' : 'warning'
        return <Tag color={color}>{DIRECTORY_PROFILE_STATUS_LABELS[status] ?? status}</Tag>
      },
    },
    ...buildBusinessTimestampColumns<PartnerSummary>(),
    // ADR-0023: 目录维护入口按 partner:write 显隐；财务（无 canEdit）只读，隐藏整列。
    ...(canEdit
      ? [
          {
            title: '操作', key: 'actions', render: (_: unknown, record: PartnerSummary) => {
              if (includeArchived && record.status === DirectoryProfileStatus.ARCHIVED) return <Button type="link" onClick={() => onRestore(record.id)}>恢复</Button>
              if (record.status === DirectoryProfileStatus.ARCHIVED) return null
              return <Space><Button type="link" onClick={() => onEdit(record)}>编辑</Button><Button type="link" danger onClick={() => onArchive(record)}>删除</Button></Space>
            },
          },
        ]
      : []),
  ]
}
