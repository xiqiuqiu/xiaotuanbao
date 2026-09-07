import { Alert, Button, Collapse, Input, InputNumber, Select, Space, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'
import {
  SOURCE_ORDER_REVIEW_GROUP_LABELS,
  SOURCE_ORDER_REVIEW_GROUPS,
  registeredReviewSchemas,
  type SourceOrderReviewGroup,
} from '@xiaotuanbao/ai-contracts'
import type { AiReviewCandidateView, AiReviewPackageView } from '@xiaotuanbao/shared'

export interface SourceOrderReviewPanelProps {
  pendingReview?: AiReviewPackageView
  saving?: boolean
  confirming?: boolean
  createdSourceOrderId?: string | null
  onSaveGroup?: (corrections: Record<string, unknown>) => Promise<void>
  onConfirm?: () => Promise<void>
  onViewSourceOrder?: (sourceOrderId: string) => void
  onContinueReceivables?: (sourceOrderId: string) => void
}

export function SourceOrderReviewPanel({
  pendingReview,
  saving,
  confirming,
  createdSourceOrderId,
  onSaveGroup,
  onConfirm,
  onViewSourceOrder,
  onContinueReceivables,
}: SourceOrderReviewPanelProps) {
  const savedValues = useMemo(
    () => (pendingReview ? valuesFromReviewCandidates(pendingReview.candidates) : {}),
    [pendingReview],
  )
  const [editingGroup, setEditingGroup] = useState<SourceOrderReviewGroup | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const values = editingGroup ? { ...savedValues, ...draft } : savedValues
  const missing = missingSourceOrderLabels(values)

  if (createdSourceOrderId) {
    return (
      <section aria-label="客源单已创建">
        <Alert
          type="success"
          showIcon
          title="客源单已创建，尚未提交应收"
          description="分组结果已保留。是否提交初始应收由你另选，不会在创建时自动提交。"
        />
        <Space style={{ marginTop: 12 }} wrap>
          <Button onClick={() => onViewSourceOrder?.(createdSourceOrderId)}>查看客源单</Button>
          <Button type="primary" onClick={() => onContinueReceivables?.(createdSourceOrderId)}>
            继续提交应收
          </Button>
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
    return <Alert type="error" showIcon title="审核包版本不受支持，请拒绝本次建议" />
  }

  return (
    <section aria-label="客源单审核">
      <Typography.Text strong>客源单审核</Typography.Text>
      <Typography.Paragraph type="secondary">
        按组修订后保存会重算摘要；确认时一张客源单与本次选定名单一起写入。
      </Typography.Paragraph>
      {missing.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={`待确认缺失项：${missing.join('、')}`}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <SourceOrderAmountPreview values={values} />
      <Collapse
        bordered={false}
        defaultActiveKey={[...SOURCE_ORDER_REVIEW_GROUPS]}
        items={SOURCE_ORDER_REVIEW_GROUPS.map((group) => {
          const fields = unit.fields.filter((field) => field.group === group)
          const editing = editingGroup === group
          return {
            key: group,
            label: SOURCE_ORDER_REVIEW_GROUP_LABELS[group],
            children: (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                {fields.map((field) => {
                  const value = values[field.key]
                  return (
                    <div key={field.key}>
                      <Typography.Text type="secondary">{field.label}</Typography.Text>
                      {value == null ? <Tag style={{ marginInlineStart: 8 }}>缺失</Tag> : null}
                      {editing ? (
                        <ReviewFieldEditor
                          control={field.control}
                          options={field.options}
                          value={value}
                          onChange={(next) =>
                            setDraft((current) => ({ ...current, [field.key]: next }))
                          }
                        />
                      ) : (
                        <Typography.Paragraph style={{ marginBottom: 0 }}>
                          {field.format(value)}
                        </Typography.Paragraph>
                      )}
                    </div>
                  )
                })}
                {editing ? (
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      loading={saving}
                      onClick={() => {
                        void onSaveGroup?.({ ...savedValues, ...draft }).then(() => {
                          setEditingGroup(null)
                          setDraft({})
                        })
                      }}
                    >
                      保存本组
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setEditingGroup(null)
                        setDraft({})
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                ) : (
                  <Button
                    size="small"
                    disabled={Boolean(editingGroup) || confirming}
                    onClick={() => {
                      setEditingGroup(group)
                      setDraft({})
                    }}
                  >
                    组内编辑
                  </Button>
                )}
              </Space>
            ),
          }
        })}
      />
      <div style={{ marginTop: 16 }}>
        <Button
          type="primary"
          loading={confirming}
          disabled={Boolean(editingGroup) || missing.length > 0}
          onClick={() => void onConfirm?.()}
        >
          确认写入客源单
        </Button>
      </div>
    </section>
  )
}

function ReviewFieldEditor({
  control,
  options,
  value,
  onChange,
}: {
  control: string
  options?: readonly { label: string; value: string }[]
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (control === 'choice' && options) {
    return (
      <Select
        allowClear
        value={typeof value === 'string' ? value : undefined}
        options={options.map((option) => ({ label: option.label, value: option.value }))}
        onChange={(next) => onChange(next ?? null)}
        style={{ width: '100%' }}
      />
    )
  }
  if (control === 'integer') {
    return (
      <InputNumber
        value={typeof value === 'number' ? value : undefined}
        onChange={(next) => onChange(next ?? null)}
        style={{ width: '100%' }}
      />
    )
  }
  if (control === 'list') {
    return (
      <Input.TextArea
        value={value == null ? '' : JSON.stringify(value, null, 2)}
        onChange={(event) => {
          const text = event.target.value.trim()
          if (!text) {
            onChange(null)
            return
          }
          try {
            onChange(JSON.parse(text) as unknown)
          } catch {
            onChange(value)
          }
        }}
        rows={4}
      />
    )
  }
  return (
    <Input
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value || null)}
    />
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
        原始团款 B={(gross / 100).toFixed(2)} 元；调整与优惠待确认后重算。
      </Typography.Paragraph>
    )
  }
  const adjustmentNet = adjustments.reduce((sum: number, row) => {
    if (!row || typeof row !== 'object' || typeof (row as { amountCents?: unknown }).amountCents !== 'number') {
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
        原始团款 B={(gross / 100).toFixed(2)} 元，调整净额 A={(adjustmentNet / 100).toFixed(2)}{' '}
        元；优惠待确认后重算结算金额。
      </Typography.Paragraph>
    )
  }
  const net = gross + adjustmentNet - discount
  return (
    <Typography.Paragraph type="secondary">
      原始团款 B={(gross / 100).toFixed(2)} 元，调整净额 A={(adjustmentNet / 100).toFixed(2)} 元，结算金额
      S={(net / 100).toFixed(2)} 元。
    </Typography.Paragraph>
  )
}

function valuesFromReviewCandidates(
  candidates: AiReviewCandidateView[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const candidate of candidates) {
    values[candidate.fieldKey] =
      candidate.userCorrectedValue !== undefined
        ? candidate.userCorrectedValue
        : candidate.proposedValue
  }
  return values
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
  if (values.fareAdjustments == null) missing.push('团款调整')
  if (typeof values.discountType !== 'string') missing.push('优惠方式')
  if (values.discountType === 'lump_sum' && typeof values.discountCents !== 'number') {
    missing.push('优惠金额')
  }
  if (typeof values.collectionMode !== 'string') missing.push('收款方式')
  if (
    (values.collectionMode === 'guest_only' || values.collectionMode === 'split') &&
    (typeof values.depositCents !== 'number' || typeof values.balanceCents !== 'number')
  ) {
    missing.push('代收约定')
  }
  return missing
}
