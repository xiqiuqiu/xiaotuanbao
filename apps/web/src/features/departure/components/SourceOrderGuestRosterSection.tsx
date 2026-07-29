import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  App,
  Button,
  Divider,
  Flex,
  Input,
  Select,
  Space,
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
import type { SourceOrderGuestSummary } from '@/types/api'
import { GUEST_GENDER_LABELS, GUEST_GENDER_OPTIONS, catalogLabel } from '../catalog'
import {
  createTempGuestId,
  guestSummaryToFormRow,
  type SourceOrderGuestFormRow,
  type SourceOrderGuestSyncBundle,
} from '../utils/source-order-guest-form'

type GuestDraft = SourceOrderGuestFormRow & {
  editingIndex: number | null
}

function GuestCountBadge({
  recorded,
  planned,
}: {
  recorded: number
  planned: number
}) {
  const { token } = theme.useToken()
  const matched = recorded === planned && planned > 0
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
  guests: SourceOrderGuestFormRow[]
  onExpand: () => void
}) {
  const { token } = theme.useToken()
  const visible = guests.slice(0, 6)
  const overflow = guests.length - visible.length

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="客人名单摘要，点击展开"
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

function CompactGuestTable({
  guests,
  onChange,
  readOnly,
  onDraftPresenceChange,
}: {
  guests: SourceOrderGuestFormRow[]
  onChange: (next: SourceOrderGuestFormRow[]) => void
  readOnly: boolean
  onDraftPresenceChange: (hasDraft: boolean) => void
}) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const canEdit = !readOnly
  const [draft, setDraftState] = useState<GuestDraft | null>(null)

  const setDraft = (next: GuestDraft | null) => {
    setDraftState(next)
    onDraftPresenceChange(Boolean(next))
  }

  useEffect(() => {
    if (!canEdit && draft) {
      setDraftState(null)
      onDraftPresenceChange(false)
    }
  }, [canEdit, draft, onDraftPresenceChange])

  const startAdd = () => {
    if (draft) {
      message.warning('请先保存或取消当前名单行')
      return
    }
    setDraft({
      editingIndex: null,
      id: createTempGuestId(),
      name: '',
      phone: undefined,
      gender: undefined,
      notes: undefined,
    })
  }

  const startEdit = (index: number) => {
    if (draft) {
      message.warning('请先保存或取消当前名单行')
      return
    }
    const row = guests[index]
    if (!row) {
      return
    }
    setDraft({
      editingIndex: index,
      ...row,
    })
  }

  const cancelEdit = () => {
    setDraft(null)
  }

  const saveDraft = () => {
    if (!draft) {
      return
    }
    if (!draft.name.trim()) {
      message.error('请填写姓名')
      return
    }
    const cleaned: SourceOrderGuestFormRow = {
      id: draft.id,
      name: draft.name.trim(),
      phone: (draft.phone ?? '').trim() || undefined,
      gender: draft.gender || undefined,
      notes: (draft.notes ?? '').trim() || undefined,
    }
    const next =
      draft.editingIndex == null
        ? [...guests, cleaned]
        : guests.map((item, index) => (index === draft.editingIndex ? cleaned : item))
    onChange(next)
    setDraft(null)
  }

  const removeRow = (index: number) => {
    onChange(guests.filter((_, rowIndex) => rowIndex !== index))
    if (draft?.editingIndex === index) {
      setDraft(null)
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

  const renderEditorRow = (draftValue: GuestDraft) => (
    <tr
      key={`edit-${draftValue.editingIndex ?? 'new'}`}
      data-testid="guest-row-editor"
      style={{ background: token.colorPrimaryBg }}
    >
      <td style={{ ...bodyCell, width: 120 }}>
        <Input
          size="small"
          placeholder="姓名"
          value={draftValue.name}
          disabled={!canEdit}
          onChange={(event) => setDraft({ ...draftValue, name: event.target.value })}
        />
      </td>
      <td style={{ ...bodyCell, width: 140 }}>
        <Input
          size="small"
          placeholder="手机"
          value={draftValue.phone ?? ''}
          disabled={!canEdit}
          onChange={(event) => setDraft({ ...draftValue, phone: event.target.value })}
        />
      </td>
      <td style={{ ...bodyCell, width: 96 }}>
        <Select
          size="small"
          allowClear
          placeholder="性别"
          value={draftValue.gender}
          style={{ width: '100%' }}
          options={[...GUEST_GENDER_OPTIONS]}
          disabled={!canEdit}
          onChange={(gender: string | undefined) =>
            setDraft({ ...draftValue, gender })
          }
        />
      </td>
      <td style={bodyCell}>
        <Input
          size="small"
          placeholder="备注（选填）"
          value={draftValue.notes ?? ''}
          disabled={!canEdit}
          onChange={(event) => setDraft({ ...draftValue, notes: event.target.value })}
        />
      </td>
      <td style={{ ...bodyCell, width: 120, whiteSpace: 'nowrap' }}>
        {canEdit ? (
          <Space size={0}>
            <Button type="link" size="small" aria-label="保存客人" onClick={saveDraft}>
              保存
            </Button>
            <Button type="link" size="small" aria-label="取消客人" onClick={cancelEdit}>
              取消
            </Button>
          </Space>
        ) : null}
      </td>
    </tr>
  )

  const renderViewRow = (row: SourceOrderGuestFormRow, index: number) => (
    <tr
      key={row.id}
      data-testid="guest-row"
      style={{
        borderTop:
          index === 0 && !draft ? undefined : `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <td style={bodyCell}>{row.name || '-'}</td>
      <td style={bodyCell}>{row.phone || '-'}</td>
      <td style={bodyCell}>{catalogLabel(GUEST_GENDER_LABELS, row.gender)}</td>
      <td style={bodyCell}>
        <Typography.Text type={row.notes ? undefined : 'secondary'}>
          {row.notes || '-'}
        </Typography.Text>
      </td>
      <td style={{ ...bodyCell, width: 72, whiteSpace: 'nowrap' }}>
        {canEdit ? (
          <Space size={0}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label="编辑客人"
              onClick={() => startEdit(index)}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除客人"
              onClick={() => removeRow(index)}
            />
          </Space>
        ) : null}
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
                  style={{
                    ...bodyCell,
                    color: token.colorTextSecondary,
                    textAlign: 'center',
                  }}
                >
                  暂无客人
                </td>
              </tr>
            ) : null}
            {guests.map((row, index) =>
              draft?.editingIndex === index && draft
                ? renderEditorRow(draft)
                : renderViewRow(row, index),
            )}
            {draft && draft.editingIndex == null ? renderEditorRow(draft) : null}
          </tbody>
        </table>
      </div>
      {canEdit ? (
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
      ) : null}
    </div>
  )
}

export function SourceOrderGuestRosterSection({
  title,
  initialBaseline,
  plannedCount,
  readOnly,
  onDraftPresenceChange,
  onSyncBundleChange,
  first = false,
}: {
  title: ReactNode
  initialBaseline: SourceOrderGuestSummary[]
  plannedCount: number
  readOnly: boolean
  onDraftPresenceChange: (hasDraft: boolean) => void
  onSyncBundleChange: (bundle: SourceOrderGuestSyncBundle) => void
  first?: boolean
}) {
  const { token } = theme.useToken()
  const [expanded, setExpanded] = useState(true)
  const [guests, setGuests] = useState(() => initialBaseline.map(guestSummaryToFormRow))

  useEffect(() => {
    onSyncBundleChange({
      baseline: initialBaseline,
      next: guests,
    })
  }, [guests, initialBaseline, onSyncBundleChange])

  return (
    <section>
      {!first ? <Divider style={{ margin: `${token.marginLG}px 0` }} /> : null}
      <Flex
        justify="space-between"
        align="center"
        style={{ marginBottom: token.marginSM }}
      >
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        <Space size={8} align="center">
          <GuestCountBadge recorded={guests.length} planned={plannedCount} />
          <Button
            size="small"
            type="text"
            icon={expanded ? <UpOutlined /> : <DownOutlined />}
            aria-label={expanded ? '折叠客人名单' : '展开客人名单'}
            onClick={() => setExpanded((value) => !value)}
          />
        </Space>
      </Flex>
      <div style={{ display: expanded ? 'block' : 'none' }}>
        <CompactGuestTable
          guests={guests}
          onChange={setGuests}
          readOnly={readOnly}
          onDraftPresenceChange={onDraftPresenceChange}
        />
      </div>
      {!expanded ? (
        <GuestCollapsedSummary guests={guests} onExpand={() => setExpanded(true)} />
      ) : null}
    </section>
  )
}
