/**
 * 团内增收记录页签 — 方案 A：筛选 + 表格（含表尾合计）+ 抽屉（ADR-0036）。
 * 列表快捷标记已收/已付经 PATCH，不提交应收/应付。
 */
import { useState } from 'react'
import {
  App,
  Button,
  Empty,
  Form,
  Space,
  Table,
  Typography,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  DepartureIncomeCollectionStatus,
  DepartureIncomeCommissionStatus,
  DepartureIncomeSettlementComposite,
  DepartureIncomeType,
  type DepartureIncomeRecordSummary,
  type DepartureDetail,
} from '@xiaotuanbao/shared'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import {
  createIncomeRecord,
  deleteIncomeRecord,
  listIncomeRecords,
  updateIncomeRecord,
  type ListIncomeRecordsParams,
} from '@/services/income-record.service'
import {
  buildIncomeRecordsColumns,
  INCOME_RECORDS_TABLE_SCROLL_X,
} from './income-records-columns'
import { IncomeRecordsFilters } from './IncomeRecordsFilters'
import { renderIncomeRecordsTableSummary } from './income-records-table-summary'
import {
  IncomeRecordDrawer,
  type IncomeRecordFormValues,
} from './IncomeRecordDrawer'

type IncomeRecordsPanelProps = {
  departure: DepartureDetail
  mutationLocked: boolean
}

export function IncomeRecordsPanel({
  departure,
  mutationLocked,
}: IncomeRecordsPanelProps) {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<IncomeRecordFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<DepartureIncomeRecordSummary | null>(null)
  const [typeDraft, setTypeDraft] = useState<DepartureIncomeType | 'all'>('all')
  const [compositeDraft, setCompositeDraft] = useState<
    DepartureIncomeSettlementComposite | 'all'
  >('all')
  const [keywordDraft, setKeywordDraft] = useState('')
  const [typeFilter, setTypeFilter] = useState<DepartureIncomeType | 'all'>('all')
  const [compositeFilter, setCompositeFilter] = useState<
    DepartureIncomeSettlementComposite | 'all'
  >('all')
  const [keyword, setKeyword] = useState('')

  const listParams: ListIncomeRecordsParams = {
    ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
    ...(compositeFilter !== 'all' ? { settlementComposite: compositeFilter } : {}),
    ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
  }

  const query = useQuery({
    queryKey: ['income-records', departure.id, listParams],
    queryFn: ({ signal }) => listIncomeRecords(departure.id, listParams, signal),
    ...operationalQueryOptions(),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['income-records', departure.id] })
    void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditing(null)
    form.resetFields()
  }

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({
      type: DepartureIncomeType.SHOPPING_REBATE,
      projectName: undefined,
      partnerSupplierId: undefined,
      occurredOn: dayjs(),
      amountYuan: undefined,
      guideSupplierId: departure.guideSupplierId ?? undefined,
      commissionYuan: 0,
      incomeStatus: DepartureIncomeCollectionStatus.UNCOLLECTED,
      commissionStatus: DepartureIncomeCommissionStatus.UNPAID,
      remark: undefined,
    })
    setDrawerOpen(true)
  }

  const openEdit = (item: DepartureIncomeRecordSummary) => {
    setEditing(item)
    form.setFieldsValue({
      type: item.type,
      projectName: item.projectName,
      partnerSupplierId: item.partnerSupplierId ?? undefined,
      occurredOn: dayjs(item.occurredOn),
      amountYuan: item.amountCents / 100,
      guideSupplierId: item.guideSupplierId ?? undefined,
      commissionYuan: item.commissionCents / 100,
      incomeStatus: item.incomeStatus,
      commissionStatus: item.commissionStatus,
      remark: item.remark ?? undefined,
    })
    setDrawerOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: (values: IncomeRecordFormValues) => {
      const payload = {
        type: values.type,
        projectName: values.projectName,
        partnerSupplierId: values.partnerSupplierId ?? null,
        occurredOn: values.occurredOn.format('YYYY-MM-DD'),
        amountCents: Math.round(values.amountYuan * 100),
        guideSupplierId: values.guideSupplierId ?? null,
        commissionCents: Math.round((values.commissionYuan ?? 0) * 100),
        incomeStatus: values.incomeStatus,
        commissionStatus: values.commissionStatus,
        remark: values.remark?.trim() ? values.remark.trim() : null,
      }
      return editing
        ? updateIncomeRecord(departure.id, editing.id, payload)
        : createIncomeRecord(departure.id, payload)
    },
    onSuccess: () => {
      message.success(editing ? '增收记录已更新' : '增收记录已添加')
      closeDrawer()
      refresh()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存增收记录失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (item: DepartureIncomeRecordSummary) =>
      deleteIncomeRecord(departure.id, item.id),
    onSuccess: () => {
      message.success('增收记录已删除')
      refresh()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除增收记录失败')
    },
  })

  const markMutation = useMutation({
    mutationFn: ({
      item,
      payload,
    }: {
      item: DepartureIncomeRecordSummary
      payload: {
        incomeStatus?: DepartureIncomeCollectionStatus
        commissionStatus?: DepartureIncomeCommissionStatus
      }
    }) => updateIncomeRecord(departure.id, item.id, payload),
    onSuccess: (_data, variables) => {
      message.success(
        variables.payload.incomeStatus != null ? '已标记已收' : '已标记已付',
      )
      refresh()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '标记失败')
    },
  })

  const confirmDelete = (item: DepartureIncomeRecordSummary) => {
    const settled =
      item.incomeStatus === DepartureIncomeCollectionStatus.COLLECTED ||
      item.commissionStatus === DepartureIncomeCommissionStatus.PAID
    modal.confirm({
      title: settled
        ? '确认删除已有结算痕迹的增收记录？'
        : '确认删除增收记录？',
      content: settled
        ? '该记录收入已收或提成已付，删除后仅影响本团增收统计。'
        : `将删除「${item.projectName}」，删除后不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(item),
    })
  }

  const items = query.data?.items ?? []

  const columns = buildIncomeRecordsColumns({
    mutationLocked,
    markPending: markMutation.isPending,
    onEdit: openEdit,
    onMarkCollected: (item) =>
      markMutation.mutate({
        item,
        payload: { incomeStatus: DepartureIncomeCollectionStatus.COLLECTED },
      }),
    onMarkPaid: (item) =>
      markMutation.mutate({
        item,
        payload: { commissionStatus: DepartureIncomeCommissionStatus.PAID },
      }),
    onDelete: confirmDelete,
  })

  const seedGuideOption = editing?.guideSupplierId && editing.guideSupplierName
    ? { id: editing.guideSupplierId, name: editing.guideSupplierName }
    : departure.guideSupplierId && departure.guideSupplierName
      ? { id: departure.guideSupplierId, name: departure.guideSupplierName }
      : null

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <StaleDataAlert
        isFetching={query.isFetching}
        isError={query.isError}
        hasData={Boolean(query.data)}
        onRefresh={() => void query.refetch()}
      />
      <IncomeRecordsFilters
        typeFilter={typeDraft}
        compositeFilter={compositeDraft}
        keyword={keywordDraft}
        onTypeChange={setTypeDraft}
        onCompositeChange={setCompositeDraft}
        onKeywordChange={setKeywordDraft}
        onApply={() => {
          setTypeFilter(typeDraft)
          setCompositeFilter(compositeDraft)
          setKeyword(keywordDraft.trim())
        }}
        onReset={() => {
          setTypeDraft('all')
          setCompositeDraft('all')
          setKeywordDraft('')
          setTypeFilter('all')
          setCompositeFilter('all')
          setKeyword('')
        }}
        extra={
          mutationLocked ? null : (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增
            </Button>
          )
        }
      />
      {mutationLocked ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          当前发团不可编辑，增收记录只读。
        </Typography.Paragraph>
      ) : null}
      <Table
        size="small"
        rowKey="id"
        loading={query.isLoading}
        columns={columns}
        dataSource={items}
        pagination={false}
        scroll={{ x: INCOME_RECORDS_TABLE_SCROLL_X }}
        summary={renderIncomeRecordsTableSummary}
        locale={{
          emptyText: (
            <Empty description="暂无增收记录，可登记购物店返利、车销或自费返利等">
              {mutationLocked ? null : (
                <Button icon={<PlusOutlined />} onClick={openCreate}>
                  新增增收记录
                </Button>
              )}
            </Empty>
          ),
        }}
      />
      <IncomeRecordDrawer
        open={drawerOpen}
        editing={editing != null}
        form={form}
        saving={saveMutation.isPending}
        seedGuideOption={seedGuideOption}
        seedPartnerOption={
          editing?.partnerSupplierId && editing.partnerSupplierName
            ? { id: editing.partnerSupplierId, name: editing.partnerSupplierName }
            : null
        }
        onClose={closeDrawer}
        onSave={() => {
          void form.validateFields().then((values) => saveMutation.mutate(values))
        }}
      />
    </Space>
  )
}
