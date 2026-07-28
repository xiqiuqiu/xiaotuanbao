import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { App, Button, Card, Form, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  buildCreatePayload,
  buildUpdatePayload,
  partnerToFormValues,
} from '../utils/partner-form'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditPartner } from '../utils/partner-permission'
import { PageHeader } from '@/layouts/PageHeader'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import {
  listSoftFetchingClassName,
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { buildPartnerColumns } from './partner-columns'

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

export function PartnersPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<PartnerFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<PartnerSummary | null>(null)
  const [state, dispatch] = useReducer(partnersPageReducer, initialPartnersPageState)
  const canEdit = canEditPartner(useAuthStore((s) => s.actionKeys))

  const listFilterKey = [
    state.search,
    state.partnerKindFilter,
    state.partnerTypeFilter,
    state.statusFilter,
    state.includeArchived,
  ].join('\0')
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const {
    data: partnersResult,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    isPlaceholderData,
    refetch,
  } = useQuery({
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
    queryFn: ({ signal }) =>
      listPartners(
        {
          search: state.search || undefined,
          partnerKind: state.partnerKindFilter,
          partnerType: state.partnerTypeFilter,
          status: state.statusFilter,
          includeArchived: state.includeArchived,
          page: state.page,
          pageSize: state.pageSize,
        },
        signal,
      ),
    placeholderData,
    ...operationalQueryOptions(),
  })

  useEffect(() => {
    commitListFilterKey(isSuccess, isPlaceholderData)
  }, [commitListFilterKey, isSuccess, isPlaceholderData])

  const { hardLoading, softFetching } = resolveListTableLoading({
    isLoading,
    isFetching,
    isPlaceholderData,
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
      modal.confirm({
        title: '确认删除合作伙伴？',
        content: `删除后「${partner.name}」将从默认列表中隐藏，可在「显示已归档」中恢复。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => archiveMutation.mutateAsync(partner.id),
      })
    },
    [archiveMutation, modal],
  )

  const handleRestore = useCallback(
    (partnerId: string) => {
      restoreMutation.mutate(partnerId)
    },
    [restoreMutation],
  )

  const columns = useMemo(
    () =>
      buildPartnerColumns(
        state.includeArchived,
        openEditDrawer,
        handleArchive,
        handleRestore,
        canEdit,
      ),
    [canEdit, handleArchive, handleRestore, openEditDrawer, state.includeArchived],
  )

  return (
    <div>
      <PageHeader
        title="合作伙伴管理"
        action={
          canEdit ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
              创建合作伙伴
            </Button>
          ) : undefined
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

      <StaleDataAlert
        isFetching={isFetching}
        isError={isError}
        hasData={Boolean(partnersResult)}
        onRefresh={() => {
          void refetch()
        }}
      />

      <Card>
        <Table
          rowKey="id"
          loading={hardLoading}
          columns={columns}
          dataSource={partnersResult?.items ?? []}
          scroll={{ x: 'max-content' }}
          className={listSoftFetchingClassName(softFetching)}
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
