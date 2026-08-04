import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  Alert,
  App,
  Col,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
  Button,
  theme,
} from 'antd'
import type { FormInstance } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
  FareAdjustmentDirection,
  FareAdjustmentKind,
  FARE_ADJUSTMENT_KIND_CATALOG,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
  DirectoryProfileStatus,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary, SourceOrderGuestSummary, PartnerSummary } from '@/types/api'
import { listPartners } from '@/services/partner.service'
import { getSourceOrder, listSourceOrderGuests } from '@/services/source-order.service'
import { PartnerQuickCreateSelect } from './PartnerQuickCreateSelect'
import {
  FARE_ADJUSTMENT_DIRECTION_OPTIONS,
  FARE_ADJUSTMENT_KIND_OPTIONS,
  SOURCE_ORDER_COLLECTION_OPTIONS,
  SOURCE_ORDER_DISCOUNT_OPTIONS,
  defaultDirectionForFareAdjustmentKind,
} from '../catalog'
import {
  computeFormAmounts,
  createEmptySourceOrderFormValues,
  formValuesToPayload,
  sourceOrderToFormValues,
  totalGuestCount,
  type SourceOrderFareAdjustmentFormRow,
  type SourceOrderFormValues,
  type SourceOrderPathBaseline,
} from '../utils/source-order-form'
import {
  guestSummaryToFormRow,
  type SourceOrderGuestSyncBundle,
} from '../utils/source-order-guest-form'
import { SourceOrderGuestRosterSection } from './SourceOrderGuestRosterSection'

const DRAWER_SECTIONS = [
  { key: 'basics', label: '基础信息' },
  { key: 'fare', label: '团款调整' },
  { key: 'discount', label: '团款优惠' },
  { key: 'collection', label: '收款信息' },
  { key: 'guests', label: '客人名单' },
] as const

type DrawerSectionKey = (typeof DRAWER_SECTIONS)[number]['key']

function sectionDomId(key: DrawerSectionKey) {
  return `so-section-${key}`
}

function observeSourceOrderSections({
  scrollingByTabRef,
  setActiveSection,
}: {
  scrollingByTabRef: RefObject<boolean>
  setActiveSection: Dispatch<SetStateAction<DrawerSectionKey>>
}) {
  let cancelled = false
  let rafId = 0
  const activeObservers: IntersectionObserver[] = []

  const setup = () => {
    if (cancelled) {
      return
    }
    // Prefer the drawer body that actually hosts our sections (avoid stray drawers).
    const section = document.getElementById(sectionDomId('basics'))
    const root =
      (section?.closest('.ant-drawer-body') as Element | null) ??
      document.querySelector('.ant-drawer-body')
    if (!root || !section) {
      rafId = window.requestAnimationFrame(setup)
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
        if (!top?.target.id.startsWith('so-section-')) {
          return
        }
        const key = top.target.id.replace('so-section-', '') as DrawerSectionKey
        if (DRAWER_SECTIONS.some((item) => item.key === key)) {
          setActiveSection((current) => (current === key ? current : key))
        }
      },
      {
        root,
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0.1, 0.25, 0.5],
      },
    )
    activeObservers.push(observer)

    for (const item of DRAWER_SECTIONS) {
      const node = document.getElementById(sectionDomId(item.key))
      if (node) {
        observer.observe(node)
      }
    }
  }

  setup()

  return () => {
    cancelled = true
    window.cancelAnimationFrame(rafId)
    for (const observer of activeObservers) {
      observer.disconnect()
    }
  }
}

function useSourceOrderSectionObserver({
  open,
  detailReady,
  scrollingByTabRef,
  setActiveSection,
}: {
  open: boolean
  detailReady: boolean
  scrollingByTabRef: RefObject<boolean>
  setActiveSection: Dispatch<SetStateAction<DrawerSectionKey>>
}) {
  useEffect(() => {
    if (!open || !detailReady || typeof IntersectionObserver === 'undefined') {
      return
    }
    return observeSourceOrderSections({ scrollingByTabRef, setActiveSection })
  }, [detailReady, open, scrollingByTabRef, setActiveSection])
}

interface SourceOrderDrawerProps {
  open: boolean
  editing: SourceOrderSummary | null
  readOnly: boolean
  amountReadOnly?: boolean
  loading: boolean
  /** 未提交应收时可展示「保存并提交应收」。 */
  canSaveAndGenerate?: boolean
  saveAndGenerateLoading?: boolean
  onClose: () => void
  onSubmit: (
    values: ReturnType<typeof formValuesToPayload>,
    pathBaseline: SourceOrderPathBaseline | null,
    options?: {
      generateReceivable?: boolean
      guests?: SourceOrderGuestSyncBundle
    },
  ) => void
}

function FormSection({
  title,
  children,
  first = false,
  extra,
}: {
  title: string
  children: ReactNode
  first?: boolean
  extra?: ReactNode
}) {
  const { token } = theme.useToken()
  return (
    <section>
      {!first ? <Divider style={{ margin: `${token.marginLG}px 0` }} /> : null}
      <Flex
        justify="space-between"
        align="center"
        style={{ marginBottom: token.marginSM }}
      >
        <Flex align="center" gap={token.marginSM}>
          <span
            data-testid="section-title-accent"
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
      {children}
    </section>
  )
}

function formatYuan(yuan: number): string {
  return `¥${yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatSignedYuan(yuan: number): string {
  if (yuan > 0) {
    return `+${formatYuan(yuan)}`
  }
  if (yuan < 0) {
    return `−${formatYuan(Math.abs(yuan))}`
  }
  return formatYuan(0)
}

function Dot({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { token } = theme.useToken()
  return (
    <Typography.Text
      type="secondary"
      style={{ fontSize: size === 'md' ? token.fontSize : token.fontSizeSM }}
    >
      ·
    </Typography.Text>
  )
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
    <Typography.Text style={{ fontSize }}>
      <Typography.Text type="secondary" style={{ fontSize }}>
        {label}{' '}
      </Typography.Text>
      <Typography.Text style={{ fontSize, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography.Text>
    </Typography.Text>
  )
}

function PreviewLine({
  title,
  children,
  primary = false,
}: {
  title: string
  children: ReactNode
  primary?: boolean
}) {
  const { token } = theme.useToken()
  return (
    <Flex align="baseline" gap={token.marginSM} wrap="wrap">
      <Typography.Text
        strong={primary}
        style={{
          fontSize: primary ? token.fontSize : token.fontSizeSM,
          minWidth: 64,
          color: primary ? token.colorText : token.colorTextSecondary,
        }}
      >
        {title}
      </Typography.Text>
      <Flex gap={token.marginXS} wrap="wrap" align="center">
        {children}
      </Flex>
    </Flex>
  )
}

function SettlementPreviewCard({
  grossYuan,
  adjustmentNetYuan,
  discountYuan,
  settlementYuan,
  collectionMode,
  depositYuan,
  balanceYuan,
  partnerCollectedYuan,
  guestCollectYuan,
  customerTopUpYuan,
  rebateYuan,
}: {
  grossYuan: number
  adjustmentNetYuan: number
  discountYuan: number
  settlementYuan: number
  collectionMode: SourceOrderCollectionMode
  depositYuan: number
  balanceYuan: number
  partnerCollectedYuan: number
  guestCollectYuan: number
  customerTopUpYuan: number
  rebateYuan: number
}) {
  const { token } = theme.useToken()

  const collectionLine =
    collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED ? (
      <InlineMetric
        label="客户已收"
        value={`${formatYuan(partnerCollectedYuan)}（全部客户结算）`}
      />
    ) : collectionMode === SourceOrderCollectionMode.GUEST_ONLY ? (
      <>
        <InlineMetric label="代收定金" value={formatYuan(depositYuan)} />
        <Dot />
        <InlineMetric label="代收尾款" value={formatYuan(balanceYuan)} />
        <Dot />
        <InlineMetric label="我方代收" value={formatYuan(guestCollectYuan)} />
      </>
    ) : (
      <>
        <InlineMetric label="客户定金" value={formatYuan(depositYuan)} />
        <Dot />
        <InlineMetric label="我方尾款" value={formatYuan(balanceYuan)} />
      </>
    )

  const diffLine =
    collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED ? (
      <Typography.Text style={{ fontSize: token.fontSizeSM }}>无补款返利</Typography.Text>
    ) : (
      <>
        <InlineMetric label="客户补款" value={formatYuan(customerTopUpYuan)} />
        <Dot />
        <InlineMetric label="预计返利" value={formatYuan(rebateYuan)} />
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
            <InlineMetric size="md" label="原始团款" value={formatYuan(grossYuan)} />
            <Dot size="md" />
            <InlineMetric size="md" label="调整净额" value={formatSignedYuan(adjustmentNetYuan)} />
            <Dot size="md" />
            <InlineMetric
              size="md"
              label="团款优惠"
              value={`−${formatYuan(discountYuan)}`}
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
            {formatYuan(settlementYuan)}
          </Typography.Text>
        </div>
      </Flex>
    </div>
  )
}

function FormSectionNav({
  activeKey,
  onChange,
}: {
  activeKey: DrawerSectionKey
  onChange: (key: DrawerSectionKey) => void
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
        items={DRAWER_SECTIONS.map((item) => ({
          key: item.key,
          label: item.label,
        }))}
        onChange={(key) => onChange(key as DrawerSectionKey)}
        tabBarStyle={{ marginBottom: 0 }}
      />
    </div>
  )
}

function SectionBlock({
  id,
  children,
}: {
  id: DrawerSectionKey
  children: ReactNode
}) {
  const { token } = theme.useToken()
  return (
    <div
      id={sectionDomId(id)}
      style={{
        scrollMarginTop: token.paddingXL + token.paddingLG,
      }}
    >
      {children}
    </div>
  )
}

type FareDraft = SourceOrderFareAdjustmentFormRow & {
  editingIndex: number | null
}

function kindLabel(kind: FareAdjustmentKind): string {
  return FARE_ADJUSTMENT_KIND_OPTIONS.find((item) => item.value === kind)?.label ?? kind
}

function notePlaceholder(kind: FareAdjustmentKind): string {
  const entry = FARE_ADJUSTMENT_KIND_CATALOG.find((item) => item.kind === kind)
  return entry?.noteRequired ? '必填，说明调整原因' : '选填'
}

interface FareAdjustmentEditorRowProps {
  draft: FareDraft
  canEdit: boolean
  kindOptions: Array<{
    value: FareAdjustmentKind
    label: string
    disabled: boolean
  }>
  onChange: (draft: FareDraft) => void
  onSave: () => void
  onCancel: () => void
}

function FareAdjustmentEditorRow({
  draft,
  canEdit,
  kindOptions,
  onChange,
  onSave,
  onCancel,
}: FareAdjustmentEditorRowProps) {
  const { token } = theme.useToken()
  const bodyCell: CSSProperties = {
    padding: `${token.paddingXS}px ${token.paddingSM}px`,
    verticalAlign: 'middle',
  }
  const directionLocked = draft.kind !== FareAdjustmentKind.OTHER

  return (
    <tr
      key={`edit-${draft.editingIndex ?? 'new'}`}
      data-testid="fare-adjustment-row-editor"
      style={{ background: token.colorPrimaryBg }}
    >
      <td style={{ ...bodyCell, width: 160 }}>
        <Select
          size="small"
          value={draft.kind}
          options={kindOptions}
          style={{ width: '100%' }}
          disabled={!canEdit}
          onChange={(kind: FareAdjustmentKind) => {
            onChange({
              ...draft,
              kind,
              direction: defaultDirectionForFareAdjustmentKind(kind),
              customName: kind === FareAdjustmentKind.OTHER ? draft.customName : undefined,
            })
          }}
        />
      </td>
      <td style={{ ...bodyCell, width: 100 }}>
        <Select
          size="small"
          value={draft.direction}
          disabled={!canEdit || directionLocked}
          options={[...FARE_ADJUSTMENT_DIRECTION_OPTIONS]}
          style={{ width: '100%' }}
          onChange={(direction: FareAdjustmentDirection) =>
            onChange({ ...draft, direction })
          }
        />
      </td>
      <td style={{ ...bodyCell, width: 120 }}>
        <InputNumber
          size="small"
          min={0.01}
          precision={2}
          style={{ width: '100%' }}
          value={draft.amountYuan ?? null}
          placeholder="金额"
          disabled={!canEdit}
          onChange={(amountYuan) =>
            onChange({
              ...draft,
              amountYuan: amountYuan == null ? undefined : Number(amountYuan),
            })
          }
        />
      </td>
      <td style={bodyCell}>
        <Input
          size="small"
          maxLength={30}
          showCount
          placeholder={notePlaceholder(draft.kind)}
          value={draft.customName ?? ''}
          disabled={!canEdit}
          onChange={(event) => onChange({ ...draft, customName: event.target.value })}
        />
      </td>
      <td style={{ ...bodyCell, width: 120, whiteSpace: 'nowrap' }}>
        {canEdit ? (
          <Space size={0}>
            <Button type="link" size="small" aria-label="保存调整项" onClick={onSave}>
              保存
            </Button>
            <Button type="link" size="small" aria-label="取消调整项" onClick={onCancel}>
              取消
            </Button>
          </Space>
        ) : null}
      </td>
    </tr>
  )
}

function FareAdjustmentViewRow({
  row,
  index,
  draftOpen,
  canEdit,
  onEdit,
  onRemove,
}: {
  row: SourceOrderFareAdjustmentFormRow
  index: number
  draftOpen: boolean
  canEdit: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const { token } = theme.useToken()
  const bodyCell: CSSProperties = {
    padding: `${token.paddingXS}px ${token.paddingSM}px`,
    verticalAlign: 'middle',
  }

  return (
    <tr
      data-testid="fare-adjustment-row"
      style={{
        borderTop:
          index === 0 && !draftOpen ? undefined : `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <td style={bodyCell}>{kindLabel(row.kind)}</td>
      <td style={bodyCell}>
        <Tag color={row.direction === FareAdjustmentDirection.INCREASE ? 'blue' : 'default'}>
          {row.direction === FareAdjustmentDirection.INCREASE ? '增项' : '减项'}
        </Tag>
      </td>
      <td style={{ ...bodyCell, fontVariantNumeric: 'tabular-nums' }}>
        ¥{(row.amountYuan ?? 0).toFixed(2)}
      </td>
      <td style={bodyCell}>
        <Typography.Text type={row.customName ? undefined : 'secondary'}>
          {row.customName || '-'}
        </Typography.Text>
      </td>
      <td style={{ ...bodyCell, width: 72, whiteSpace: 'nowrap' }}>
        {canEdit ? (
          <Space size={0}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label="编辑调整项"
              onClick={onEdit}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除调整项"
              onClick={onRemove}
            />
          </Space>
        ) : null}
      </td>
    </tr>
  )
}

function FareAdjustmentsEditor({
  value,
  onChange,
  lockAmounts,
  readOnly,
  adjustmentNetYuan,
  onDraftPresenceChange,
}: {
  value?: SourceOrderFareAdjustmentFormRow[]
  onChange?: (next: SourceOrderFareAdjustmentFormRow[]) => void
  lockAmounts: boolean
  readOnly: boolean
  adjustmentNetYuan: number
  onDraftPresenceChange: (hasDraft: boolean) => void
}) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const canEdit = !lockAmounts && !readOnly
  const rows = value ?? []
  const [draft, setDraftState] = useState<FareDraft | null>(null)

  const setDraft = (next: FareDraft | null) => {
    setDraftState(next)
    onDraftPresenceChange(Boolean(next))
  }

  const usedFixedKinds = new Set<FareAdjustmentKind>()
  for (const [index, row] of rows.entries()) {
    if (index === draft?.editingIndex) {
      continue
    }
    if (row.kind && row.kind !== FareAdjustmentKind.OTHER) {
      usedFixedKinds.add(row.kind)
    }
  }

  const kindOptions = FARE_ADJUSTMENT_KIND_OPTIONS.map((option) => ({
    ...option,
    disabled:
      option.value !== FareAdjustmentKind.OTHER &&
      usedFixedKinds.has(option.value) &&
      option.value !== draft?.kind,
  }))

  const commitRows = (next: SourceOrderFareAdjustmentFormRow[]) => {
    onChange?.(next)
  }

  const startAdd = () => {
    if (draft) {
      message.warning('请先保存或取消当前调整行')
      return
    }
    const nextFixed = FARE_ADJUSTMENT_KIND_OPTIONS.find(
      (option) =>
        option.value !== FareAdjustmentKind.OTHER && !usedFixedKinds.has(option.value),
    )
    const kind = nextFixed?.value ?? FareAdjustmentKind.OTHER
    setDraft({
      editingIndex: null,
      kind,
      direction: defaultDirectionForFareAdjustmentKind(kind),
      amountYuan: undefined,
      customName: undefined,
    })
  }

  const startEdit = (index: number) => {
    if (draft) {
      message.warning('请先保存或取消当前调整行')
      return
    }
    const row = rows[index]
    if (!row) {
      return
    }
    setDraft({
      editingIndex: index,
      kind: row.kind,
      direction: row.direction,
      amountYuan: row.amountYuan,
      customName: row.customName,
    })
  }

  const cancelEdit = () => {
    setDraft(null)
  }

  const saveDraft = () => {
    if (!draft) {
      return
    }
    const amountYuan = Number(draft.amountYuan ?? 0)
    if (!(amountYuan > 0)) {
      message.error('调整金额必须大于 0')
      return
    }
    const note = (draft.customName ?? '').trim()
    const catalog = FARE_ADJUSTMENT_KIND_CATALOG.find((item) => item.kind === draft.kind)
    if (catalog?.noteRequired && !note) {
      message.error('其他费用调整须填写调整说明')
      return
    }
    if (
      draft.kind !== FareAdjustmentKind.OTHER &&
      rows.some(
        (item, index) => item.kind === draft.kind && index !== draft.editingIndex,
      )
    ) {
      message.error('该固定调整项目已存在')
      return
    }

    const cleaned: SourceOrderFareAdjustmentFormRow = {
      rowKey: draft.rowKey ?? crypto.randomUUID(),
      kind: draft.kind,
      direction:
        draft.kind === FareAdjustmentKind.OTHER
          ? draft.direction
          : defaultDirectionForFareAdjustmentKind(draft.kind),
      amountYuan,
      customName: note || undefined,
    }

    const next =
      draft.editingIndex == null
        ? [...rows, cleaned]
        : rows.map((item, index) => (index === draft.editingIndex ? cleaned : item))
    commitRows(next)
    setDraft(null)
  }

  const removeRow = (index: number) => {
    commitRows(rows.filter((_, rowIndex) => rowIndex !== index))
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
              <th style={headerCell}>金额</th>
              <th style={headerCell}>调整说明</th>
              <th style={headerCell}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !draft ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    ...bodyCell,
                    color: token.colorTextSecondary,
                    textAlign: 'center',
                  }}
                >
                  暂无调整项
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) =>
              draft?.editingIndex === index && draft ? (
                <FareAdjustmentEditorRow
                  key={`edit-${draft.editingIndex}`}
                  draft={draft}
                  canEdit={canEdit}
                  kindOptions={kindOptions}
                  onChange={setDraft}
                  onSave={saveDraft}
                  onCancel={cancelEdit}
                />
              ) : (
                <FareAdjustmentViewRow
                  key={
                    row.rowKey ??
                    `${row.kind}:${row.direction}:${row.amountYuan ?? 0}:${row.customName ?? ''}`
                  }
                  row={row}
                  index={index}
                  draftOpen={Boolean(draft)}
                  canEdit={canEdit}
                  onEdit={() => startEdit(index)}
                  onRemove={() => removeRow(index)}
                />
              ),
            )}
            {draft && draft.editingIndex == null ? (
              <FareAdjustmentEditorRow
                key="edit-new"
                draft={draft}
                canEdit={canEdit}
                kindOptions={kindOptions}
                onChange={setDraft}
                onSave={saveDraft}
                onCancel={cancelEdit}
              />
            ) : null}
          </tbody>
        </table>
      </div>
      <Flex justify="space-between" align="center" style={{ marginTop: token.marginSM }}>
        {canEdit ? (
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={startAdd}
            disabled={Boolean(draft)}
          >
            添加调整项
          </Button>
        ) : (
          <span />
        )}
        <Typography.Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
          调整净额{' '}
          <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatSignedYuan(adjustmentNetYuan)}
          </Typography.Text>
          {!canEdit && rows.length === 0 ? '（无）' : null}
        </Typography.Text>
      </Flex>
    </div>
  )
}

function unitPriceRequiredWhenCountPositive(countField: 'adultGuestCount' | 'childGuestCount') {
  return ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
    validator(_: unknown, value: number | null | undefined) {
      const count = Number(getFieldValue(countField) ?? 0)
      if (count > 0 && (value === undefined || value === null)) {
        return Promise.reject(new Error('请输入团款单价'))
      }
      return Promise.resolve()
    },
  })
}

function totalGuestCountAtLeastOne(getFieldValue: (name: string) => unknown) {
  return async () => {
    const adult = Number(getFieldValue('adultGuestCount') ?? 0)
    const child = Number(getFieldValue('childGuestCount') ?? 0)
    if (adult + child < 1) {
      throw new Error('总人数必须大于0')
    }
  }
}

interface SourceOrderFormFieldsProps {
  partners: readonly Pick<PartnerSummary, 'id' | 'name' | 'status'>[]
  partnerSearch: string
  onPartnerSearch: (value: string) => void
  lockAmounts: boolean
  readOnly: boolean
  derivedTotalGuests: number
  derivedGrossYuan: number
  derivedAdjustmentNetYuan: number
  discountType: SourceOrderDiscountType | undefined
  collectionMode: SourceOrderCollectionMode | undefined
  onFareDraftPresenceChange: (hasDraft: boolean) => void
  guestSessionKey: string
  guestBaseline: SourceOrderGuestSummary[]
  guestBaselineReady: boolean
  onGuestDraftPresenceChange: (hasDraft: boolean) => void
  onGuestSyncBundleChange: (bundle: SourceOrderGuestSyncBundle) => void
}

function SourceOrderFormFields({
  partners,
  partnerSearch,
  onPartnerSearch,
  lockAmounts,
  readOnly,
  derivedTotalGuests,
  derivedGrossYuan,
  derivedAdjustmentNetYuan,
  discountType,
  collectionMode,
  onFareDraftPresenceChange,
  guestSessionKey,
  guestBaseline,
  guestBaselineReady,
  onGuestDraftPresenceChange,
  onGuestSyncBundleChange,
}: SourceOrderFormFieldsProps) {
  const { token } = theme.useToken()

  return (
    <>
      <SectionBlock id="basics">
        <FormSection title="基础信息" first>
          <Form.Item
            name="partnerId"
            label="客户"
            rules={[{ required: true, message: '请选择客户' }]}
          >
            <PartnerQuickCreateSelect
              partners={partners}
              searchValue={partnerSearch}
              onSearch={onPartnerSearch}
              placeholder="选择合作伙伴"
              emptyHint="暂无匹配合作伙伴"
              disabled={readOnly}
            />
          </Form.Item>
          <Row gutter={token.marginMD}>
            <Col span={8}>
              <Form.Item
                name="adultGuestCount"
                label="成人人数"
                rules={[
                  { required: true, message: '请输入成人人数' },
                  {
                    type: 'number',
                    min: 0,
                    message: '成人人数不能为负数',
                  },
                  ({ getFieldValue }) => ({
                    validator: totalGuestCountAtLeastOne(getFieldValue),
                  }),
                ]}
                dependencies={['childGuestCount']}
              >
                <InputNumber
                  min={0}
                  precision={0}
                  style={{ width: '100%' }}
                  disabled={lockAmounts}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="childGuestCount"
                label="儿童人数"
                rules={[
                  {
                    type: 'number',
                    min: 0,
                    message: '儿童人数不能为负数',
                  },
                  ({ getFieldValue }) => ({
                    validator: totalGuestCountAtLeastOne(getFieldValue),
                  }),
                ]}
                dependencies={['adultGuestCount']}
              >
                <InputNumber
                  min={0}
                  precision={0}
                  style={{ width: '100%' }}
                  disabled={lockAmounts}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="总人数">
                <Input
                  aria-label="总人数"
                  value={`${derivedTotalGuests} 人`}
                  readOnly
                  disabled
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={token.marginMD}>
            <Col span={8}>
              <Form.Item
                name="adultUnitPriceYuan"
                label="成人团款单价（元）"
                rules={[{ required: true, message: '请输入成人团款单价' }]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  disabled={lockAmounts}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="childUnitPriceYuan"
                label="儿童团款单价（元）"
                rules={[unitPriceRequiredWhenCountPositive('childGuestCount')]}
                dependencies={['childGuestCount']}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  disabled={lockAmounts}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="原始团款">
                <Input
                  aria-label="原始团款"
                  value={formatYuan(derivedGrossYuan)}
                  readOnly
                  disabled
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
        </FormSection>
      </SectionBlock>

      <SectionBlock id="fare">
        <FormSection title="团款调整">
          <Form.Item name="fareAdjustments" noStyle>
            <FareAdjustmentsEditor
              key={lockAmounts || readOnly ? 'locked' : 'editable'}
              lockAmounts={lockAmounts}
              readOnly={readOnly}
              adjustmentNetYuan={derivedAdjustmentNetYuan}
              onDraftPresenceChange={onFareDraftPresenceChange}
            />
          </Form.Item>
        </FormSection>
      </SectionBlock>

      <SectionBlock id="discount">
        <FormSection title="团款优惠">
          <Form.Item
            name="discountType"
            label="优惠方式"
            rules={[{ required: true, message: '请选择优惠方式' }]}
          >
            <Select options={[...SOURCE_ORDER_DISCOUNT_OPTIONS]} disabled={lockAmounts} />
          </Form.Item>
          {discountType === SourceOrderDiscountType.LUMP_SUM ? (
            <Form.Item
              name="discountYuan"
              label="优惠金额（元）"
              rules={[{ required: true, message: '请输入优惠金额' }]}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="discountNotes" label="优惠备注">
            <Input.TextArea rows={2} placeholder="请输入优惠相关备注（选填）" />
          </Form.Item>
        </FormSection>
      </SectionBlock>

      <SectionBlock id="collection">
        <FormSection title="收款信息">
          <Form.Item
            name="collectionMode"
            label="收款方式"
            rules={[{ required: true, message: '请选择收款方式' }]}
          >
            <Select options={[...SOURCE_ORDER_COLLECTION_OPTIONS]} disabled={lockAmounts} />
          </Form.Item>
          {collectionMode === SourceOrderCollectionMode.GUEST_ONLY ||
          collectionMode === SourceOrderCollectionMode.SPLIT ? (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="depositYuan"
                  label={
                    collectionMode === SourceOrderCollectionMode.SPLIT
                      ? '客户已收定金（元）'
                      : '定金（元）'
                  }
                  rules={[{ required: true, message: '请输入定金' }]}
                >
                  <InputNumber
                    min={0}
                    precision={2}
                    style={{ width: '100%' }}
                    disabled={lockAmounts}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="balanceYuan"
                  label={
                    collectionMode === SourceOrderCollectionMode.SPLIT
                      ? '我方代收尾款（元）'
                      : '尾款（元）'
                  }
                  rules={[{ required: true, message: '请输入尾款' }]}
                >
                  <InputNumber
                    min={0}
                    precision={2}
                    style={{ width: '100%' }}
                    disabled={lockAmounts}
                  />
                </Form.Item>
              </Col>
            </Row>
          ) : null}
          <Form.Item name="settlementNotes" label="结算说明">
            <Input.TextArea rows={2} placeholder="请输入结算说明（选填）" />
          </Form.Item>
        </FormSection>

        <FormSection title="备注">
          <Form.Item name="notes">
            <Input.TextArea
              rows={2}
              placeholder="免票、特殊要求等"
              aria-label="备注"
            />
          </Form.Item>
        </FormSection>
      </SectionBlock>

      <SectionBlock id="guests">
        {guestBaselineReady ? (
          <SourceOrderGuestRosterSection
            key={guestSessionKey}
            title="客人名单"
            initialBaseline={guestBaseline}
            plannedCount={derivedTotalGuests}
            readOnly={readOnly}
            onDraftPresenceChange={onGuestDraftPresenceChange}
            onSyncBundleChange={onGuestSyncBundleChange}
          />
        ) : (
          <FormSection title="客人名单">
            <Typography.Text type="secondary">名单加载中…</Typography.Text>
          </FormSection>
        )}
      </SectionBlock>
    </>
  )
}

export function SourceOrderDrawer(props: SourceOrderDrawerProps) {
  const sessionKey = props.open
    ? `${props.editing?.id ?? 'new'}:${props.readOnly ? 'read' : 'edit'}:${props.amountReadOnly ? 'amount-read' : 'amount-edit'}`
    : 'closed'
  return <SourceOrderDrawerSession key={sessionKey} {...props} />
}

interface SourceOrderDrawerFooterProps {
  readOnly: boolean
  detailReady: boolean
  actionsBusy: boolean
  canSaveAndGenerate: boolean
  saveAndGenerateLoading: boolean
  loading: boolean
  grossYuan: number
  adjustmentNetYuan: number
  discountYuan: number
  settlementYuan: number
  collectionMode: SourceOrderCollectionMode
  depositYuan: number
  balanceYuan: number
  partnerCollectedYuan: number
  guestCollectYuan: number
  customerTopUpYuan: number
  rebateYuan: number
  onClose: () => void
  onSubmitIntent: (intent: 'save' | 'saveAndGenerate') => void
}

function SourceOrderDrawerFooter({
  readOnly,
  detailReady,
  actionsBusy,
  canSaveAndGenerate,
  saveAndGenerateLoading,
  loading,
  grossYuan,
  adjustmentNetYuan,
  discountYuan,
  settlementYuan,
  collectionMode,
  depositYuan,
  balanceYuan,
  partnerCollectedYuan,
  guestCollectYuan,
  customerTopUpYuan,
  rebateYuan,
  onClose,
  onSubmitIntent,
}: SourceOrderDrawerFooterProps) {
  const { token } = theme.useToken()
  return (
    <Flex vertical gap={token.marginSM} style={{ width: '100%' }}>
      {detailReady ? (
        <SettlementPreviewCard
          grossYuan={grossYuan}
          adjustmentNetYuan={adjustmentNetYuan}
          discountYuan={discountYuan}
          settlementYuan={settlementYuan}
          collectionMode={collectionMode}
          depositYuan={depositYuan}
          balanceYuan={balanceYuan}
          partnerCollectedYuan={partnerCollectedYuan}
          guestCollectYuan={guestCollectYuan}
          customerTopUpYuan={customerTopUpYuan}
          rebateYuan={rebateYuan}
        />
      ) : null}
      {readOnly ? (
        <Flex justify="flex-end">
          <Button onClick={onClose}>关闭</Button>
        </Flex>
      ) : (
        <Flex justify="flex-end">
          <Space>
            <Button onClick={onClose} disabled={actionsBusy}>
              取消
            </Button>
            {canSaveAndGenerate ? (
              <Button
                loading={saveAndGenerateLoading}
                disabled={!detailReady || actionsBusy}
                onClick={() => onSubmitIntent('saveAndGenerate')}
              >
                保存并提交应收
              </Button>
            ) : null}
            <Button
              type="primary"
              loading={loading}
              disabled={!detailReady || saveAndGenerateLoading}
              onClick={() => onSubmitIntent('save')}
            >
              保存
            </Button>
          </Space>
        </Flex>
      )}
    </Flex>
  )
}

interface SourceOrderDrawerFormProps extends SourceOrderFormFieldsProps {
  form: FormInstance<SourceOrderFormValues>
  formKey: string
  initialValues: SourceOrderFormValues
  resolvedOrder: SourceOrderSummary | null
  submitIntentRef: RefObject<'save' | 'saveAndGenerate'>
  hasFareDraftRef: RefObject<boolean>
  hasGuestDraftRef: RefObject<boolean>
  guestSyncRef: RefObject<SourceOrderGuestSyncBundle | null>
  onSubmit: SourceOrderDrawerProps['onSubmit']
}

function SourceOrderDrawerForm({
  form,
  formKey,
  initialValues,
  resolvedOrder,
  submitIntentRef,
  hasFareDraftRef,
  hasGuestDraftRef,
  guestSyncRef,
  onSubmit,
  ...fieldProps
}: SourceOrderDrawerFormProps) {
  const { message } = App.useApp()
  const resetSubmitIntent = () => {
    submitIntentRef.current = 'save'
  }

  return (
    <Form
      key={formKey}
      form={form}
      layout="vertical"
      disabled={fieldProps.readOnly}
      scrollToFirstError={{ focus: true }}
      initialValues={initialValues}
      onFinish={(values) => {
        if (hasFareDraftRef.current) {
          message.warning('请先保存或取消当前调整行后再保存客源单')
          resetSubmitIntent()
          return
        }
        if (hasGuestDraftRef.current) {
          message.warning('请先保存或取消当前名单行后再保存客源单')
          resetSubmitIntent()
          return
        }
        const pathBaseline: SourceOrderPathBaseline | null = resolvedOrder
          ? {
              guestCollectCents: resolvedOrder.guestCollectCents,
              partnerCollectedCents: resolvedOrder.partnerCollectedCents,
              depositCents: resolvedOrder.depositCents,
              balanceCents: resolvedOrder.balanceCents,
            }
          : null
        const generateReceivable = submitIntentRef.current === 'saveAndGenerate'
        const guests = guestSyncRef.current ?? {
          baseline: fieldProps.guestBaseline,
          next: fieldProps.guestBaseline.map(guestSummaryToFormRow),
        }
        resetSubmitIntent()
        onSubmit(formValuesToPayload(values), pathBaseline, {
          generateReceivable,
          guests,
        })
      }}
      onFinishFailed={resetSubmitIntent}
    >
      <SourceOrderFormFields {...fieldProps} />
    </Form>
  )
}

function SourceOrderDrawerSession({
  open,
  editing,
  readOnly,
  amountReadOnly = false,
  loading,
  canSaveAndGenerate = false,
  saveAndGenerateLoading = false,
  onClose,
  onSubmit,
}: SourceOrderDrawerProps) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const [form] = Form.useForm<SourceOrderFormValues>()
  const submitIntentRef = useRef<'save' | 'saveAndGenerate'>('save')
  const scrollingByTabRef = useRef(false)
  const hasFareDraftRef = useRef(false)
  const hasGuestDraftRef = useRef(false)
  const guestSyncRef = useRef<SourceOrderGuestSyncBundle | null>(null)
  const [activeSection, setActiveSection] = useState<DrawerSectionKey>('basics')
  const [partnerSearch, setPartnerSearch] = useState('')
  const sourceOrderId = editing?.id ?? null
  const isCreate = open && !sourceOrderId
  const actionsBusy = loading || saveAndGenerateLoading

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['source-order', sourceOrderId],
    queryFn: ({ signal }) => getSourceOrder(sourceOrderId!, signal),
    enabled: open && Boolean(sourceOrderId),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const {
    data: loadedGuests = [],
    isSuccess: guestsLoaded,
  } = useQuery({
    queryKey: ['source-order-guests', sourceOrderId],
    queryFn: () => listSourceOrderGuests(sourceOrderId!),
    enabled: open && Boolean(sourceOrderId),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const resolvedOrder = isCreate ? null : (detail ?? null)
  const detailReady = isCreate || Boolean(detail)
  const guestsReady = isCreate || guestsLoaded
  const formKey = sourceOrderId ?? 'new'
  const guestBaseline = isCreate ? [] : loadedGuests
  const guestSessionKey = formKey
  const onGuestSyncBundleChange = useCallback((bundle: SourceOrderGuestSyncBundle) => {
    guestSyncRef.current = bundle
  }, [])

  const discountType = Form.useWatch('discountType', form)
  const discountYuan = Form.useWatch('discountYuan', form)
  const collectionMode = Form.useWatch('collectionMode', form)
  const depositYuan = Form.useWatch('depositYuan', form)
  const balanceYuan = Form.useWatch('balanceYuan', form)
  const adultGuestCount = Form.useWatch('adultGuestCount', form) ?? 0
  const childGuestCount = Form.useWatch('childGuestCount', form) ?? 0
  const adultUnitPriceYuan = Form.useWatch('adultUnitPriceYuan', form)
  const childUnitPriceYuan = Form.useWatch('childUnitPriceYuan', form)
  const fareAdjustments =
    Form.useWatch('fareAdjustments', form) ??
    ([] as SourceOrderFormValues['fareAdjustments'])
  const amountFieldsLocked = Boolean(resolvedOrder?.amountFieldsLocked)
  const lockAmounts = readOnly || amountReadOnly || amountFieldsLocked

  const derivedTotalGuests = totalGuestCount({
    adultGuestCount,
    childGuestCount,
  })
  const derivedAmounts = computeFormAmounts({
    adultGuestCount: adultGuestCount ?? 0,
    childGuestCount: childGuestCount ?? 0,
    adultUnitPriceYuan,
    childUnitPriceYuan,
    discountType: discountType ?? SourceOrderDiscountType.NONE,
    discountYuan,
    collectionMode: collectionMode ?? SourceOrderCollectionMode.GUEST_ONLY,
    depositYuan,
    balanceYuan,
    fareAdjustments,
  })
  const derivedGrossYuan = derivedAmounts.grossReceivableCents / 100
  const derivedAdjustmentNetYuan = derivedAmounts.fareAdjustmentNetCents / 100
  const derivedDiscountYuan = derivedAmounts.discountCents / 100
  const derivedSettlementYuan = derivedAmounts.netReceivableCents / 100

  const initialValues = useMemo(
    () =>
      resolvedOrder
        ? sourceOrderToFormValues(resolvedOrder)
        : createEmptySourceOrderFormValues(),
    [resolvedOrder],
  )

  const resetSubmitIntent = () => {
    submitIntentRef.current = 'save'
  }

  useEffect(() => {
    if (!detailReady) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
  }, [detailReady, form, initialValues])

  const handleClose = () => {
    resetSubmitIntent()
    hasFareDraftRef.current = false
    hasGuestDraftRef.current = false
    guestSyncRef.current = null
    form.resetFields()
    onClose()
  }

  const scrollToSection = (key: DrawerSectionKey) => {
    setActiveSection(key)
    scrollingByTabRef.current = true
    window.requestAnimationFrame(() => {
      const node = document.getElementById(sectionDomId(key))
      const body = node?.closest('.ant-drawer-body') as HTMLElement | null
      if (node && body && typeof body.scrollTo === 'function') {
        const stickyOffset = token.paddingXL + token.paddingLG
        const nextTop =
          body.scrollTop +
          (node.getBoundingClientRect().top - body.getBoundingClientRect().top) -
          stickyOffset
        body.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
      } else {
        node?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      }
      window.setTimeout(() => {
        scrollingByTabRef.current = false
      }, 450)
    })
  }

  useSourceOrderSectionObserver({
    open,
    detailReady,
    scrollingByTabRef,
    setActiveSection,
  })

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'source-order-select'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open,
  })

  const drawerLoading = Boolean(sourceOrderId) && detailLoading && !detail

  const trySubmit = (intent: 'save' | 'saveAndGenerate') => {
    if (hasFareDraftRef.current) {
      message.warning('请先保存或取消当前调整行后再保存客源单')
      return
    }
    if (hasGuestDraftRef.current) {
      message.warning('请先保存或取消当前名单行后再保存客源单')
      return
    }
    submitIntentRef.current = intent
    form.submit()
  }

  const resolvedCollectionMode =
    collectionMode ?? SourceOrderCollectionMode.GUEST_ONLY

  return (
    <Drawer
      title={readOnly ? '查看客源单' : sourceOrderId ? '编辑客源单' : '添加客源单'}
      open={open}
      size={960}
      onClose={handleClose}
      destroyOnHidden
      loading={drawerLoading}
      styles={{
        footer: { paddingBlock: token.paddingMD },
        wrapper: { maxWidth: '100vw' },
      }}
      footer={
        detailError && sourceOrderId ? null : (
          <SourceOrderDrawerFooter
            readOnly={readOnly}
            detailReady={detailReady}
            actionsBusy={actionsBusy}
            canSaveAndGenerate={canSaveAndGenerate}
            saveAndGenerateLoading={saveAndGenerateLoading}
            loading={loading}
            grossYuan={derivedGrossYuan}
            adjustmentNetYuan={derivedAdjustmentNetYuan}
            discountYuan={derivedDiscountYuan}
            settlementYuan={derivedSettlementYuan}
            collectionMode={resolvedCollectionMode}
            depositYuan={
              resolvedCollectionMode === SourceOrderCollectionMode.PARTNER_SETTLED
                ? 0
                : Number(depositYuan ?? 0)
            }
            balanceYuan={
              resolvedCollectionMode === SourceOrderCollectionMode.PARTNER_SETTLED
                ? 0
                : Number(balanceYuan ?? 0)
            }
            partnerCollectedYuan={derivedAmounts.partnerCollectedCents / 100}
            guestCollectYuan={derivedAmounts.guestCollectCents / 100}
            customerTopUpYuan={derivedAmounts.estimatedCustomerTopUpCents / 100}
            rebateYuan={derivedAmounts.estimatedRebateCents / 100}
            onClose={handleClose}
            onSubmitIntent={trySubmit}
          />
        )
      }
    >
      {detailError && sourceOrderId ? (
        <Alert
          type="error"
          showIcon
          title="客源单加载失败"
          description="请检查网络后重试。"
          action={
            <Button size="small" onClick={() => void refetchDetail()}>
              重试
            </Button>
          }
        />
      ) : null}
      {resolvedOrder?.hasSourceAmountMismatch ? (
        <Alert
          type="warning"
          showIcon
          title="来源差异警示"
          description="客源单金额与已提交的应收节点不一致，且财务已介入，请核对后再处理。"
          style={{ marginBottom: token.marginMD }}
        />
      ) : null}
      {detailReady && !detailError ? (
        <>
          <FormSectionNav activeKey={activeSection} onChange={scrollToSection} />
          <SourceOrderDrawerForm
            form={form}
            formKey={formKey}
            initialValues={initialValues}
            resolvedOrder={resolvedOrder}
            submitIntentRef={submitIntentRef}
            hasFareDraftRef={hasFareDraftRef}
            hasGuestDraftRef={hasGuestDraftRef}
            guestSyncRef={guestSyncRef}
            onSubmit={onSubmit}
            partners={partnersResult?.items ?? []}
            partnerSearch={partnerSearch}
            onPartnerSearch={setPartnerSearch}
            lockAmounts={lockAmounts}
            readOnly={readOnly}
            derivedTotalGuests={derivedTotalGuests}
            derivedGrossYuan={derivedGrossYuan}
            derivedAdjustmentNetYuan={derivedAdjustmentNetYuan}
            discountType={discountType}
            collectionMode={collectionMode}
            onFareDraftPresenceChange={(hasDraft) => {
              hasFareDraftRef.current = hasDraft
            }}
            guestSessionKey={guestSessionKey}
            guestBaseline={guestBaseline}
            guestBaselineReady={guestsReady}
            onGuestDraftPresenceChange={(hasDraft) => {
              hasGuestDraftRef.current = hasDraft
            }}
            onGuestSyncBundleChange={onGuestSyncBundleChange}
          />
        </>
      ) : null}
    </Drawer>
  )
}
