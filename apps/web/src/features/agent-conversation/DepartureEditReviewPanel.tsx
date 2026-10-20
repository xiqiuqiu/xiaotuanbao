import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import {
  SOURCE_ORDER_GUESTS_UPDATE_REVIEW_PAYLOAD_SCHEMA,
  resolveReviewField,
  sourceOrderGuestChangesSchema,
  type SourceOrderGuestChanges,
} from '@xiaotuanbao/ai-contracts'
import type { AiReviewPackageView, ReviewConfirmationView } from '@/types/api'
import {
  acceptReviewConfirmation,
  getReviewConfirmation,
  patchAiReviewPackage,
  rejectAiReviewPackage,
  cancelAiReviewPackage,
} from '@/services/ai-create-task.service'
import { awaitReviewConfirmationItem } from '@/features/departure/components/await-review-confirmation-item'
import { GUEST_GENDER_OPTIONS } from '@/features/departure/catalog'
import { useConfirmedReviewInvalidation } from './review-confirmation-for-package'
import styles from './SegmentResourceReviewPanel.module.css'

const guestLabels = { name: '姓名', phone: '电话', gender: '性别', notes: '备注' } as const
const guestKeys = ['name', 'phone', 'gender', 'notes'] as const
function display(value: unknown): string {
  if (value == null || value === '') return '未填写'
  if (Array.isArray(value)) return value.map(display).join('；') || '无'
  if (typeof value === 'object')
    return guestKeys
      .map((key) => {
        const fieldValue = Reflect.get(value, key)
        const text =
          key === 'gender'
            ? (GUEST_GENDER_OPTIONS.find((option) => option.value === fieldValue)?.label ??
              display(fieldValue))
            : display(fieldValue)
        return `${guestLabels[key]}：${text}`
      })
      .join('，')
  return String(value)
}

export function DepartureEditReviewPanel({
  pkg,
  departureId,
  canEdit,
  confirmation,
}: {
  pkg: AiReviewPackageView
  departureId: string
  canEdit: boolean
  confirmation?: ReviewConfirmationView['items'][number]
}) {
  const queryClient = useQueryClient()
  const invalidateSucceeded = useConfirmedReviewInvalidation(departureId, pkg, confirmation)
  const [corrections, setCorrections] = useState<Record<string, unknown>>({})
  const [completed, setCompleted] = useState(false)
  const [correctionVersion, setCorrectionVersion] = useState(pkg.version)
  const hasCorrections = Object.keys(corrections).length > 0
  const revisionConflict = hasCorrections && correctionVersion !== pkg.version
  const decisions = useRef<Record<string, string>>({})
  const savedVersion = useRef(pkg.version)
  const baseline: Record<string, unknown> = { ...pkg.baselineSnapshot }
  const guestsReview = pkg.payloadSchema === SOURCE_ORDER_GUESTS_UPDATE_REVIEW_PAYLOAD_SCHEMA
  const title = guestsReview ? '游客名单修改审核' : '行程段修改审核'
  const value = (key: string) => {
    if (Object.hasOwn(corrections, key)) return corrections[key]
    const candidate = pkg.candidates.find((item) => item.fieldKey === key)
    return candidate?.userCorrectedValue !== undefined
      ? candidate.userCorrectedValue
      : candidate?.proposedValue
  }
  const patch = (key: string, next: unknown) => {
    if (!hasCorrections) setCorrectionVersion(pkg.version)
    setCorrections((current) => ({ ...current, [key]: next }))
  }
  const validation = pkg.candidates.flatMap((candidate) => {
    const field = resolveReviewField(pkg.payloadSchema, pkg.confirmationUnit, candidate.fieldKey)
    return !field || !field.valueSchema.safeParse(value(candidate.fieldKey)).success
      ? [field?.label ?? candidate.fieldKey]
      : []
  })
  const startDate = value('startDate') === undefined ? baseline.startDate : value('startDate')
  const endDate = value('endDate') === undefined ? baseline.endDate : value('endDate')
  if (typeof startDate === 'string' && typeof endDate === 'string' && startDate > endDate)
    validation.push('结束日期不能早于开始日期')
  const pending = pkg.status === 'pending' || pkg.status === 'conflict'
  const action = useMutation({
    mutationFn: async (kind: 'save' | 'confirm' | 'reject' | 'cancel') => {
      if ((kind === 'save' || kind === 'confirm') && revisionConflict)
        throw new Error('建议已有新版本，请先核对最新建议')
      let version = Math.max(savedVersion.current, pkg.version)
      if ((kind === 'save' || kind === 'confirm') && Object.keys(corrections).length) {
        const summary = await patchAiReviewPackage('', pkg.id, {
          expectedPackageVersion: version,
          corrections,
        })
        const updated =
          summary.pendingReviews?.find((item) => item.id === pkg.id) ??
          (summary.pendingReview?.id === pkg.id ? summary.pendingReview : undefined)
        if (!updated) throw new Error('未取得修订后的审核包，请刷新后重试')
        version = updated.version
        savedVersion.current = version
        setCorrections({})
        setCorrectionVersion(version)
      }
      if (kind === 'confirm') {
        const key = `${pkg.id}:${version}`
        const decisionCommandId = decisions.current[key] ?? crypto.randomUUID()
        decisions.current[key] = decisionCommandId
        const accepted = await acceptReviewConfirmation({
          decisionCommandId,
          items: [{ packageId: pkg.id, expectedPackageVersion: version }],
        })
        const acceptedItem = accepted.items.find((item) => item.packageId === pkg.id)
        const result =
          acceptedItem?.status === 'succeeded'
            ? accepted
            : await awaitReviewConfirmationItem({
                decisionCommandId,
                packageId: pkg.id,
                getConfirmation: getReviewConfirmation,
              })
        invalidateSucceeded(result.items.find((item) => item.packageId === pkg.id)?.status)
        setCompleted(true)
      } else if (kind === 'reject') {
        await rejectAiReviewPackage('', pkg.id, { expectedPackageVersion: version })
      } else if (kind === 'cancel') {
        await cancelAiReviewPackage('', pkg.id, { expectedPackageVersion: version })
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['departure-collaboration', departureId] }),
  })
  const awaitingConfirmation =
    confirmation && ['accepted', 'queued', 'running'].includes(confirmation.status)
  const disabled =
    !canEdit || !pending || action.isPending || completed || Boolean(awaitingConfirmation)
  const guestCandidate = pkg.candidates.find((candidate) => candidate.fieldKey === 'guestChanges')
  const changes = sourceOrderGuestChangesSchema.safeParse(
    guestCandidate?.userCorrectedValue ?? guestCandidate?.proposedValue,
  )
  if (!pending || completed)
    return completed ? <Alert type="success" showIcon title="修改已写入" /> : null
  return (
    <section className={styles.item} aria-label={title}>
      <Typography.Text strong>{title}</Typography.Text>
      <Typography.Text type="secondary">核对原值与建议，确认后修改已有记录。</Typography.Text>
      {awaitingConfirmation ? <Alert type="info" showIcon title="正在核对提交结果" /> : null}
      {pkg.confirmationBlockedReason ? (
        <Alert type="info" showIcon title={pkg.confirmationBlockedReason} />
      ) : null}
      {!canEdit ? (
        <Alert type="info" showIcon title="当前为只读模式，修改和确认需要发团编辑权限。" />
      ) : null}
      {revisionConflict ? (
        <Alert
          type="warning"
          showIcon
          title="建议已有新版本，当前未保存修正已保留"
          description="采用最新建议后重新核对；采用前不会提交旧修正。"
          action={
            <Button
              onClick={() => {
                setCorrections({})
                setCorrectionVersion(pkg.version)
              }}
            >
              采用最新建议
            </Button>
          }
        />
      ) : null}
      {action.error ? <Alert type="error" showIcon title={action.error.message} /> : null}
      {validation.length ? (
        <Alert type="error" showIcon title={`请修正：${validation.join('、')}`} />
      ) : null}
      <Descriptions
        title="修改前"
        size="small"
        column={1}
        bordered
        items={
          guestsReview
            ? [
                {
                  key: 'sourceOrder',
                  label: '客源单',
                  children: display(baseline.displayName ?? baseline.sourceOrderId),
                },
                { key: 'guests', label: '原游客名单', children: display(baseline.guests) },
              ]
            : Object.entries(baseline)
                .filter(
                  ([key]) =>
                    key !== 'itinerarySegmentId' &&
                    Boolean(resolveReviewField(pkg.payloadSchema, pkg.confirmationUnit, key)),
                )
                .map(([key, previous]) => ({
                  key,
                  label:
                    resolveReviewField(pkg.payloadSchema, pkg.confirmationUnit, key)?.label ?? key,
                  children: display(previous),
                }))
        }
      />
      <Form layout="vertical" component="div" className={styles.fields} disabled={disabled}>
        {guestsReview ? (
          changes.success ? (
            <GuestChangesFields
              key={hasCorrections ? correctionVersion : pkg.version}
              changes={changes.data}
              baseline={baseline.guests}
              disabled={disabled}
              onChange={(next) => patch('guestChanges', next)}
            />
          ) : null
        ) : (
          pkg.candidates.map((candidate) => {
            const field = resolveReviewField(
              pkg.payloadSchema,
              pkg.confirmationUnit,
              candidate.fieldKey,
            )
            if (!field?.editable) return null
            const next = value(field.key)
            return (
              <Form.Item key={field.key} label={`${field.label}建议`}>
                {field.control === 'date' ? (
                  <DatePicker
                    aria-label={`${field.label}建议`}
                    value={typeof next === 'string' ? dayjs(next) : null}
                    onChange={(date) => patch(field.key, date?.format('YYYY-MM-DD') ?? null)}
                  />
                ) : field.control === 'integer' ? (
                  <InputNumber
                    aria-label={`${field.label}建议`}
                    min={0}
                    precision={0}
                    value={typeof next === 'number' ? next : null}
                    onChange={(count) => patch(field.key, count)}
                  />
                ) : (
                  <Input
                    aria-label={`${field.label}建议`}
                    value={typeof next === 'string' ? next : ''}
                    onChange={(event) => patch(field.key, event.target.value || null)}
                  />
                )}
              </Form.Item>
            )
          })
        )}
      </Form>
      <div className={styles.actions}>
        <Button disabled={disabled} onClick={() => action.mutate('cancel')}>
          取消此项
        </Button>
        <Button disabled={disabled} onClick={() => action.mutate('reject')}>
          拒绝建议
        </Button>
        <Button
          disabled={disabled || revisionConflict || validation.length > 0 || !hasCorrections}
          onClick={() => action.mutate('save')}
        >
          保存修正
        </Button>
        <Button
          type="primary"
          loading={action.isPending && action.variables === 'confirm'}
          disabled={
            disabled ||
            validation.length > 0 ||
            revisionConflict ||
            pkg.schemaSupported === false ||
            Boolean(pkg.confirmationBlockedReason)
          }
          onClick={() => action.mutate('confirm')}
        >
          确认修改{guestsReview ? '游客名单' : '行程段'}
        </Button>
      </div>
    </section>
  )
}

function GuestChangesFields({
  changes: initialChanges,
  baseline,
  disabled,
  onChange,
}: {
  changes: SourceOrderGuestChanges
  baseline: unknown
  disabled: boolean
  onChange: (changes: SourceOrderGuestChanges) => void
}) {
  const [changes, setChanges] = useState(initialChanges)
  const previousGuests = Array.isArray(baseline) ? baseline : []
  return (
    <>
      {(['add', 'update'] as const).flatMap((kind) =>
        (changes[kind] ?? []).map((guest, index) => {
          const previous =
            kind === 'update' && 'guestId' in guest
              ? previousGuests.find((row) => row.id === guest.guestId)
              : undefined
          return (
            <fieldset key={`${kind}-${index}`} disabled={disabled}>
              <legend>
                {kind === 'add'
                  ? '追加游客'
                  : `修改游客：${display(previous?.name ?? ('guestId' in guest ? guest.guestId : null))}`}{' '}
                · 第 {index + 1} 位
              </legend>
              {guestKeys.map((key) => {
                const next = Object.hasOwn(guest, key) ? guest[key] : previous?.[key]
                const label = `${kind === 'add' ? '追加' : '修改'}游客${index + 1}${guestLabels[key]}`
                const change = (fieldValue: string | null) => {
                  const updated = {
                    ...changes,
                    [kind]: changes[kind]?.map((row, position) =>
                      position === index ? { ...row, [key]: fieldValue } : row,
                    ),
                  }
                  setChanges(updated)
                  onChange(updated)
                }
                return (
                  <Form.Item key={key} label={guestLabels[key]}>
                    {key === 'gender' ? (
                      <Select
                        aria-label={label}
                        allowClear
                        disabled={disabled}
                        options={[...GUEST_GENDER_OPTIONS]}
                        value={next ?? undefined}
                        onChange={(gender) => change(gender ?? null)}
                      />
                    ) : (
                      <Input
                        aria-label={label}
                        disabled={disabled}
                        value={next ?? ''}
                        onChange={(event) => change(event.target.value || null)}
                      />
                    )}
                  </Form.Item>
                )
              })}
            </fieldset>
          )
        }),
      )}
    </>
  )
}

export function formatDepartureEditReviewValue(
  fieldKey: string,
  value: unknown,
  baseline: Record<string, unknown>,
): string {
  if (fieldKey === 'itinerarySegmentId') return display(baseline.name ?? value)
  if (fieldKey === 'sourceOrderId') return display(baseline.displayName ?? value)
  if (fieldKey === 'guestChanges') {
    const parsed = sourceOrderGuestChangesSchema.safeParse(value)
    if (!parsed.success) return '名单变更内容无效'
    const previous = Array.isArray(baseline.guests) ? baseline.guests : []
    return [
      ...(parsed.data.add ?? []).map((guest) => `追加：${display(guest)}`),
      ...(parsed.data.update ?? []).map(
        (guest) =>
          `修改：${display({ ...previous.find((row) => row.id === guest.guestId), ...guest })}`,
      ),
    ].join('；')
  }
  return display(value)
}
