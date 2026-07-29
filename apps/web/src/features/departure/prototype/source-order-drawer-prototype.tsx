/**
 * PROTOTYPE — 客源单抽屉：客人同屏 + 团款调整 UI + 是否加宽。
 *
 * Question: 客人信息录入/管理如何与客源单同画面？仅加宽抽屉够不够？
 * 团款调整：固定项目目录 + 一行式录入（项目｜方向｜说明｜金额）+ 行内保存/编辑 是否更清晰？
 *
 * Three variants via ?variant=A|B|C on departure detail (tab=sourceOrders):
 * - A 加宽纵排：Drawer 960，底部结算卡；客人页内编辑可折叠
 * - B 左右分栏：Drawer ~1100，左团款右客人
 * - C 页内工作台：不做抽屉，列表旁开工作区（主从）
 *
 * Throwaway. DEV only. No real mutations.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Button,
  Col,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd'
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  TeamOutlined,
  UpOutlined,
} from '@ant-design/icons'
import {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@xiaotuanbao/shared'
import {
  SOURCE_ORDER_COLLECTION_OPTIONS,
  SOURCE_ORDER_DISCOUNT_OPTIONS,
} from '../catalog'

export const SOURCE_ORDER_DRAWER_PROTOTYPE_VARIANTS = [
  { key: 'A', label: '加宽纵排+结算卡+页内客人' },
  { key: 'B', label: '左右分栏抽屉' },
  { key: 'C', label: '页内主从工作台' },
] as const

export type SourceOrderDrawerPrototypeKey =
  (typeof SOURCE_ORDER_DRAWER_PROTOTYPE_VARIANTS)[number]['key']

type MockGuest = {
  id: string
  name: string
  phone: string
  gender: string
  notes: string
}

/** PROTOTYPE fare kinds — 对齐客户「调整项目」表；仅保留「其他费用调整」，无「自定义」。 */
type PrototypeFareKind =
  | 'child_ticket_topup'
  | 'single_room_topup'
  | 'extended_stay'
  | 'ticket_discount_refund'
  | 'lodging_deduction'
  | 'other'

type MockFareRow = {
  id: string
  kind: PrototypeFareKind
  direction: 'increase' | 'decrease'
  /** 调整说明（客户自填；占位不入库） */
  note: string
  amountYuan: number
}

const MOCK_PARTNERS = [
  { value: 'p1', label: '杭州同行' },
  { value: 'p2', label: '苏州水乡地接社' },
]

const FARE_KIND_CATALOG: Array<{
  value: PrototypeFareKind
  label: string
  /** null = 其他费用调整，方向由用户选 */
  direction: 'increase' | 'decrease' | null
  placeholder: string
  noteRequired: boolean
}> = [
  {
    value: 'child_ticket_topup',
    label: '儿童门票补款',
    direction: 'increase',
    placeholder: '例如：2名儿童补门票',
    noteRequired: false,
  },
  {
    value: 'single_room_topup',
    label: '单房差补款',
    direction: 'increase',
    placeholder: '例如：1人单住',
    noteRequired: false,
  },
  {
    value: 'extended_stay',
    label: '续住费用',
    direction: 'increase',
    placeholder: '例如：续住1晚',
    noteRequired: false,
  },
  {
    value: 'ticket_discount_refund',
    label: '门票优惠退差',
    direction: 'decrease',
    placeholder: '例如：2名老人半票退差',
    noteRequired: false,
  },
  {
    value: 'lodging_deduction',
    label: '住宿费用扣减',
    direction: 'decrease',
    placeholder: '例如：不含末晚住宿',
    noteRequired: false,
  },
  {
    value: 'other',
    label: '其他费用调整',
    direction: null,
    placeholder: '请输入具体调整原因',
    noteRequired: true,
  },
]

const FARE_KIND_MAP = Object.fromEntries(
  FARE_KIND_CATALOG.map((item) => [item.value, item]),
) as Record<PrototypeFareKind, (typeof FARE_KIND_CATALOG)[number]>

const INITIAL_GUESTS: MockGuest[] = [
  { id: 'g1', name: '张三', phone: '13800000001', gender: '男', notes: '' },
  { id: 'g2', name: '李四', phone: '13800000002', gender: '女', notes: '素食' },
]

const INITIAL_FARES: MockFareRow[] = [
  {
    id: 'f1',
    kind: 'child_ticket_topup',
    direction: 'increase',
    note: '2名儿童补门票',
    amountYuan: 80,
  },
  {
    id: 'f2',
    kind: 'single_room_topup',
    direction: 'increase',
    note: '1人单住',
    amountYuan: 200,
  },
  {
    id: 'f3',
    kind: 'ticket_discount_refund',
    direction: 'decrease',
    note: '2名老人半票退差',
    amountYuan: 120,
  },
]

function fareKindLabel(kind: PrototypeFareKind) {
  return FARE_KIND_MAP[kind]?.label ?? kind
}

function createEmptyDraft(kind: PrototypeFareKind = 'child_ticket_topup'): MockFareRow {
  const meta = FARE_KIND_MAP[kind]
  return {
    id: `f-${Date.now()}`,
    kind,
    direction: meta.direction ?? 'increase',
    note: '',
    amountYuan: 0,
  }
}

function SectionTitle({
  title,
  extra,
  subtle = false,
}: {
  title: string
  extra?: ReactNode
  /** 次级标题（如「团款计价」）弱一档，主分区用默认醒目样式 */
  subtle?: boolean
}) {
  const { token } = theme.useToken()
  if (subtle) {
    return (
      <Flex justify="space-between" align="center" style={{ marginBottom: token.marginSM }}>
        <Typography.Text strong>{title}</Typography.Text>
        {extra}
      </Flex>
    )
  }
  return (
    <Flex
      justify="space-between"
      align="center"
      style={{ marginBottom: token.marginMD, marginTop: token.marginXXS }}
    >
      <Flex align="center" gap={token.marginSM}>
        <span
          aria-hidden
          style={{
            width: 3,
            height: 16,
            borderRadius: 2,
            background: token.colorPrimary,
            flexShrink: 0,
          }}
        />
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
      </Flex>
      {extra}
    </Flex>
  )
}

/** 一行式团款调整：项目｜方向｜调整说明｜金额｜操作；保存后只读，行内编辑。 */
function CompactFareTable({
  rows,
  onChange,
}: {
  rows: MockFareRow[]
  onChange: (next: MockFareRow[]) => void
}) {
  const { token } = theme.useToken()
  const [draft, setDraft] = useState<MockFareRow | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isNewDraft, setIsNewDraft] = useState(false)

  const net = rows.reduce(
    (sum, row) => sum + (row.direction === 'increase' ? row.amountYuan : -row.amountYuan),
    0,
  )

  const usedFixedKinds = new Set(
    rows
      .filter((row) => row.kind !== 'other' && row.id !== editingId)
      .map((row) => row.kind),
  )

  const kindOptions = FARE_KIND_CATALOG.map((item) => ({
    value: item.value,
    label: item.label,
    disabled: item.value !== 'other' && usedFixedKinds.has(item.value),
  }))

  const startAdd = () => {
    if (draft) {
      message.warning('请先保存或取消当前编辑行')
      return
    }
    const preferred =
      FARE_KIND_CATALOG.find(
        (item) => item.value !== 'other' && !usedFixedKinds.has(item.value),
      )?.value ?? 'other'
    setDraft(createEmptyDraft(preferred))
    setEditingId(null)
    setIsNewDraft(true)
  }

  const startEdit = (row: MockFareRow) => {
    if (draft) {
      message.warning('请先保存或取消当前编辑行')
      return
    }
    setDraft({ ...row })
    setEditingId(row.id)
    setIsNewDraft(false)
  }

  const cancelEdit = () => {
    setDraft(null)
    setEditingId(null)
    setIsNewDraft(false)
  }

  const applyKindToDraft = (kind: PrototypeFareKind) => {
    if (!draft) {
      return
    }
    const meta = FARE_KIND_MAP[kind]
    setDraft({
      ...draft,
      kind,
      direction: meta.direction ?? draft.direction,
    })
  }

  const saveDraft = () => {
    if (!draft) {
      return
    }
    const meta = FARE_KIND_MAP[draft.kind]
    if (!(draft.amountYuan > 0)) {
      message.error('调整金额必须大于 0')
      return
    }
    if (meta.noteRequired && !draft.note.trim()) {
      message.error('其他费用调整须填写调整说明')
      return
    }
    if (draft.kind !== 'other' && rows.some((item) => item.kind === draft.kind && item.id !== draft.id)) {
      message.error('该固定调整项目已存在')
      return
    }
    const cleaned: MockFareRow = {
      ...draft,
      note: draft.note.trim().slice(0, 30),
      direction: meta.direction ?? draft.direction,
    }
    if (isNewDraft) {
      onChange([...rows, cleaned])
    } else {
      onChange(rows.map((item) => (item.id === cleaned.id ? cleaned : item)))
    }
    cancelEdit()
  }

  const removeRow = (id: string) => {
    onChange(rows.filter((item) => item.id !== id))
    if (editingId === id) {
      cancelEdit()
    }
  }

  const headerCell: CSSProperties = {
    padding: `${token.paddingXS}px ${token.paddingSM}px`,
    fontSize: token.fontSizeSM,
    color: token.colorTextSecondary,
    background: token.colorFillAlter,
    fontWeight: 600,
    textAlign: 'left',
  }
  const bodyCell: CSSProperties = {
    padding: `${token.paddingXS}px ${token.paddingSM}px`,
    verticalAlign: 'middle',
  }

  const renderEditorRow = (value: MockFareRow) => {
    const meta = FARE_KIND_MAP[value.kind]
    const directionLocked = meta.direction != null
    return (
      <tr key={`edit-${value.id}`} style={{ background: token.colorPrimaryBg }}>
        <td style={{ ...bodyCell, width: 160 }}>
          <Select
            size="small"
            value={value.kind}
            options={kindOptions}
            style={{ width: '100%' }}
            onChange={(kind) => applyKindToDraft(kind)}
          />
        </td>
        <td style={{ ...bodyCell, width: 100 }}>
          <Select
            size="small"
            value={value.direction}
            disabled={directionLocked}
            options={[
              { value: 'increase', label: '增项' },
              { value: 'decrease', label: '减项' },
            ]}
            style={{ width: '100%' }}
            onChange={(direction) => setDraft({ ...value, direction })}
          />
        </td>
        <td style={bodyCell}>
          <Input
            size="small"
            maxLength={30}
            showCount
            placeholder={meta.placeholder}
            value={value.note}
            onChange={(event) => setDraft({ ...value, note: event.target.value })}
          />
        </td>
        <td style={{ ...bodyCell, width: 120 }}>
          <InputNumber
            size="small"
            min={0.01}
            precision={2}
            style={{ width: '100%' }}
            value={value.amountYuan || null}
            placeholder="金额"
            onChange={(amountYuan) =>
              setDraft({ ...value, amountYuan: Number(amountYuan) || 0 })
            }
          />
        </td>
        <td style={{ ...bodyCell, width: 120, whiteSpace: 'nowrap' }}>
          <Space size={0}>
            <Button type="link" size="small" onClick={saveDraft}>
              保存
            </Button>
            <Button type="link" size="small" onClick={cancelEdit}>
              取消
            </Button>
          </Space>
        </td>
      </tr>
    )
  }

  const renderViewRow = (row: MockFareRow, index: number) => (
    <tr
      key={row.id}
      style={{
        borderTop: index === 0 && !draft ? undefined : `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <td style={bodyCell}>{fareKindLabel(row.kind)}</td>
      <td style={bodyCell}>
        <Tag color={row.direction === 'increase' ? 'blue' : 'default'}>
          {row.direction === 'increase' ? '增项' : '减项'}
        </Tag>
      </td>
      <td style={bodyCell}>
        <Typography.Text type={row.note ? undefined : 'secondary'}>
          {row.note || '-'}
        </Typography.Text>
      </td>
      <td style={{ ...bodyCell, fontVariantNumeric: 'tabular-nums' }}>
        ¥{row.amountYuan.toFixed(2)}
      </td>
      <td style={{ ...bodyCell, width: 72, whiteSpace: 'nowrap' }}>
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="编辑调整项"
            onClick={() => startEdit(row)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label="删除调整项"
            onClick={() => removeRow(row.id)}
          />
        </Space>
      </td>
    </tr>
  )

  return (
    <div>
      <div
        style={{
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCell}>调整项目</th>
              <th style={headerCell}>方向</th>
              <th style={headerCell}>调整说明</th>
              <th style={headerCell}>金额</th>
              <th style={headerCell}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !draft ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ ...bodyCell, color: token.colorTextSecondary, textAlign: 'center' }}
                >
                  暂无调整项
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) =>
              editingId === row.id && draft ? renderEditorRow(draft) : renderViewRow(row, index),
            )}
            {isNewDraft && draft ? renderEditorRow(draft) : null}
          </tbody>
        </table>
      </div>
      <Flex justify="space-between" align="center" style={{ marginTop: token.marginSM }}>
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={startAdd}
          disabled={Boolean(draft)}
        >
          添加调整项
        </Button>
        <Typography.Text type="secondary">
          调整净额{' '}
          <Typography.Text strong>
            {net >= 0 ? '+' : ''}¥{net.toFixed(2)}
          </Typography.Text>
        </Typography.Text>
      </Flex>
    </div>
  )
}

/** 一行式客人名单：参考团款调整 — 保存后只读，行内编辑/添加。 */
function CompactGuestTable({
  guests,
  onChange,
}: {
  guests: MockGuest[]
  onChange: (next: MockGuest[]) => void
}) {
  const { token } = theme.useToken()
  const [draft, setDraft] = useState<MockGuest | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isNewDraft, setIsNewDraft] = useState(false)

  const headerCell: CSSProperties = {
    padding: `${token.paddingXS}px ${token.paddingSM}px`,
    fontSize: token.fontSizeSM,
    color: token.colorTextSecondary,
    background: token.colorFillAlter,
    fontWeight: 600,
    textAlign: 'left',
  }
  const bodyCell: CSSProperties = {
    padding: `${token.paddingXS}px ${token.paddingSM}px`,
    verticalAlign: 'middle',
  }

  const startAdd = () => {
    if (draft) {
      message.warning('请先保存或取消当前编辑行')
      return
    }
    setDraft({
      id: `g-${Date.now()}`,
      name: '',
      phone: '',
      gender: '未知',
      notes: '',
    })
    setEditingId(null)
    setIsNewDraft(true)
  }

  const startEdit = (row: MockGuest) => {
    if (draft) {
      message.warning('请先保存或取消当前编辑行')
      return
    }
    setDraft({ ...row })
    setEditingId(row.id)
    setIsNewDraft(false)
  }

  const cancelEdit = () => {
    setDraft(null)
    setEditingId(null)
    setIsNewDraft(false)
  }

  const saveDraft = () => {
    if (!draft) {
      return
    }
    if (!draft.name.trim()) {
      message.error('请填写姓名')
      return
    }
    const cleaned: MockGuest = {
      ...draft,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      notes: draft.notes.trim(),
    }
    if (isNewDraft) {
      onChange([...guests, cleaned])
    } else {
      onChange(guests.map((item) => (item.id === cleaned.id ? cleaned : item)))
    }
    cancelEdit()
  }

  const removeRow = (id: string) => {
    onChange(guests.filter((item) => item.id !== id))
    if (editingId === id) {
      cancelEdit()
    }
  }

  const renderEditorRow = (value: MockGuest) => (
    <tr key={`edit-${value.id}`} style={{ background: token.colorPrimaryBg }}>
      <td style={{ ...bodyCell, width: 120 }}>
        <Input
          size="small"
          placeholder="姓名"
          value={value.name}
          onChange={(event) => setDraft({ ...value, name: event.target.value })}
        />
      </td>
      <td style={{ ...bodyCell, width: 140 }}>
        <Input
          size="small"
          placeholder="手机"
          value={value.phone}
          onChange={(event) => setDraft({ ...value, phone: event.target.value })}
        />
      </td>
      <td style={{ ...bodyCell, width: 96 }}>
        <Select
          size="small"
          value={value.gender}
          style={{ width: '100%' }}
          options={[
            { value: '男', label: '男' },
            { value: '女', label: '女' },
            { value: '未知', label: '未知' },
          ]}
          onChange={(gender) => setDraft({ ...value, gender })}
        />
      </td>
      <td style={bodyCell}>
        <Input
          size="small"
          placeholder="备注（选填）"
          value={value.notes}
          onChange={(event) => setDraft({ ...value, notes: event.target.value })}
        />
      </td>
      <td style={{ ...bodyCell, width: 120, whiteSpace: 'nowrap' }}>
        <Space size={0}>
          <Button type="link" size="small" onClick={saveDraft}>
            保存
          </Button>
          <Button type="link" size="small" onClick={cancelEdit}>
            取消
          </Button>
        </Space>
      </td>
    </tr>
  )

  const renderViewRow = (row: MockGuest, index: number) => (
    <tr
      key={row.id}
      style={{
        borderTop: index === 0 && !draft ? undefined : `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <td style={bodyCell}>{row.name || '-'}</td>
      <td style={bodyCell}>{row.phone || '-'}</td>
      <td style={bodyCell}>{row.gender || '-'}</td>
      <td style={bodyCell}>
        <Typography.Text type={row.notes ? undefined : 'secondary'}>
          {row.notes || '-'}
        </Typography.Text>
      </td>
      <td style={{ ...bodyCell, width: 72, whiteSpace: 'nowrap' }}>
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="编辑客人"
            onClick={() => startEdit(row)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label="删除客人"
            onClick={() => removeRow(row.id)}
          />
        </Space>
      </td>
    </tr>
  )

  return (
    <div>
      <div
        style={{
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCell}>姓名</th>
              <th style={headerCell}>手机</th>
              <th style={headerCell}>性别</th>
              <th style={headerCell}>备注</th>
              <th style={headerCell}>操作</th>
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 && !draft ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ ...bodyCell, color: token.colorTextSecondary, textAlign: 'center' }}
                >
                  暂无客人
                </td>
              </tr>
            ) : null}
            {guests.map((row, index) =>
              editingId === row.id && draft ? renderEditorRow(draft) : renderViewRow(row, index),
            )}
            {isNewDraft && draft ? renderEditorRow(draft) : null}
          </tbody>
        </table>
      </div>
      <Button
        type="dashed"
        size="small"
        icon={<PlusOutlined />}
        style={{ marginTop: token.marginSM }}
        onClick={startAdd}
        disabled={Boolean(draft)}
      >
        添加客人
      </Button>
    </div>
  )
}

/** B/C 仍用简单可编辑表；A 用 CompactGuestTable */
function GuestTableEditor({
  guests,
  onChange,
  dense,
}: {
  guests: MockGuest[]
  onChange: (next: MockGuest[]) => void
  dense?: boolean
}) {
  return (
    <Table
      size={dense ? 'small' : 'middle'}
      rowKey="id"
      pagination={false}
      dataSource={guests}
      columns={[
        {
          title: '姓名',
          dataIndex: 'name',
          render: (value: string, record) => (
            <Input
              size="small"
              value={value}
              onChange={(event) =>
                onChange(
                  guests.map((item) =>
                    item.id === record.id ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
          ),
        },
        {
          title: '手机',
          dataIndex: 'phone',
          width: 140,
          render: (value: string, record) => (
            <Input
              size="small"
              value={value}
              onChange={(event) =>
                onChange(
                  guests.map((item) =>
                    item.id === record.id ? { ...item, phone: event.target.value } : item,
                  ),
                )
              }
            />
          ),
        },
        {
          title: '性别',
          dataIndex: 'gender',
          width: 96,
          render: (value: string, record) => (
            <Select
              size="small"
              value={value}
              style={{ width: '100%' }}
              options={[
                { value: '男', label: '男' },
                { value: '女', label: '女' },
                { value: '未知', label: '未知' },
              ]}
              onChange={(gender) =>
                onChange(
                  guests.map((item) => (item.id === record.id ? { ...item, gender } : item)),
                )
              }
            />
          ),
        },
        {
          title: '操作',
          width: 72,
          render: (_: unknown, record) => (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => onChange(guests.filter((item) => item.id !== record.id))}
            >
              删
            </Button>
          ),
        },
      ]}
      footer={() => (
        <Button
          type="dashed"
          block
          icon={<PlusOutlined />}
          onClick={() =>
            onChange([
              ...guests,
              {
                id: `g-${Date.now()}`,
                name: '',
                phone: '',
                gender: '未知',
                notes: '',
              },
            ])
          }
        >
          添加客人
        </Button>
      )}
    />
  )
}

function OrderBasicsForm({
  adultGuestCount,
  childGuestCount,
  adultUnitPriceYuan,
  childUnitPriceYuan,
  onAdultGuestCountChange,
  onChildGuestCountChange,
  onAdultUnitPriceYuanChange,
  onChildUnitPriceYuanChange,
}: {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceYuan: number
  childUnitPriceYuan: number
  onAdultGuestCountChange: (value: number) => void
  onChildGuestCountChange: (value: number) => void
  onAdultUnitPriceYuanChange: (value: number) => void
  onChildUnitPriceYuanChange: (value: number) => void
}) {
  const { token } = theme.useToken()
  const totalGuests = adultGuestCount + childGuestCount
  const grossYuan = adultGuestCount * adultUnitPriceYuan + childGuestCount * childUnitPriceYuan
  const grossText = `¥${grossYuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

  return (
    <>
      <SectionTitle title="基础信息" />
      <Form layout="vertical" requiredMark>
        <Form.Item label="客户名称" required style={{ marginBottom: token.marginMD }}>
          <Select options={MOCK_PARTNERS} defaultValue="p1" />
        </Form.Item>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item
              label="成人人数"
              required
              rules={[{ required: true, message: '请输入成人人数' }]}
              style={{ marginBottom: token.marginMD }}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={0}
                value={adultGuestCount}
                onChange={(value) => onAdultGuestCountChange(Number(value) || 0)}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="儿童人数" style={{ marginBottom: token.marginMD }}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={0}
                value={childGuestCount}
                onChange={(value) => onChildGuestCountChange(Number(value) || 0)}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="合计人数" style={{ marginBottom: token.marginMD }}>
              <Input disabled value={`${totalGuests} 人`} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item
              label="成人单价"
              required
              rules={[{ required: true, message: '请输入成人团款单价' }]}
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                value={adultUnitPriceYuan}
                onChange={(value) => onAdultUnitPriceYuanChange(Number(value) || 0)}
                addonAfter="元"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="儿童单价" style={{ marginBottom: 0 }}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                value={childUnitPriceYuan}
                onChange={(value) => onChildUnitPriceYuanChange(Number(value) || 0)}
                addonAfter="元"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="原始团款" style={{ marginBottom: 0 }}>
              <Input
                disabled
                value={grossText}
                styles={{
                  input: {
                    color: token.colorText,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  },
                }}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </>
  )
}

/** 团款优惠 — 对齐现网 SourceOrderDrawer「优惠」段 */
function DiscountSection({
  discountType,
  discountYuan,
  discountNotes,
  onDiscountTypeChange,
  onDiscountYuanChange,
  onDiscountNotesChange,
}: {
  discountType: SourceOrderDiscountType
  discountYuan: number
  discountNotes: string
  onDiscountTypeChange: (value: SourceOrderDiscountType) => void
  onDiscountYuanChange: (value: number) => void
  onDiscountNotesChange: (value: string) => void
}) {
  const { token } = theme.useToken()
  return (
    <Form layout="vertical" requiredMark={false}>
      <SectionTitle title="团款优惠" />
      <Row gutter={12}>
        <Col span={discountType === SourceOrderDiscountType.LUMP_SUM ? 12 : 24}>
          <Form.Item label="优惠方式" style={{ marginBottom: token.marginSM }}>
            <Select
              options={[...SOURCE_ORDER_DISCOUNT_OPTIONS]}
              value={discountType}
              onChange={onDiscountTypeChange}
            />
          </Form.Item>
        </Col>
        {discountType === SourceOrderDiscountType.LUMP_SUM ? (
          <Col span={12}>
            <Form.Item label="优惠金额" style={{ marginBottom: token.marginSM }}>
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                value={discountYuan}
                onChange={(value) => onDiscountYuanChange(Number(value) || 0)}
                addonAfter="元"
              />
            </Form.Item>
          </Col>
        ) : null}
      </Row>
      <Form.Item label="优惠备注" style={{ marginBottom: 0 }}>
        <Input.TextArea
          rows={2}
          placeholder="请输入优惠相关备注（选填）"
          value={discountNotes}
          onChange={(event) => onDiscountNotesChange(event.target.value)}
        />
      </Form.Item>
    </Form>
  )
}

/** 收款信息 — 对齐现网 SourceOrderDrawer「收款信息」段 */
function CollectionSection({
  collectionMode,
  depositYuan,
  balanceYuan,
  settlementNotes,
  onCollectionModeChange,
  onDepositYuanChange,
  onBalanceYuanChange,
  onSettlementNotesChange,
}: {
  collectionMode: SourceOrderCollectionMode
  depositYuan: number
  balanceYuan: number
  settlementNotes: string
  onCollectionModeChange: (value: SourceOrderCollectionMode) => void
  onDepositYuanChange: (value: number) => void
  onBalanceYuanChange: (value: number) => void
  onSettlementNotesChange: (value: string) => void
}) {
  const { token } = theme.useToken()
  const showDepositBalance =
    collectionMode === SourceOrderCollectionMode.GUEST_ONLY ||
    collectionMode === SourceOrderCollectionMode.SPLIT

  return (
    <Form layout="vertical" requiredMark={false}>
      <SectionTitle title="收款信息" />
      <Form.Item label="收款方式" style={{ marginBottom: token.marginSM }}>
        <Select
          options={[...SOURCE_ORDER_COLLECTION_OPTIONS]}
          value={collectionMode}
          onChange={onCollectionModeChange}
        />
      </Form.Item>
      {showDepositBalance ? (
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              label={
                collectionMode === SourceOrderCollectionMode.SPLIT
                  ? '客户已收定金（元）'
                  : '定金（元）'
              }
              style={{ marginBottom: token.marginSM }}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                value={depositYuan}
                onChange={(value) => onDepositYuanChange(Number(value) || 0)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label={
                collectionMode === SourceOrderCollectionMode.SPLIT
                  ? '我方代收尾款（元）'
                  : '尾款（元）'
              }
              style={{ marginBottom: token.marginSM }}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                value={balanceYuan}
                onChange={(value) => onBalanceYuanChange(Number(value) || 0)}
              />
            </Form.Item>
          </Col>
        </Row>
      ) : null}
      <Form.Item label="结算说明" style={{ marginBottom: 0 }}>
        <Input.TextArea
          rows={2}
          placeholder="请输入结算说明（选填）"
          value={settlementNotes}
          onChange={(event) => onSettlementNotesChange(event.target.value)}
        />
      </Form.Item>
    </Form>
  )
}

function FooterActions({ onClose }: { onClose: () => void }) {
  return (
    <Flex justify="flex-end">
      <Space>
        <Button onClick={onClose}>取消</Button>
        <Button>保存并生成应收</Button>
        <Button type="primary">保存</Button>
      </Space>
    </Flex>
  )
}

function formatYuanPlain(yuan: number) {
  return `¥${yuan.toFixed(2)}`
}

function InlineMetric({
  label,
  value,
  size = 'sm',
}: {
  label: string
  value: string
  size?: 'sm' | 'md'
}) {
  const { token } = theme.useToken()
  const fontSize = size === 'md' ? token.fontSize : token.fontSizeSM
  return (
    <Typography.Text style={{ fontSize, whiteSpace: 'nowrap' }}>
      <Typography.Text type="secondary" style={{ fontSize }}>
        {label}{' '}
      </Typography.Text>
      <Typography.Text
        style={{
          color: token.colorText,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          fontSize,
        }}
      >
        {value}
      </Typography.Text>
    </Typography.Text>
  )
}

function Dot({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { token } = theme.useToken()
  return (
    <Typography.Text
      type="secondary"
      style={{
        fontSize: size === 'md' ? token.fontSize : token.fontSizeSM,
        userSelect: 'none',
      }}
    >
      ·
    </Typography.Text>
  )
}

function PreviewLine({
  title,
  primary = false,
  children,
}: {
  title: string
  primary?: boolean
  children: ReactNode
}) {
  const { token } = theme.useToken()
  return (
    <Flex
      wrap="wrap"
      gap={token.marginSM}
      align="center"
      style={{ opacity: primary ? 1 : 0.88 }}
    >
      <Typography.Text
        strong={primary}
        style={{
          width: 64,
          flexShrink: 0,
          fontSize: primary ? token.fontSize : token.fontSizeSM,
          color: primary ? token.colorText : token.colorTextSecondary,
        }}
      >
        {title}
      </Typography.Text>
      {children}
    </Flex>
  )
}

/** 底部结算预览 — 轻量分层：主行更醒目，辅行稍弱，右侧结算强调 */
function SettlementPreviewCard({
  grossYuan,
  adjustmentNetYuan,
  discountYuan,
  settlementYuan,
  collectionMode,
  depositYuan,
  balanceYuan,
}: {
  grossYuan: number
  adjustmentNetYuan: number
  discountYuan: number
  settlementYuan: number
  collectionMode: SourceOrderCollectionMode
  depositYuan: number
  balanceYuan: number
}) {
  const { token } = theme.useToken()
  const signedAdj =
    adjustmentNetYuan >= 0
      ? `+${formatYuanPlain(adjustmentNetYuan)}`
      : `-${formatYuanPlain(Math.abs(adjustmentNetYuan))}`

  const guestCollectYuan =
    collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED
      ? 0
      : collectionMode === SourceOrderCollectionMode.SPLIT
        ? balanceYuan
        : depositYuan + balanceYuan
  const partnerCollectedYuan =
    collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED
      ? settlementYuan
      : collectionMode === SourceOrderCollectionMode.SPLIT
        ? depositYuan
        : 0
  const customerTopUpYuan = Math.max(0, settlementYuan - guestCollectYuan)
  const rebateYuan = Math.max(0, guestCollectYuan - settlementYuan)

  const collectionLine =
    collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED ? (
      <InlineMetric
        label="客户已收"
        value={`${formatYuanPlain(partnerCollectedYuan)}（全部客户结算）`}
      />
    ) : collectionMode === SourceOrderCollectionMode.GUEST_ONLY ? (
      <>
        <InlineMetric label="代收定金" value={formatYuanPlain(depositYuan)} />
        <Dot />
        <InlineMetric label="代收尾款" value={formatYuanPlain(balanceYuan)} />
        <Dot />
        <InlineMetric label="我方代收" value={formatYuanPlain(guestCollectYuan)} />
      </>
    ) : (
      <>
        <InlineMetric label="客户定金" value={formatYuanPlain(depositYuan)} />
        <Dot />
        <InlineMetric label="我方尾款" value={formatYuanPlain(balanceYuan)} />
      </>
    )

  const diffLine =
    collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED ? (
      <Typography.Text style={{ fontSize: token.fontSizeSM, color: token.colorText }}>
        无补款返利
      </Typography.Text>
    ) : (
      <>
        <InlineMetric label="客户补款" value={formatYuanPlain(customerTopUpYuan)} />
        <Dot />
        <InlineMetric label="预计返利" value={formatYuanPlain(rebateYuan)} />
      </>
    )

  return (
    <div
      style={{
        padding: `${token.paddingSM}px ${token.paddingMD}px`,
        background: token.colorFillAlter,
        borderRadius: token.borderRadiusLG,
      }}
    >
      <Flex justify="space-between" align="center" gap={token.marginLG} wrap="wrap">
        <Flex vertical gap={8} style={{ flex: 1, minWidth: 280 }}>
          <PreviewLine title="团款结算" primary>
            <InlineMetric size="md" label="原始团款" value={formatYuanPlain(grossYuan)} />
            <Dot size="md" />
            <InlineMetric size="md" label="调整净额" value={signedAdj} />
            <Dot size="md" />
            <InlineMetric
              size="md"
              label="团款优惠"
              value={`−${formatYuanPlain(discountYuan)}`}
            />
          </PreviewLine>
          <PreviewLine title="代收约定">{collectionLine}</PreviewLine>
          <PreviewLine title="预计差额">{diffLine}</PreviewLine>
        </Flex>

        <div
          style={{
            flexShrink: 0,
            padding: `${token.paddingXS}px ${token.paddingMD}px`,
            borderRadius: token.borderRadiusLG,
            background: token.colorPrimaryBg,
            textAlign: 'right',
            minWidth: 128,
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            结算金额
          </Typography.Text>
          <Typography.Text
            strong
            style={{
              display: 'block',
              marginTop: 2,
              fontSize: 22,
              lineHeight: 1.25,
              color: token.colorPrimary,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatYuanPlain(settlementYuan)}
          </Typography.Text>
        </div>
      </Flex>
    </div>
  )
}

function DrawerFooterWithSettlement({
  onClose,
  grossYuan,
  settlementYuan,
  adjustmentNetYuan,
  discountYuan,
  collectionMode,
  depositYuan,
  balanceYuan,
}: {
  onClose: () => void
  grossYuan: number
  settlementYuan: number
  adjustmentNetYuan: number
  discountYuan: number
  collectionMode: SourceOrderCollectionMode
  depositYuan: number
  balanceYuan: number
}) {
  const { token } = theme.useToken()
  return (
    <Flex vertical gap={token.marginSM} style={{ width: '100%' }}>
      <SettlementPreviewCard
        grossYuan={grossYuan}
        adjustmentNetYuan={adjustmentNetYuan}
        discountYuan={discountYuan}
        settlementYuan={settlementYuan}
        collectionMode={collectionMode}
        depositYuan={depositYuan}
        balanceYuan={balanceYuan}
      />
      <FooterActions onClose={onClose} />
    </Flex>
  )
}

function GuestCountBadge({
  recorded,
  planned,
}: {
  recorded: number
  planned: number
}) {
  const { token } = theme.useToken()
  const matched = recorded === planned
  const short = recorded < planned
  const recordedColor = matched
    ? token.colorSuccess
    : short
      ? token.colorWarning
      : token.colorText

  return (
    <Flex
      align="center"
      gap={token.marginXS}
      style={{
        paddingInline: token.paddingSM,
        paddingBlock: 2,
        borderRadius: token.borderRadiusSM,
        background: token.colorFillAlter,
      }}
    >
      <TeamOutlined style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }} />
      <Typography.Text style={{ fontSize: token.fontSizeSM, lineHeight: 1.5 }}>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          已录{' '}
        </Typography.Text>
        <Typography.Text
          strong
          style={{
            fontSize: token.fontSizeSM,
            color: recordedColor,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {recorded}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {' '}
          · 计划{' '}
        </Typography.Text>
        <Typography.Text
          style={{
            fontSize: token.fontSizeSM,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {planned}
        </Typography.Text>
      </Typography.Text>
    </Flex>
  )
}

function GuestCollapsedSummary({
  guests,
  onExpand,
}: {
  guests: MockGuest[]
  onExpand: () => void
}) {
  const { token } = theme.useToken()
  const visible = guests.slice(0, 6)
  const overflow = guests.length - visible.length

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="展开客人名单"
      onClick={onExpand}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onExpand()
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: token.marginXS,
        minHeight: 40,
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
        cursor: 'pointer',
      }}
    >
      {guests.length === 0 ? (
        <Typography.Text type="secondary">暂无客人</Typography.Text>
      ) : (
        <>
          {visible.map((guest) => (
            <Tag key={guest.id} style={{ marginInlineEnd: 0 }}>
              {guest.name.trim() || '未填姓名'}
            </Tag>
          ))}
          {overflow > 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              +{overflow}
            </Typography.Text>
          ) : null}
        </>
      )}
    </div>
  )
}

function usePrototypeModel() {
  const [guests, setGuests] = useState(INITIAL_GUESTS)
  const [fares, setFares] = useState(INITIAL_FARES)
  const [adultGuestCount, setAdultGuestCount] = useState(2)
  const [childGuestCount, setChildGuestCount] = useState(0)
  const [adultUnitPriceYuan, setAdultUnitPriceYuan] = useState(1800)
  const [childUnitPriceYuan, setChildUnitPriceYuan] = useState(0)
  const [discountType, setDiscountType] = useState<SourceOrderDiscountType>(
    SourceOrderDiscountType.LUMP_SUM,
  )
  const [discountYuan, setDiscountYuan] = useState(100)
  const [discountNotes, setDiscountNotes] = useState('')
  const [collectionMode, setCollectionMode] = useState<SourceOrderCollectionMode>(
    SourceOrderCollectionMode.SPLIT,
  )
  const [depositYuan, setDepositYuan] = useState(1000)
  const [balanceYuan, setBalanceYuan] = useState(2700)
  const [settlementNotes, setSettlementNotes] = useState('')

  const plannedGuestCount = adultGuestCount + childGuestCount
  const grossYuan = adultGuestCount * adultUnitPriceYuan + childGuestCount * childUnitPriceYuan

  const adjustmentNetYuan = useMemo(
    () =>
      fares.reduce(
        (sum, row) => sum + (row.direction === 'increase' ? row.amountYuan : -row.amountYuan),
        0,
      ),
    [fares],
  )

  const effectiveDiscountYuan =
    discountType === SourceOrderDiscountType.LUMP_SUM ? discountYuan : 0

  const settlementYuan = useMemo(() => {
    return Math.max(0, grossYuan + adjustmentNetYuan - effectiveDiscountYuan)
  }, [grossYuan, adjustmentNetYuan, effectiveDiscountYuan])

  return {
    guests,
    setGuests,
    fares,
    setFares,
    adultGuestCount,
    setAdultGuestCount,
    childGuestCount,
    setChildGuestCount,
    adultUnitPriceYuan,
    setAdultUnitPriceYuan,
    childUnitPriceYuan,
    setChildUnitPriceYuan,
    plannedGuestCount,
    grossYuan,
    discountType,
    setDiscountType,
    discountYuan,
    setDiscountYuan,
    discountNotes,
    setDiscountNotes,
    collectionMode,
    setCollectionMode,
    depositYuan,
    setDepositYuan,
    balanceYuan,
    setBalanceYuan,
    settlementNotes,
    setSettlementNotes,
    adjustmentNetYuan,
    effectiveDiscountYuan,
    settlementYuan,
  }
}

const VARIANT_A_SECTIONS = [
  { key: 'basics', label: '基础信息' },
  { key: 'fare', label: '团款调整' },
  { key: 'discount', label: '团款优惠' },
  { key: 'collection', label: '收款信息' },
  { key: 'guests', label: '客人名单' },
] as const

type VariantASectionKey = (typeof VARIANT_A_SECTIONS)[number]['key']

function sectionDomId(key: VariantASectionKey) {
  return `proto-so-section-${key}`
}

/** 顶部锚点 Tab：点击滚到区块；滚动时高亮当前段 */
function FormSectionNav({
  activeKey,
  onChange,
}: {
  activeKey: VariantASectionKey
  onChange: (key: VariantASectionKey) => void
}) {
  const { token } = theme.useToken()
  return (
    <div
      style={{
        position: 'sticky',
        top: -token.paddingLG,
        zIndex: 5,
        marginTop: -token.paddingXS,
        marginBottom: token.marginMD,
        paddingTop: token.paddingXS,
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Tabs
        size="small"
        activeKey={activeKey}
        items={VARIANT_A_SECTIONS.map((item) => ({
          key: item.key,
          label: item.label,
        }))}
        onChange={(key) => onChange(key as VariantASectionKey)}
        tabBarStyle={{ marginBottom: 0 }}
      />
    </div>
  )
}

function SectionBlock({
  id,
  children,
}: {
  id: VariantASectionKey
  children: ReactNode
}) {
  const { token } = theme.useToken()
  return (
    <div
      id={sectionDomId(id)}
      style={{
        // 给吸顶 Tab 留出落点，避免标题被挡住
        scrollMarginTop: token.paddingXL + token.paddingLG,
      }}
    >
      {children}
    </div>
  )
}

/** A — 加宽纵排：底部结算卡 + 客人页内一行式编辑（可折叠） */
export function VariantA({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = theme.useToken()
  const model = usePrototypeModel()
  const {
    guests,
    setGuests,
    fares,
    setFares,
    adultGuestCount,
    setAdultGuestCount,
    childGuestCount,
    setChildGuestCount,
    adultUnitPriceYuan,
    setAdultUnitPriceYuan,
    childUnitPriceYuan,
    setChildUnitPriceYuan,
    plannedGuestCount,
    grossYuan,
    discountType,
    setDiscountType,
    discountYuan,
    setDiscountYuan,
    discountNotes,
    setDiscountNotes,
    collectionMode,
    setCollectionMode,
    depositYuan,
    setDepositYuan,
    balanceYuan,
    setBalanceYuan,
    settlementNotes,
    setSettlementNotes,
    adjustmentNetYuan,
    effectiveDiscountYuan,
    settlementYuan,
  } = model
  const [guestsExpanded, setGuestsExpanded] = useState(true)
  const [activeSection, setActiveSection] = useState<VariantASectionKey>('basics')
  const scrollingByTabRef = useRef(false)
  const width = 960

  const handleClose = () => {
    onClose()
  }

  const scrollToSection = (key: VariantASectionKey) => {
    setActiveSection(key)
    if (key === 'guests') {
      setGuestsExpanded(true)
    }
    scrollingByTabRef.current = true
    window.requestAnimationFrame(() => {
      const node = document.getElementById(sectionDomId(key))
      const body = node?.closest('.ant-drawer-body') as HTMLElement | null
      if (node && body) {
        const stickyOffset = 56
        const nextTop =
          body.scrollTop + (node.getBoundingClientRect().top - body.getBoundingClientRect().top) - stickyOffset
        body.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
      } else {
        node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      window.setTimeout(() => {
        scrollingByTabRef.current = false
      }, 450)
    })
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const root = document.querySelector('.ant-drawer-body')
    if (!root) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingByTabRef.current) {
          return
        }
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]
        if (!top?.target.id.startsWith('proto-so-section-')) {
          return
        }
        const key = top.target.id.replace('proto-so-section-', '') as VariantASectionKey
        if (VARIANT_A_SECTIONS.some((item) => item.key === key)) {
          setActiveSection(key)
        }
      },
      {
        root,
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0.1, 0.25, 0.5],
      },
    )

    for (const item of VARIANT_A_SECTIONS) {
      const node = document.getElementById(sectionDomId(item.key))
      if (node) {
        observer.observe(node)
      }
    }

    return () => observer.disconnect()
  }, [open, guestsExpanded])

  return (
    <Drawer
      title="添加客源单 · 方案 A 加宽纵排"
      open={open}
      onClose={handleClose}
      size={width}
      destroyOnHidden
      styles={{ footer: { paddingBlock: token.paddingMD } }}
      footer={
        <DrawerFooterWithSettlement
          onClose={handleClose}
          grossYuan={grossYuan}
          settlementYuan={settlementYuan}
          adjustmentNetYuan={adjustmentNetYuan}
          discountYuan={effectiveDiscountYuan}
          collectionMode={collectionMode}
          depositYuan={depositYuan}
          balanceYuan={balanceYuan}
        />
      }
    >
      <FormSectionNav activeKey={activeSection} onChange={scrollToSection} />

      <SectionBlock id="basics">
        <OrderBasicsForm
          adultGuestCount={adultGuestCount}
          childGuestCount={childGuestCount}
          adultUnitPriceYuan={adultUnitPriceYuan}
          childUnitPriceYuan={childUnitPriceYuan}
          onAdultGuestCountChange={setAdultGuestCount}
          onChildGuestCountChange={setChildGuestCount}
          onAdultUnitPriceYuanChange={setAdultUnitPriceYuan}
          onChildUnitPriceYuanChange={setChildUnitPriceYuan}
        />
      </SectionBlock>
      <Divider />
      <SectionBlock id="fare">
        <SectionTitle title="团款调整" />
        <CompactFareTable rows={fares} onChange={setFares} />
      </SectionBlock>
      <Divider />
      <SectionBlock id="discount">
        <DiscountSection
          discountType={discountType}
          discountYuan={discountYuan}
          discountNotes={discountNotes}
          onDiscountTypeChange={setDiscountType}
          onDiscountYuanChange={setDiscountYuan}
          onDiscountNotesChange={setDiscountNotes}
        />
      </SectionBlock>
      <Divider />
      <SectionBlock id="collection">
        <CollectionSection
          collectionMode={collectionMode}
          depositYuan={depositYuan}
          balanceYuan={balanceYuan}
          settlementNotes={settlementNotes}
          onCollectionModeChange={setCollectionMode}
          onDepositYuanChange={setDepositYuan}
          onBalanceYuanChange={setBalanceYuan}
          onSettlementNotesChange={setSettlementNotes}
        />
      </SectionBlock>
      <Divider />
      <SectionBlock id="guests">
        <SectionTitle
          title="客人名单"
          extra={
            <Space size={8} align="center">
              <GuestCountBadge recorded={guests.length} planned={plannedGuestCount} />
              <Button
                size="small"
                type="text"
                icon={guestsExpanded ? <UpOutlined /> : <DownOutlined />}
                aria-label={guestsExpanded ? '折叠客人名单' : '展开客人名单'}
                onClick={() => setGuestsExpanded((value) => !value)}
              />
            </Space>
          }
        />
        {guestsExpanded ? (
          <CompactGuestTable guests={guests} onChange={setGuests} />
        ) : (
          <GuestCollapsedSummary guests={guests} onExpand={() => setGuestsExpanded(true)} />
        )}
      </SectionBlock>
      <div style={{ height: token.marginLG }} />
    </Drawer>
  )
}

/** B — 左右分栏：回答「同屏并行编辑」是否比拉长滚动更好 */
export function VariantB({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = theme.useToken()
  const {
    guests,
    setGuests,
    fares,
    setFares,
    adultGuestCount,
    setAdultGuestCount,
    childGuestCount,
    setChildGuestCount,
    adultUnitPriceYuan,
    setAdultUnitPriceYuan,
    childUnitPriceYuan,
    setChildUnitPriceYuan,
  } = usePrototypeModel()
  const width = Math.min(1120, typeof window !== 'undefined' ? window.innerWidth - 48 : 1120)

  return (
    <Drawer
      title="添加客源单 · 方案 B 左右分栏"
      open={open}
      onClose={onClose}
      size={width}
      destroyOnHidden
      styles={{ body: { paddingTop: token.paddingMD } }}
      footer={<FooterActions onClose={onClose} />}
    >
      <AlertBanner text="宽抽屉左右分栏：左团款（含线型调整列表），右客人常驻。适合边填人数边录名单。" />
      <Row gutter={token.marginLG} style={{ minHeight: 520 }}>
        <Col span={12} style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ paddingRight: token.paddingMD }}>
            <OrderBasicsForm
              adultGuestCount={adultGuestCount}
              childGuestCount={childGuestCount}
              adultUnitPriceYuan={adultUnitPriceYuan}
              childUnitPriceYuan={childUnitPriceYuan}
              onAdultGuestCountChange={setAdultGuestCount}
              onChildGuestCountChange={setChildGuestCount}
              onAdultUnitPriceYuanChange={setAdultUnitPriceYuan}
              onChildUnitPriceYuanChange={setChildUnitPriceYuan}
            />
            <Divider />
            <SectionTitle title="团款调整" />
            <CompactFareTable rows={fares} onChange={setFares} />
          </div>
        </Col>
        <Col span={12}>
          <div style={{ paddingLeft: token.paddingMD, position: 'sticky', top: 0 }}>
            <SectionTitle
              title="客人名单"
              extra={<Tag color="processing">{guests.length} 人</Tag>}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
              右侧固定，避免滚出视野。人数对比仅示意。
            </Typography.Paragraph>
            <GuestTableEditor guests={guests} onChange={setGuests} dense />
          </div>
        </Col>
      </Row>
    </Drawer>
  )
}

/** C — 页内主从：回答「是否不该用抽屉」 */
export function VariantC({
  open,
  onClose,
  listSlot,
}: {
  open: boolean
  onClose: () => void
  listSlot: ReactNode
}) {
  const { token } = theme.useToken()
  const {
    guests,
    setGuests,
    fares,
    setFares,
    adultGuestCount,
    setAdultGuestCount,
    childGuestCount,
    setChildGuestCount,
    adultUnitPriceYuan,
    setAdultUnitPriceYuan,
    childUnitPriceYuan,
    setChildUnitPriceYuan,
  } = usePrototypeModel()

  if (!open) {
    return <>{listSlot}</>
  }

  return (
    <Flex gap={token.marginMD} align="stretch" style={{ minHeight: 560 }}>
      <div
        style={{
          width: 280,
          flexShrink: 0,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          padding: token.paddingSM,
          background: token.colorFillAlter,
          overflow: 'auto',
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          列表缩略（示意）
        </Typography.Text>
        <div style={{ marginTop: 8, opacity: 0.55, pointerEvents: 'none' }}>{listSlot}</div>
      </div>
      <div
        style={{
          flex: 1,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          padding: token.paddingLG,
          background: token.colorBgContainer,
          minWidth: 0,
        }}
      >
        <Flex justify="space-between" align="center" style={{ marginBottom: token.marginMD }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            编辑客源单 · 方案 C 页内工作台
          </Typography.Title>
          <Button onClick={onClose}>返回列表</Button>
        </Flex>
        <AlertBanner text="不用抽屉：在客源 Tab 内主从布局。列表让位给编辑区，适合桌面宽屏与「做完再回列表」节奏。" />
        <Row gutter={token.marginLG}>
          <Col xs={24} lg={14}>
            <OrderBasicsForm
              adultGuestCount={adultGuestCount}
              childGuestCount={childGuestCount}
              adultUnitPriceYuan={adultUnitPriceYuan}
              childUnitPriceYuan={childUnitPriceYuan}
              onAdultGuestCountChange={setAdultGuestCount}
              onChildGuestCountChange={setChildGuestCount}
              onAdultUnitPriceYuanChange={setAdultUnitPriceYuan}
              onChildUnitPriceYuanChange={setChildUnitPriceYuan}
            />
            <Divider />
            <SectionTitle title="团款调整" />
            <CompactFareTable rows={fares} onChange={setFares} />
          </Col>
          <Col xs={24} lg={10}>
            <SectionTitle title="客人名单" extra={<Tag>{guests.length} 人</Tag>} />
            <GuestTableEditor guests={guests} onChange={setGuests} dense />
          </Col>
        </Row>
        <Divider />
        <FooterActions onClose={onClose} />
      </div>
    </Flex>
  )
}

function AlertBanner({ text }: { text: string }) {
  const { token } = theme.useToken()
  return (
    <div
      style={{
        marginBottom: token.marginMD,
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        background: token.colorInfoBg,
        border: `1px solid ${token.colorInfoBorder}`,
        borderRadius: token.borderRadius,
        color: token.colorText,
        fontSize: token.fontSizeSM,
      }}
    >
      {text}
    </div>
  )
}
