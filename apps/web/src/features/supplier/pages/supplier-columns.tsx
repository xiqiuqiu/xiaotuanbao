import { Button, Space, Tag } from 'antd'
import { Link } from '@tanstack/react-router'
import type { ColumnsType } from 'antd/es/table'
import type { SupplierSummary } from '@/types/api'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import { SupplierCategoryTags } from '../components/SupplierCategoryTags'
import { DIRECTORY_PROFILE_STATUS_LABELS, SETTLEMENT_CYCLE_LABELS, SETTLEMENT_METHOD_LABELS, catalogLabel } from '../catalog'

export function buildSupplierColumns(
  includeArchived: boolean,
  onEdit: (supplier: SupplierSummary) => void,
  onArchive: (supplier: SupplierSummary) => void,
  onRestore: (supplierId: string) => void,
  canEdit: boolean,
): ColumnsType<SupplierSummary> {
  return [
    {
      title: '供应商名称', dataIndex: 'name', render: (name: string, record) => (
        <Link className={nameLinkStyles.nameLink} to="/supplier/$supplierId" params={{ supplierId: record.id }}>{name}</Link>
      ),
    },
    { title: '类别', dataIndex: 'categories', render: (categories: string[]) => <SupplierCategoryTags categories={categories ?? []} /> },
    { title: '主联系人', dataIndex: 'contactName', render: (value) => value ?? '-' },
    { title: '联系方式', dataIndex: 'contactPhone', render: (value) => value ?? '-' },
    { title: '结算方式', dataIndex: 'settlementMethod', render: (value: string | null) => catalogLabel(SETTLEMENT_METHOD_LABELS, value) },
    { title: '账期规则', dataIndex: 'settlementCycle', render: (value: string | null) => catalogLabel(SETTLEMENT_CYCLE_LABELS, value) },
    {
      title: '状态', dataIndex: 'status', render: (status: string) => {
        const color = status === DirectoryProfileStatus.ACTIVE ? 'success' : status === DirectoryProfileStatus.ARCHIVED ? 'default' : 'warning'
        return <Tag color={color}>{DIRECTORY_PROFILE_STATUS_LABELS[status] ?? status}</Tag>
      },
    },
    ...buildBusinessTimestampColumns<SupplierSummary>(),
    // ADR-0023: 目录维护入口按 supplier:write 显隐；财务（无 canEdit）只读，隐藏整列。
    ...(canEdit
      ? [
          {
            title: '操作', key: 'actions', render: (_: unknown, record: SupplierSummary) => {
              if (includeArchived && record.status === DirectoryProfileStatus.ARCHIVED) return <Button type="link" onClick={() => onRestore(record.id)}>恢复</Button>
              if (record.status === DirectoryProfileStatus.ARCHIVED) return null
              return <Space><Button type="link" onClick={() => onEdit(record)}>编辑</Button><Button type="link" danger onClick={() => onArchive(record)}>删除</Button></Space>
            },
          },
        ]
      : []),
  ]
}
