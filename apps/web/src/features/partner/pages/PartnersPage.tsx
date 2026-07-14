import { useCallback, useMemo, useReducer, useState } from 'react'
import { Button, Card, Form, Modal, Space, Table, Tag, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { PartnerSummary } from '@/types/api'
import { DirectoryProfileStatus, type PartnerKind, type PartnerType } from '@xiaotuanbao/shared'
import {
  archivePartner,
  createPartner,
  listPartners,
  restorePartner,
  updatePartner,
} from '@/services/partner.service'
import { PartnerFilters } from '../components/PartnerFilters'
import { PartnerFormDrawer } from '../components/PartnerFormDrawer'
import { PartnerStatsCards } from '../components/PartnerStatsCards'
import type { PartnerFormValues } from '../components/PartnerProfileSections'
import {
  PARTNER_KIND_LABELS,
  PARTNER_TYPE_LABELS,
  catalogLabel,
} from '../catalog'
import {
  DIRECTORY_PROFILE_STATUS_LABELS,
  SETTLEMENT_CYCLE_LABELS,
  SETTLEMENT_METHOD_LABELS,
} from '@/features/directory/catalog'
import {
  buildCreatePayload,
  buildUpdatePayload,
  partnerToFormValues,
} from '../utils/partner-form'
import { PageHeader } from '@/layouts/PageHeader'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'

type PartnersPageState = {
  search: string
  partnerKindFilter?: PartnerKind
  partnerTypeFilter?: PartnerType
  statusFilter?: DirectoryProfileStatus
  includeArchived: boolean
  filtersKey: number
  page: number
  pageSize: number
}

const initialPartnersPageState: PartnersPageState = {
  search: '',
  partnerKindFilter: undefined,
  partnerTypeFilter: undefined,
  statusFilter: undefined,
  includeArchived: false,
  filtersKey: 0,
  page: 1,
  pageSize: 10,
}

type PartnersPageAction =
  | { type: 'SET_SEARCH'; value: string }
  | { type: 'SET_PARTNER_KIND'; value?: PartnerKind }
  | { type: 'SET_PARTNER_TYPE'; value?: PartnerType }
  | { type: 'SET_STATUS'; value?: DirectoryProfileStatus }
  | { type: 'SET_INCLUDE_ARCHIVED'; value: boolean }
  | { type: 'SET_PAGE'; page: number; pageSize?: number }
  | { type: 'RESET_FILTERS' }

function partnersPageReducer(
  state: PartnersPageState,
  action: PartnersPageAction,
): PartnersPageState {
  switch (action.type) {
    case 'SET_SEARCH':
      return { ...state, search: action.value, page: 1 }
    case 'SET_PARTNER_KIND':
      return { ...state, partnerKindFilter: action.value, page: 1 }
    case 'SET_PARTNER_TYPE':
      return { ...state, partnerTypeFilter: action.value, page: 1 }
    case 'SET_STATUS':
      return { ...state, statusFilter: action.value, page: 1 }
    case 'SET_INCLUDE_ARCHIVED':
      return { ...state, includeArchived: action.value, page: 1 }
    case 'SET_PAGE':
      return {
        ...state,
        page: action.page,
        pageSize: action.pageSize ?? state.pageSize,
      }
    case 'RESET_FILTERS':
      return {
        ...initialPartnersPageState,
        filtersKey: state.filtersKey + 1,
      }
  }
}

export function buildPartnerColumns(
  includeArchived: boolean,
  onEdit: (partner: PartnerSummary) => void,
  onArchive: (partner: PartnerSummary) => void,
  onRestore: (partnerId: string) => void,
): ColumnsType<PartnerSummary> {
  return [
    {
      title: '合作伙伴名称',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Link
          className={nameLinkStyles.nameLink}
          to="/partner/$partnerId"
          params={{ partnerId: record.id }}
        >
          {name}
        </Link>
      ),
    },
    {
      title: '合作伙伴类型',
      dataIndex: 'partnerType',
      render: (value: string) => catalogLabel(PARTNER_TYPE_LABELS, value),
    },
    {
      title: '合作方向',
      dataIndex: 'partnerKind',
      render: (value: string) => catalogLabel(PARTNER_KIND_LABELS, value),
    },
    { title: '主联系人', dataIndex: 'contactName', render: (value) => value ?? '-' },
    { title: '联系方式', dataIndex: 'contactPhone', render: (value) => value ?? '-' },
    {
      title: '结算方式',
      dataIndex: 'settlementMethod',
      render: (value: string | null) => catalogLabel(SETTLEMENT_METHOD_LABELS, value),
    },
    {
      title: '账期规则',
      dataIndex: 'paymentTermRule',
      render: (value: string | null) => catalogLabel(SETTLEMENT_CYCLE_LABELS, value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => {
        const color =
          status === DirectoryProfileStatus.ACTIVE
            ? 'success'
            : status === DirectoryProfileStatus.ARCHIVED
              ? 'default'
              : 'warning'
        return <Tag color={color}>{DIRECTORY_PROFILE_STATUS_LABELS[status] ?? status}</Tag>
      },
    },
    ...buildBusinessTimestampColumns<PartnerSummary>(),
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => {
        if (includeArchived && record.status === DirectoryProfileStatus.ARCHIVED) {
          return (
            <Button type="link" onClick={() => onRestore(record.id)}>
              恢复
            </Button>
          )
        }

        if (record.status === DirectoryProfileStatus.ARCHIVED) {
          return null
        }

        return (
          <Space>
            <Button type="link" onClick={() => onEdit(record)}>
              编辑
            </Button>
            <Button type="link" danger onClick={() => onArchive(record)}>
              删除
            </Button>
          </Space>
        )
      },
    },
  ]
}

export function PartnersPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<PartnerFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<PartnerSummary | null>(null)
  const [state, dispatch] = useReducer(partnersPageReducer, initialPartnersPageState)

  const { data: partnersResult, isLoading } = useQuery({
    queryKey: [
      'partners',
      state.search,
      state.partnerKindFilter,
      state.partnerTypeFilter,
      state.statusFilter,
      state.includeArchived,
      state.page,
      state.pageSize,
    ],
    queryFn: () =>
      listPartners({
        search: state.search || undefined,
        partnerKind: state.partnerKindFilter,
        partnerType: state.partnerTypeFilter,
        status: state.statusFilter,
        includeArchived: state.includeArchived,
        page: state.page,
        pageSize: state.pageSize,
      }),
  })

  const resetFilters = useCallback(() => {
    dispatch({ type: 'RESET_FILTERS' })
  }, [])

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditingPartner(null)
    form.resetFields()
  }

  const openCreateDrawer = () => {
    setEditingPartner(null)
    form.resetFields()
    setDrawerOpen(true)
  }

  const openEditDrawer = useCallback(
    (partner: PartnerSummary) => {
      setEditingPartner(() => partner)
      form.setFieldsValue(partnerToFormValues(partner))
      setDrawerOpen(true)
    },
    [form],
  )

  const saveMutation = useMutation({
    mutationFn: async (values: PartnerFormValues) => {
      if (editingPartner) {
        return updatePartner(editingPartner.id, buildUpdatePayload(values))
      }
      return createPartner(buildCreatePayload(values))
    },
    onSuccess: () => {
      message.success(editingPartner ? '合作伙伴已更新' : '合作伙伴已创建')
      closeDrawer()
      queryClient.invalidateQueries({ queryKey: ['partners'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: archivePartner,
    onSuccess: () => {
      message.success('合作伙伴已删除')
      queryClient.invalidateQueries({ queryKey: ['partners'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除失败')
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restorePartner,
    onSuccess: () => {
      message.success('合作伙伴已恢复')
      queryClient.invalidateQueries({ queryKey: ['partners'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '恢复失败')
    },
  })

  const handleArchive = useCallback(
    (partner: PartnerSummary) => {
      Modal.confirm({
        title: '确认删除合作伙伴？',
        content: `删除后「${partner.name}」将从默认列表中隐藏，可在「显示已归档」中恢复。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => archiveMutation.mutateAsync(partner.id),
      })
    },
    [archiveMutation],
  )

  const handleRestore = useCallback(
    (partnerId: string) => {
      restoreMutation.mutate(partnerId)
    },
    [restoreMutation],
  )

  const columns = useMemo(
    () => buildPartnerColumns(state.includeArchived, openEditDrawer, handleArchive, handleRestore),
    [handleArchive, handleRestore, openEditDrawer, state.includeArchived],
  )

  return (
    <div>
      <PageHeader
        title="合作伙伴管理"
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            创建合作伙伴
          </Button>
        }
      />

      <PartnerStatsCards summary={partnersResult?.summary} />

      <PartnerFilters
        key={state.filtersKey}
        partnerKindFilter={state.partnerKindFilter}
        partnerTypeFilter={state.partnerTypeFilter}
        statusFilter={state.statusFilter}
        includeArchived={state.includeArchived}
        onSearch={(value) => dispatch({ type: 'SET_SEARCH', value })}
        onPartnerKindChange={(value) => dispatch({ type: 'SET_PARTNER_KIND', value })}
        onPartnerTypeChange={(value) => dispatch({ type: 'SET_PARTNER_TYPE', value })}
        onStatusChange={(value) => dispatch({ type: 'SET_STATUS', value })}
        onIncludeArchivedChange={(value) => dispatch({ type: 'SET_INCLUDE_ARCHIVED', value })}
        onReset={resetFilters}
      />

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={partnersResult?.items ?? []}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: state.page,
            pageSize: state.pageSize,
            total: partnersResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              dispatch({ type: 'SET_PAGE', page: nextPage, pageSize: nextPageSize })
            },
          }}
        />
      </Card>

      <PartnerFormDrawer
        open={drawerOpen}
        editing={Boolean(editingPartner)}
        loading={saveMutation.isPending}
        form={form}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}
