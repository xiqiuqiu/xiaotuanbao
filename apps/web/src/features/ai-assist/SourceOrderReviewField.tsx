import { Alert, Button, Checkbox, Input, InputNumber, Select, Space, Table, Tag } from 'antd'
import styles from './SourceOrderReviewPanel.module.css'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  sourceOrderFareAdjustmentCandidateSchema,
  sourceOrderGuestCandidateSchema,
  type ReviewFieldDescriptor,
} from '@xiaotuanbao/ai-contracts'
import {
  DirectoryProfileStatus,
  FARE_ADJUSTMENT_KIND_CATALOG,
  FareAdjustmentDirection,
} from '@xiaotuanbao/shared'
import { getPartner, listPartners } from '@/services/partner.service'
import { FareAdjustmentsEditor } from '@/features/departure/components/SourceOrderDrawer'
import { formatCents, GUEST_GENDER_OPTIONS } from '@/features/departure/catalog'

export function SourceOrderReviewField({
  field,
  value,
  editing,
  onChange,
  onDraftPresenceChange,
}: {
  field: ReviewFieldDescriptor
  value: unknown
  editing: boolean
  onChange: (value: unknown) => void
  onDraftPresenceChange: (pending: boolean) => void
}) {
  if (field.key === 'partnerId')
    return <ReviewPartner value={value} editing={editing} onChange={onChange} />
  if (field.key === 'fareAdjustments')
    return (
      <ReviewAdjustments
        value={value}
        editing={editing}
        onChange={onChange}
        onDraftPresenceChange={onDraftPresenceChange}
      />
    )
  if (field.key === 'guests')
    return <ReviewGuests value={value} editing={editing} onChange={onChange} />
  if (!editing)
    return (
      <div>
        {typeof value === 'number' && field.key.endsWith('Cents')
          ? formatCents(value)
          : (field.options?.find((option) => option.value === value)?.label ?? field.format(value))}
      </div>
    )
  if (field.control === 'choice')
    return (
      <Select
        aria-label={field.label}
        allowClear
        value={typeof value === 'string' ? value : undefined}
        options={field.options?.map((option) => ({ ...option }))}
        onChange={(next) => onChange(next ?? null)}
        style={{ width: '100%' }}
      />
    )
  if (field.control === 'integer') {
    const money = field.key.endsWith('Cents')
    return (
      <InputNumber
        aria-label={field.label}
        min={0}
        precision={money ? 2 : 0}
        value={typeof value === 'number' ? value / (money ? 100 : 1) : null}
        suffix={money ? '元' : '人'}
        style={{ width: '100%' }}
        onChange={(next) =>
          onChange(next == null ? null : money ? Math.round(Number(next) * 100) : next)
        }
      />
    )
  }
  return (
    <Input
      aria-label={field.label}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value || null)}
    />
  )
}

function ReviewPartner({
  value,
  editing,
  onChange,
}: {
  value: unknown
  editing: boolean
  onChange: (value: unknown) => void
}) {
  const [search, setSearch] = useState('')
  const partner = useQuery({
    queryKey: ['review-partner', value],
    enabled: typeof value === 'string',
    queryFn: () => getPartner(String(value)),
  })
  const options = useQuery({
    queryKey: ['review-partner-options', search],
    enabled: editing,
    queryFn: () =>
      listPartners({
        search,
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 30,
      }),
  })
  if (!editing)
    return (
      <div>
        {value == null
          ? '未填写'
          : (partner.data?.name ?? (partner.isError ? '客户暂不可用，请重新选择' : '加载中…'))}
      </div>
    )
  const rows = new Map(
    (options.data?.items ?? []).map((row) => [row.id, { value: row.id, label: row.name }]),
  )
  if (partner.data)
    rows.set(partner.data.id, {
      value: partner.data.id,
      label: partner.data.name,
    })
  return (
    <>
      <Select
        aria-label="客户"
        showSearch={{ filterOption: false, onSearch: setSearch }}
        allowClear
        value={typeof value === 'string' ? value : undefined}
        options={[...rows.values()]}
        loading={options.isFetching || partner.isFetching}
        placeholder="搜索并选择客户"
        labelRender={({ label }) =>
          label ?? (partner.isError ? '客户暂不可用，请重新选择' : '加载客户…')
        }
        notFoundContent={
          options.isFetching
            ? '正在加载客户…'
            : options.isError
              ? '客户加载失败，请重试'
              : '未找到客户，请调整关键词或先维护合作伙伴档案'
        }
        onChange={(next) => onChange(next ?? null)}
        style={{ width: '100%' }}
      />
      {options.isError || partner.isError ? (
        <Alert
          type="error"
          showIcon
          title="客户加载失败"
          action={
            <Button
              onClick={() => {
                void options.refetch()
                if (typeof value === 'string') void partner.refetch()
              }}
            >
              重试
            </Button>
          }
        />
      ) : null}
    </>
  )
}

function ReviewAdjustments({
  value,
  editing,
  onChange,
  onDraftPresenceChange,
}: {
  value: unknown
  editing: boolean
  onChange: (value: unknown) => void
  onDraftPresenceChange: (pending: boolean) => void
}) {
  const parsed = sourceOrderFareAdjustmentCandidateSchema.array().safeParse(value)
  if (!editing) {
    if (!parsed.success || !parsed.data.length)
      return <div>{parsed.success ? '无团款调整' : '未填写'}</div>
    return (
      <Table
        size="small"
        pagination={false}
        dataSource={parsed.data.map((row, index) => ({ ...row, key: index }))}
        columns={[
          {
            title: '调整项目',
            key: 'kind',
            render: (_, row) =>
              row.customName ||
              FARE_ADJUSTMENT_KIND_CATALOG.find((entry) => entry.kind === row.kind)?.label,
          },
          {
            title: '金额',
            key: 'amount',
            align: 'right',
            render: (_, row) =>
              `${row.direction === 'decrease' ? '−' : '+'}${formatCents(row.amountCents)}`,
          },
        ]}
      />
    )
  }
  const rows = (parsed.success ? parsed.data : []).flatMap((row) => {
    const kind = FARE_ADJUSTMENT_KIND_CATALOG.find((entry) => entry.kind === row.kind)?.kind
    return kind
      ? [
          {
            kind,
            direction:
              row.direction === 'increase'
                ? FareAdjustmentDirection.INCREASE
                : FareAdjustmentDirection.DECREASE,
            amountYuan: row.amountCents / 100,
            customName: row.customName ?? undefined,
          },
        ]
      : []
  })
  return (
    <div className={styles.adjustments}>
      {value == null ? (
        <Button size="small" onClick={() => onChange([])}>
          确认无团款调整
        </Button>
      ) : null}
      <FareAdjustmentsEditor
        value={rows}
        lockAmounts={false}
        readOnly={false}
        adjustmentNetYuan={rows.reduce(
          (sum, row) => sum + (row.direction === 'decrease' ? -1 : 1) * row.amountYuan,
          0,
        )}
        onDraftPresenceChange={onDraftPresenceChange}
        onChange={(next) =>
          onChange(
            next.map((row) => ({
              kind: row.kind,
              direction: row.direction,
              amountCents: Math.round((row.amountYuan ?? 0) * 100),
              ...(row.customName ? { customName: row.customName } : {}),
            })),
          )
        }
      />
    </div>
  )
}

function ReviewGuests({
  value,
  editing,
  onChange,
}: {
  value: unknown
  editing: boolean
  onChange: (value: unknown) => void
}) {
  const parsed = sourceOrderGuestCandidateSchema.array().safeParse(value)
  const rows = parsed.success ? parsed.data : []
  if (!editing) {
    if (!rows.length) return <div>暂无名单，可稍后补充</div>
    return (
      <Table
        size="small"
        pagination={false}
        scroll={{ x: 480 }}
        dataSource={rows.map((row, index) => ({ ...row, key: index }))}
        columns={[
          {
            title: '姓名',
            dataIndex: 'name',
            render: (name) => name || '待补充',
          },
          {
            title: '手机',
            dataIndex: 'phone',
            render: (phone) => phone || '-',
          },
          {
            title: '性别',
            key: 'gender',
            render: (_, row) =>
              GUEST_GENDER_OPTIONS.find((option) => option.value === row.gender)?.label ?? '-',
          },
          {
            title: '录入状态',
            key: 'included',
            render: (_, row) => <Tag>{row.included === false ? '不录入' : '本次录入'}</Tag>,
          },
          {
            title: '备注',
            dataIndex: 'notes',
            render: (notes) => notes || '-',
          },
        ]}
      />
    )
  }
  return <ReviewGuestEditor initialRows={rows} onChange={onChange} />
}

function ReviewGuestEditor({
  initialRows,
  onChange,
}: {
  initialRows: Array<{
    name: string
    phone?: string | null
    gender?: 'male' | 'female' | 'unknown' | null
    notes?: string | null
    included?: boolean
  }>
  onChange: (value: unknown) => void
}) {
  const [rows, setRows] = useState(() =>
    initialRows.map((row) => ({ ...row, reviewKey: crypto.randomUUID() })),
  )
  const commit = (next: typeof rows) => {
    setRows(next)
    onChange(next.map(({ reviewKey: _key, ...row }) => row))
  }
  const update = (index: number, patch: Partial<(typeof rows)[number]>) =>
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      {rows.map((row, index) => (
        <Space orientation="vertical" key={row.reviewKey} style={{ width: '100%' }}>
          <Checkbox
            checked={row.included !== false}
            onChange={(event) => update(index, { included: event.target.checked })}
          >
            本次录入
          </Checkbox>
          <Input
            aria-label={`客人${index + 1}姓名`}
            placeholder="姓名"
            value={row.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <Input
            aria-label={`客人${index + 1}手机`}
            placeholder="手机（选填）"
            value={row.phone ?? ''}
            onChange={(event) => update(index, { phone: event.target.value || null })}
          />
          <Select
            aria-label={`客人${index + 1}性别`}
            allowClear
            placeholder="性别（选填）"
            value={row.gender ?? undefined}
            options={[...GUEST_GENDER_OPTIONS]}
            onChange={(next) => update(index, { gender: next ?? null })}
          />
          <Input
            aria-label={`客人${index + 1}备注`}
            placeholder="备注（选填）"
            value={row.notes ?? ''}
            onChange={(event) => update(index, { notes: event.target.value || null })}
          />
          <Button size="small" danger onClick={() => commit(rows.filter((_, i) => i !== index))}>
            移除这位客人
          </Button>
        </Space>
      ))}
      <Button
        size="small"
        onClick={() =>
          commit([...rows, { name: '', included: true, reviewKey: crypto.randomUUID() }])
        }
      >
        添加客人
      </Button>
    </Space>
  )
}
