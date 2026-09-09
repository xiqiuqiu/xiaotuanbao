import { formatCents } from '@/features/departure/catalog'
import styles from './SourceOrderReviewPanel.module.css'
import { SourceOrderReviewField } from './SourceOrderReviewField'
import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Form,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import { useId, useMemo, useState } from 'react'
import {
  SOURCE_ORDER_REVIEW_GROUP_LABELS,
  SOURCE_ORDER_REVIEW_GROUPS,
  registeredReviewSchemas,
  type SourceOrderReviewGroup,
} from '@xiaotuanbao/ai-contracts'
import type { AiReviewCandidateView, AiReviewPackageView } from '@xiaotuanbao/shared'

export interface SourceOrderReviewPanelProps {
  pendingReview?: AiReviewPackageView
  readOnly?: boolean
  error?: string
  saving?: boolean
  confirming?: boolean
  confirmationBlockedReason?: string
  createdSourceOrderId?: string | null
  continuingReceivables?: boolean
  onSaveGroup?: (corrections: Record<string, unknown>) => Promise<void>
  onConfirm?: () => Promise<void>
  onViewSourceOrder?: (sourceOrderId: string) => void
  onContinueReceivables?: (sourceOrderId: string) => void
  onSkipReceivables?: () => void
  /** 准备应收挂在 /departure（ADR-0023），与客源创建所需的 departure:write / readOnly 分开。 */
  canContinueReceivables?: boolean
}

export function SourceOrderReviewPanel({
  pendingReview,
  readOnly = false,
  saving,
  error,
  confirming,
  confirmationBlockedReason,
  createdSourceOrderId,
  continuingReceivables,
  onSaveGroup,
  onConfirm,
  onViewSourceOrder,
  onContinueReceivables,
  onSkipReceivables,
  canContinueReceivables = true,
}: SourceOrderReviewPanelProps) {
  const savedValues = useMemo(
    () => (pendingReview ? valuesFromReviewCandidates(pendingReview.candidates) : {}),
    [pendingReview],
  )
  const [editingGroup, setEditingGroup] = useState<SourceOrderReviewGroup | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [rowDraftPending, setRowDraftPending] = useState(false)
  const values = editingGroup ? { ...savedValues, ...draft } : savedValues
  const missing = missingSourceOrderLabels(values)
  const missingLabels = new Set(missing)
  const confirmReasonId = useId()
  const confirmDisabledReason = confirmationBlockedReason ?? sourceOrderConfirmDisabledReason(readOnly, saving, editingGroup, missing)

  if (createdSourceOrderId) {
    return (
      <section aria-label="客源单已创建">
        <Alert
          type="success"
          showIcon
          title="客源单已创建"
          description="创建时未自动提交应收。可暂不处理、查看客源单，或继续提交约定应收。"
        />
        {error ? <Alert type="error" showIcon title={error} style={{ marginTop: 12 }} /> : null}
        {!canContinueReceivables ? (
          <Alert
            type="info"
            showIcon
            title="当前不能从这里准备应收"
            description="可查看客源单，或稍后从有权限的会话继续。"
            style={{ marginTop: 12 }}
          />
        ) : null}
        <Space style={{ marginTop: 12 }} wrap>
          {canContinueReceivables ? (
            <Button onClick={() => onSkipReceivables?.()}>暂不处理</Button>
          ) : null}
          <Button onClick={() => onViewSourceOrder?.(createdSourceOrderId)}>查看客源单</Button>
          {canContinueReceivables ? (
            <Button
              type="primary"
              loading={continuingReceivables}
              onClick={() => onContinueReceivables?.(createdSourceOrderId)}
            >
              继续提交应收
            </Button>
          ) : null}
        </Space>
      </section>
    )
  }

  const schema = pendingReview
    ? registeredReviewSchemas.findByPayloadSchema(pendingReview.payloadSchema)
    : undefined
  const unit = schema?.confirmationUnits.find(
    (candidate) => candidate.key === pendingReview?.confirmationUnit,
  )
  if (!pendingReview || !schema || !unit || pendingReview.schemaSupported !== true) {
    return (
      <Alert type="error" showIcon title="审核包版本不受支持，暂无法确认。请在会话中重新整理。" />
    )
  }

  return (
    <section className={styles.panel} aria-label="客源单审核">
      <Typography.Text strong className={styles.title}>
        客源单审核
      </Typography.Text>
      <Typography.Paragraph type="secondary">
        核对客户、团款与名单；有误可在组内修改，确认后创建客源单。
      </Typography.Paragraph>
      {readOnly ? (
        <Alert
          type="info"
          showIcon
          title="当前为只读模式"
          description="你可以查看审核内容；修改和确认需要发团编辑权限。"
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {missing.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={`待确认缺失项：${missing.join('、')}`}
          action={
            <ConfirmEmptySourceOrderFields
              values={savedValues}
              readOnly={readOnly}
              editing={Boolean(editingGroup)}
              saving={saving}
              confirming={confirming}
              onSave={onSaveGroup}
            />
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} /> : null}
      <SourceOrderAmountPreview values={values} />
      <Collapse
        className={styles.groups}
        size="small"
        defaultActiveKey={[...SOURCE_ORDER_REVIEW_GROUPS]}
        items={SOURCE_ORDER_REVIEW_GROUPS.map((group) => {
          const fields = unit.fields.filter((field) => field.group === group)
          const editing = editingGroup === group
          const rows = fields.map((field) => {
            const value = values[field.key]
            const notApplicable =
              (field.key === 'childUnitPriceCents' && values.childGuestCount === 0) ||
              (field.key === 'adultUnitPriceCents' && values.adultGuestCount === 0) ||
              (['depositCents', 'balanceCents'].includes(field.key) &&
                values.collectionMode === 'partner_settled') ||
              (field.key === 'discountCents' && values.discountType === 'none')
            return {
              key: field.key,
              label: field.label,
              children: (
                <>
                  {value == null && !notApplicable && missingLabels.has(field.label) ? (
                    <Tag color="warning">待补充</Tag>
                  ) : null}
                  {notApplicable ? (
                    <Typography.Text type="secondary">不适用</Typography.Text>
                  ) : (
                    <SourceOrderReviewField
                      field={field}
                      value={value}
                      editing={editing && !readOnly}
                      onChange={(next) =>
                        setDraft((current) => ({
                          ...current,
                          [field.key]: next,
                        }))
                      }
                      onDraftPresenceChange={setRowDraftPending}
                    />
                  )}
                </>
              ),
            }
          })
          return {
            key: group,
            label: (
              <Typography.Text strong>{SOURCE_ORDER_REVIEW_GROUP_LABELS[group]}</Typography.Text>
            ),
            children: (
              <>
                {editing ? (
                  <Form layout="vertical" component="div" disabled={readOnly || saving}>
                    <div className={styles.fields}>
                      {rows.map((row, index) => (
                        <Form.Item
                          key={row.key}
                          label={row.label}
                          className={styles.field}
                          data-wide={fields[index].control !== 'integer' || undefined}
                        >
                          <div>{row.children}</div>
                        </Form.Item>
                      ))}
                    </div>
                  </Form>
                ) : rows.length === 1 ? (
                  rows[0].children
                ) : (
                  <Descriptions size="small" column={1} items={rows} />
                )}
                {editing ? (
                  <Space className={styles.groupActions}>
                    <Button
                      size="small"
                      disabled={readOnly}
                      onClick={() => {
                        setEditingGroup(null)
                        setRowDraftPending(false)
                        setDraft({})
                      }}
                    >
                      取消
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      loading={saving}
                      disabled={readOnly || rowDraftPending}
                      onClick={() => {
                        void onSaveGroup?.(draft)
                          .then(() => {
                            setEditingGroup(null)
                            setRowDraftPending(false)
                            setDraft({})
                          })
                          .catch(() => undefined)
                      }}
                    >
                      保存本组
                    </Button>
                  </Space>
                ) : (
                  <Button
                    className={styles.editGroup}
                    size="small"
                    disabled={readOnly || Boolean(editingGroup) || confirming}
                    onClick={() => {
                      setEditingGroup(group)
                      setDraft({})
                    }}
                  >
                    组内编辑
                  </Button>
                )}
              </>
            ),
          }
        })}
      />
      <div className={styles.actions}>
        {confirmDisabledReason ? (
          <Typography.Text id={confirmReasonId} type="secondary" role="status">
            {confirmDisabledReason}
          </Typography.Text>
        ) : null}
        <Button
          type={editingGroup ? 'default' : 'primary'}
          loading={confirming}
          disabled={Boolean(confirmDisabledReason)}
          aria-describedby={confirmDisabledReason ? confirmReasonId : undefined}
          onClick={() => void onConfirm?.().catch(() => undefined)}
        >
          确认写入客源单
        </Button>
      </div>
    </section>
  )
}

function ConfirmEmptySourceOrderFields({ values, readOnly, editing, saving, confirming, onSave }: {
  values: Record<string, unknown>
  readOnly: boolean
  editing: boolean
  saving?: boolean
  confirming?: boolean
  onSave?: SourceOrderReviewPanelProps['onSaveGroup']
}) {
  const corrections: Record<string, unknown> = {}
  const labels: string[] = []
  if (values.fareAdjustments == null) {
    corrections.fareAdjustments = []
    labels.push('无调整')
  }
  if (values.discountType == null) {
    corrections.discountType = 'none'
    labels.push('无优惠')
  }
  if (!labels.length) return null
  return (
    <Button
      size="small"
      disabled={readOnly || editing || saving || confirming || !onSave}
      onClick={() => void onSave?.(corrections).catch(() => undefined)}
    >
      确认{labels.join('、')}
    </Button>
  )
}

function SourceOrderAmountPreview({ values }: { values: Record<string, unknown> }) {
  const adultCount = typeof values.adultGuestCount === 'number' ? values.adultGuestCount : null
  const childCount = typeof values.childGuestCount === 'number' ? values.childGuestCount : null
  if (adultCount == null || childCount == null) {
    return null
  }
  const adultPrice =
    adultCount === 0
      ? 0
      : typeof values.adultUnitPriceCents === 'number'
        ? values.adultUnitPriceCents
        : null
  const childPrice =
    childCount === 0
      ? 0
      : typeof values.childUnitPriceCents === 'number'
        ? values.childUnitPriceCents
        : null
  if (adultPrice == null || childPrice == null) {
    return null
  }
  const gross = adultCount * adultPrice + childCount * childPrice
  const adjustments = Array.isArray(values.fareAdjustments) ? values.fareAdjustments : null
  if (adjustments == null) {
    return (
      <Typography.Paragraph type="secondary">
        原始团款 {formatCents(gross)}；调整与优惠待确认后重算。
      </Typography.Paragraph>
    )
  }
  const adjustmentNet = adjustments.reduce((sum: number, row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      typeof (row as { amountCents?: unknown }).amountCents !== 'number'
    ) {
      return sum
    }
    const amount = (row as { amountCents: number; direction?: string }).amountCents
    return (row as { direction?: string }).direction === 'decrease' ? sum - amount : sum + amount
  }, 0)
  const discount =
    values.discountType === 'lump_sum' && typeof values.discountCents === 'number'
      ? values.discountCents
      : values.discountType === 'none'
        ? 0
        : null
  if (discount == null) {
    return (
      <Typography.Paragraph type="secondary">
        原始团款 {formatCents(gross)}，调整净额 {formatCents(adjustmentNet)}{' '}
        ；优惠待确认后重算结算金额。
      </Typography.Paragraph>
    )
  }
  const net = gross + adjustmentNet - discount
  return (
    <section className={styles.amounts} aria-label="团款核算">
      <Statistic title="原始团款" value={gross} formatter={() => formatCents(gross)} />
      <Statistic
        title="调整净额"
        value={adjustmentNet}
        formatter={() => `${adjustmentNet > 0 ? '+' : ''}${formatCents(adjustmentNet)}`}
      />
      <Statistic title="团款优惠" value={discount} formatter={() => formatCents(discount)} />
      <Statistic
        className={styles.netAmount}
        title="结算金额"
        value={net}
        formatter={() => formatCents(net)}
      />
    </section>
  )
}

function valuesFromReviewCandidates(candidates: AiReviewCandidateView[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const candidate of candidates) {
    values[candidate.fieldKey] =
      candidate.userCorrectedValue !== undefined
        ? candidate.userCorrectedValue
        : candidate.proposedValue
  }
  return values
}

function sourceOrderConfirmDisabledReason(
  readOnly: boolean,
  saving: boolean | undefined,
  editingGroup: SourceOrderReviewGroup | null,
  missing: string[],
) {
  if (readOnly) return '确认需要发团编辑权限。'
  if (saving) return '正在保存审核内容，请稍候。'
  if (editingGroup) return '请先保存或取消当前组的编辑。'
  if (missing.length) return `请通过组内编辑补充：${missing.join('、')}；保存后再确认。`
  return undefined
}

function missingSourceOrderLabels(values: Record<string, unknown>): string[] {
  const missing: string[] = []
  if (typeof values.partnerId !== 'string' || !values.partnerId) missing.push('客户')
  if (typeof values.adultGuestCount !== 'number') missing.push('成人人数')
  if (typeof values.childGuestCount !== 'number') missing.push('儿童人数')
  if (
    typeof values.adultGuestCount === 'number' &&
    values.adultGuestCount > 0 &&
    typeof values.adultUnitPriceCents !== 'number'
  ) {
    missing.push('成人单价')
  }
  if (
    typeof values.childGuestCount === 'number' &&
    values.childGuestCount > 0 &&
    typeof values.childUnitPriceCents !== 'number'
  ) {
    missing.push('儿童单价')
  }
  if (
    Array.isArray(values.guests) &&
    values.guests.some((row) => row?.included !== false && !row?.name?.trim())
  )
    missing.push('选定客人的姓名')
  if (values.fareAdjustments == null) missing.push('团款调整')
  if (typeof values.discountType !== 'string') missing.push('优惠方式')
  if (values.discountType === 'lump_sum' && typeof values.discountCents !== 'number') {
    missing.push('优惠金额')
  }
  if (typeof values.collectionMode !== 'string') missing.push('收款方式')
  if (values.collectionMode === 'guest_only' || values.collectionMode === 'split') {
    if (typeof values.depositCents !== 'number') missing.push('定金')
    if (typeof values.balanceCents !== 'number') missing.push('尾款')
  }
  return missing
}
