/**
 * 团内增收记录页签 — 方案 A：顶部合计 + 表格 + 抽屉（ADR-0036）。
 * 筛选 / 列表快捷标记见后续票；本片只做 CRUD。
 */
import { useState } from 'react'
import {
  App,
  Button,
  Col,
  Empty,
  Flex,
  Form,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  DEPARTURE_INCOME_SETTLEMENT_COMPOSITE_LABELS,
  DEPARTURE_INCOME_TYPE_LABELS,
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
} from '@/services/income-record.service'
import { formatCents } from '../catalog'
import {
  IncomeRecordDrawer,
  type IncomeRecordFormValues,
} from './IncomeRecordDrawer'

type IncomeRecordsPanelProps = {
  departure: DepartureDetail
  mutationLocked: boolean
}

const COMPOSITE_COLORS: Record<DepartureIncomeSettlementComposite, string> = {
  [DepartureIncomeSettlementComposite.PENDING_SETTLE]: 'default',
  [DepartureIncomeSettlementComposite.PENDING_COMMISSION]: 'warning',
  [DepartureIncomeSettlementComposite.PENDING_COLLECT]: 'processing',
  [DepartureIncomeSettlementComposite.SETTLED]: 'success',
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

  const query = useQuery({
    queryKey: ['income-records', departure.id],
    queryFn: ({ signal }) => listIncomeRecords(departure.id, signal),
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

  const confirmDelete = (item: DepartureIncomeRecordSummary) => {
    const settled =
      item.incomeStatus === DepartureIncomeCollectionStatus.COLLECTED ||
      item.commissionStatus === DepartureIncomeCommissionStatus.PAID
    if (!settled) {
      deleteMutation.mutate(item)
      return
    }
    modal.confirm({
      title: '确认删除已有结算痕迹的增收记录？',
      content: '该记录收入已收或提成已付，删除后仅影响本团增收统计。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(item),
    })
  }

  const items = query.data?.items ?? []
  const amountTotal = query.data?.amountCentsTotal ?? 0
  const commissionTotal = query.data?.commissionCentsTotal ?? 0
  const companyTotal = query.data?.companyIncomeCentsTotal ?? 0

  const columns: TableColumnsType<DepartureIncomeRecordSummary> = [
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
      width: 140,
      fixed: 'right',
      render: (_value, record) =>
        mutationLocked ? (
          '-'
        ) : (
          <Space size={8}>
            <Button type="link" size="small" onClick={() => openEdit(record)}>
              编辑
            </Button>
            {record.incomeStatus === DepartureIncomeCollectionStatus.UNCOLLECTED &&
            record.commissionStatus === DepartureIncomeCommissionStatus.UNPAID ? (
              <Popconfirm
                title="确认删除该增收记录？"
                onConfirm={() => confirmDelete(record)}
              >
                <Button type="link" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            ) : (
              <Button type="link" size="small" danger onClick={() => confirmDelete(record)}>
                删除
              </Button>
            )}
          </Space>
        ),
    },
  ]

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
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Statistic title="增收金额合计" value={formatCents(amountTotal)} />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic title="导游提成合计" value={formatCents(commissionTotal)} />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic title="公司增收合计" value={formatCents(companyTotal)} />
        </Col>
      </Row>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          增收明细
        </Typography.Title>
        {mutationLocked ? null : (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增
          </Button>
        )}
      </Flex>
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
        scroll={{ x: 1100 }}
        locale={{
          emptyText: (
            <Empty description="暂无增收记录，可登记购物店返利、车销或自费返利等">
              {mutationLocked ? null : (
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
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
