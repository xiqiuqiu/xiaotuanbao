import { Alert, App, Button, Input, InputNumber, Select, Space, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SEGMENT_RESOURCE_CONFIRMATION_UNIT,
  SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  resolveReviewField,
  resolveSegmentResourceReviewDraft,
} from '@xiaotuanbao/ai-contracts'
import { ResourceKind } from '@xiaotuanbao/shared'
import type { AiReviewCandidateView, AiReviewPackageView, ReviewConfirmationView } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditDeparture } from '@/features/departure/utils/departure-permission'
import { RESOURCE_KIND_OPTIONS } from '@/features/departure/catalog'
import { formatSegmentDateRange } from '@/features/departure/utils/segment-form'
import { listSegments } from '@/services/segment.service'
import { getSupplier, listSuppliers } from '@/services/supplier.service'
import {
  acceptReviewConfirmation,
  getDepartureCollaboration,
  getReviewConfirmation,
} from '@/services/agent-collaboration.service'
import { patchAiReviewPackage, rejectAiReviewPackage } from '@/services/ai-create-task.service'
import styles from './SegmentResourceReviewPanel.module.css'

const KIND_OPTIONS = RESOURCE_KIND_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}))

function candidateValue(candidate: AiReviewCandidateView | undefined): string | number | null {
  if (!candidate) return null
  const value = candidate.userCorrectedValue !== undefined
    ? candidate.userCorrectedValue
    : candidate.proposedValue
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

function confirmationForPackage(confirmations: ReviewConfirmationView[], packageId: string) {
  for (const confirmation of confirmations) {
    const item = confirmation.items.find((entry) => entry.packageId === packageId)
    if (item) return item
  }
  return undefined
}

export function SegmentResourceReviewPanel({
  departureId,
  conversationId,
  focusedReviewPackageId,
}: {
  departureId: string
  conversationId: string
  focusedReviewPackageId?: string | null
}) {
  const canEdit = canEditDeparture(useAuthStore((state) => state.actionKeys))
  const collaborationQuery = useQuery({
    queryKey: ['departure-collaboration', departureId, conversationId],
    queryFn: () => getDepartureCollaboration(departureId, conversationId),
    enabled: Boolean(departureId && conversationId),
  })
  const packages = (collaborationQuery.data?.items ?? []).filter(
    (item) =>
      item.confirmationUnit === SEGMENT_RESOURCE_CONFIRMATION_UNIT ||
      item.payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  )
  if (packages.length === 0) {
    return null
  }
  return (
    <section className={styles.panel} aria-label="行程段资源审核">
      <div className={styles.heading}>
        <Typography.Text strong>行程段资源审核</Typography.Text>
        <Typography.Text type="secondary">确认后写入正式资源，不自动提交应付。</Typography.Text>
      </div>
      {packages.map((pkg) => (
        <SegmentResourceReviewItem
          key={pkg.id}
          pkg={pkg}
          departureId={departureId}
          canEdit={canEdit}
          focused={focusedReviewPackageId === pkg.id}
          confirmation={confirmationForPackage(collaborationQuery.data?.confirmations ?? [], pkg.id)}
        />
      ))}
    </section>
  )
}

function SegmentResourceReviewItem({
  pkg,
  departureId,
  canEdit,
  focused,
  confirmation,
}: {
  pkg: AiReviewPackageView
  departureId: string
  canEdit: boolean
  focused: boolean
  confirmation?: ReturnType<typeof confirmationForPackage>
}) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const rootRef = useRef<HTMLElement | null>(null)
  const pendingCorrections = useRef<Record<string, string | number | null>>({})
  const correctTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const decisionCommandIds = useRef<Record<string, string>>({})
  const [supplierSearch, setSupplierSearch] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  useEffect(() => {
    if (focused) {
      rootRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [focused])

  useEffect(() => {
    pendingCorrections.current = {}
  }, [pkg.id])

  const segmentsQuery = useQuery({
    queryKey: ['segments', departureId],
    queryFn: () => listSegments(departureId),
  })
  const kindCandidate = pkg.candidates.find((candidate) => candidate.fieldKey === 'resourceKind')
  const resourceKind = candidateValue(kindCandidate)
  const supplierCandidate = pkg.candidates.find((candidate) => candidate.fieldKey === 'supplierId')
  const supplierId = candidateValue(supplierCandidate)
  const kindForSearch =
    typeof resourceKind === 'string' ? (resourceKind as ResourceKind) : ResourceKind.HOTEL

  const suppliersQuery = useQuery({
    queryKey: ['review-suppliers', kindForSearch, supplierSearch],
    queryFn: () =>
      listSuppliers({
        search: supplierSearch || undefined,
        category: kindForSearch,
        pageSize: 20,
      }),
  })
  const pinnedSupplierQuery = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => getSupplier(String(supplierId)),
    enabled: typeof supplierId === 'string' && supplierId.length > 0,
  })

  const flushCorrections = useCallback(async () => {
    if (correctTimer.current) {
      clearTimeout(correctTimer.current)
      correctTimer.current = null
    }
    const corrections = { ...pendingCorrections.current }
    if (Object.keys(corrections).length === 0) return
    pendingCorrections.current = {}
    await patchAiReviewPackage('', pkg.id, {
      expectedPackageVersion: pkg.version,
      corrections,
    })
    await queryClient.invalidateQueries({
      queryKey: ['departure-collaboration', departureId],
    })
  }, [departureId, pkg.id, pkg.version, queryClient])

  const patchField = useCallback(
    (fieldKey: string, value: string | number | null) => {
      pendingCorrections.current = { ...pendingCorrections.current, [fieldKey]: value }
      if (correctTimer.current) clearTimeout(correctTimer.current)
      correctTimer.current = setTimeout(() => {
        void flushCorrections().catch((error) => {
          message.error(error instanceof Error ? error.message : '修正候选失败')
        })
      }, 300)
    },
    [flushCorrections, message],
  )

  const confirmMutation = useMutation({
    mutationFn: async () => {
      await flushCorrections()
      const decisionKey = `${pkg.id}:${pkg.version}`
      const decisionCommandId =
        decisionCommandIds.current[decisionKey] ?? crypto.randomUUID()
      decisionCommandIds.current[decisionKey] = decisionCommandId
      const accepted = await acceptReviewConfirmation({
        decisionCommandId,
        items: [{ packageId: pkg.id, expectedPackageVersion: pkg.version }],
      })
      const deadline = Date.now() + 15_000
      let latest = accepted
      while (Date.now() < deadline) {
        const pendingItems = latest.items.some(
          (item) => item.status === 'accepted' || item.status === 'queued' || item.status === 'running',
        )
        if (!pendingItems) break
        await new Promise((resolve) => window.setTimeout(resolve, 400))
        latest = await getReviewConfirmation(decisionCommandId)
      }
      return latest
    },
    onSuccess: async (result) => {
      const item = result.items.find((entry) => entry.packageId === pkg.id) ?? result.items[0]
      if (item?.status === 'succeeded') {
        message.success('已写入行程段资源，未提交应付')
        delete decisionCommandIds.current[`${pkg.id}:${pkg.version}`]
      } else if (item?.status === 'accepted' || item?.status === 'queued' || item?.status === 'running') {
        message.info('正在核对提交结果')
      } else if (item?.reason) {
        message.error(item.reason)
      }
      await queryClient.invalidateQueries({ queryKey: ['departure-collaboration', departureId] })
      await queryClient.invalidateQueries({ queryKey: ['segments', departureId] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '确认审核失败')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => rejectAiReviewPackage('', pkg.id, { expectedPackageVersion: pkg.version }),
    onSuccess: async () => {
      message.success('已拒绝本次建议，未写入资源')
      await queryClient.invalidateQueries({ queryKey: ['departure-collaboration', departureId] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '拒绝审核失败')
    },
  })

  const resolution = useMemo(
    () =>
      resolveSegmentResourceReviewDraft(
        pkg.candidates.map((candidate) => ({
          fieldKey: candidate.fieldKey,
          proposedValue: candidate.userCorrectedValue !== undefined
            ? candidate.userCorrectedValue
            : candidate.proposedValue,
        })),
      ),
    [pkg.candidates],
  )
  const schemaSupported = pkg.schemaSupported === true
  const pending = pkg.status === 'pending'
  const confirmDisabled =
    !canEdit ||
    !pending ||
    !schemaSupported ||
    resolution.status !== 'ready' ||
    confirmMutation.isPending ||
    rejectMutation.isPending

  const segmentId = candidateValue(
    pkg.candidates.find((candidate) => candidate.fieldKey === 'itinerarySegmentId'),
  )
  const segment = segmentsQuery.data?.items.find((item) => item.id === segmentId)
  const segmentLabel = segment
    ? [segment.name, formatSegmentDateRange(segment.startDate, segment.endDate)]
        .filter(Boolean)
        .join(' · ')
    : typeof segmentId === 'string'
      ? segmentId
      : '未确定'

  const titleCandidate = pkg.candidates.find((candidate) => candidate.fieldKey === 'title')
  const amountCandidate = pkg.candidates.find((candidate) => candidate.fieldKey === 'amountCents')
  const notesCandidate = pkg.candidates.find((candidate) => candidate.fieldKey === 'notes')
  const warningCandidate = pkg.candidates.find((candidate) => candidate.fieldKey === 'capacityWarning')
  const amountCents = candidateValue(amountCandidate)

  if (!pending && confirmation?.status === 'succeeded' && confirmation.resultRef) {
    return (
      <article ref={rootRef} className={styles.item} data-review-package-id={pkg.id}>
        <Typography.Text>
          已写入行程段资源 {confirmation.resultRef.objectId}，未提交应付。之后可从业务页面提交。
        </Typography.Text>
      </article>
    )
  }

  return (
    <article ref={rootRef} className={styles.item} data-review-package-id={pkg.id}>
      {!schemaSupported ? (
        <Alert type="error" showIcon title="审核包版本不受支持，请拒绝本次建议" />
      ) : null}
      {resolution.status === 'incomplete' ? (
        <Alert type="error" showIcon title={resolution.reason} />
      ) : null}
      {resolution.status === 'invalid' ? (
        <Alert type="error" showIcon title={resolution.reason} />
      ) : null}
      {warningCandidate && candidateValue(warningCandidate) ? (
        <Alert
          type="warning"
          showIcon
          title="执行冲突提醒，不阻止费用录入"
          description={String(candidateValue(warningCandidate))}
        />
      ) : null}
      {confirmation?.status === 'conflict' || confirmation?.status === 'failed' ? (
        <Alert type="error" showIcon title={confirmation.reason ?? '写入失败，候选仍保留'} />
      ) : null}

      <div className={styles.fields}>
        <div className={styles.field}>
          <Typography.Text type="secondary">行程段</Typography.Text>
          <Typography.Text aria-label="行程段候选">{segmentLabel}</Typography.Text>
        </div>
        <div className={styles.field}>
          <Typography.Text type="secondary">资源种类</Typography.Text>
          <Select
            aria-label="资源种类候选"
            value={typeof resourceKind === 'string' ? resourceKind : undefined}
            options={KIND_OPTIONS}
            disabled={!canEdit || !pending}
            onChange={(value) => patchField('resourceKind', value)}
          />
        </div>
        <div className={styles.field}>
          <Typography.Text type="secondary">供应商</Typography.Text>
          <Select
            aria-label="供应商候选"
            showSearch
            filterOption={false}
            value={typeof supplierId === 'string' ? supplierId : undefined}
            options={(suppliersQuery.data?.items ?? []).map((supplier) => ({
              value: supplier.id,
              label: supplier.name,
            }))}
            placeholder="请选择已有供应商或先通过普通入口维护供应商档案"
            notFoundContent="请选择已有供应商或先通过普通入口维护供应商档案"
            disabled={!canEdit || !pending}
            onSearch={setSupplierSearch}
            onChange={(value) => patchField('supplierId', value)}
          />
          {pinnedSupplierQuery.data && typeof supplierId === 'string' ? (
            <Typography.Text type="secondary">{pinnedSupplierQuery.data.name}</Typography.Text>
          ) : null}
        </div>
        <div className={styles.field}>
          <Typography.Text type="secondary">资源名称</Typography.Text>
          <Input
            aria-label="资源名称候选"
            value={String(candidateValue(titleCandidate) ?? '')}
            disabled={!canEdit || !pending}
            onChange={(event) => patchField('title', event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <Typography.Text type="secondary">约定总价</Typography.Text>
          <InputNumber
            aria-label="约定总价候选"
            min={0.01}
            precision={2}
            addonAfter="元"
            style={{ width: '100%' }}
            value={typeof amountCents === 'number' ? amountCents / 100 : null}
            disabled={!canEdit || !pending}
            onChange={(value) =>
              patchField('amountCents', typeof value === 'number' ? Math.round(value * 100) : null)
            }
          />
        </div>
        <div className={styles.field}>
          <Typography.Text type="secondary">备注</Typography.Text>
          <Input.TextArea
            aria-label="备注候选"
            autoSize={{ minRows: 2, maxRows: 4 }}
            value={String(candidateValue(notesCandidate) ?? '')}
            disabled={!canEdit || !pending}
            onChange={(event) =>
              patchField('notes', event.target.value.trim() === '' ? null : event.target.value)
            }
          />
        </div>
      </div>

      <Button type="link" size="small" onClick={() => setEvidenceOpen((open) => !open)}>
        {evidenceOpen ? '收起证据' : '查看证据'}
      </Button>
      {evidenceOpen ? (
        <Typography.Paragraph type="secondary" className={styles.evidence}>
          {pkg.candidates
            .flatMap((candidate) => {
              const field = resolveReviewField(
                pkg.payloadSchema,
                pkg.confirmationUnit,
                candidate.fieldKey,
              )
              return field ? [`${field.label}：${field.evidence.format(candidate.evidence)}`] : []
            })
            .join('；')}
        </Typography.Paragraph>
      ) : null}

      {pending ? (
        <Space className={styles.actions}>
          <Button
            onClick={() => rejectMutation.mutate()}
            loading={rejectMutation.isPending}
            disabled={!canEdit || confirmMutation.isPending}
          >
            拒绝建议
          </Button>
          <Button
            type="primary"
            onClick={() => confirmMutation.mutate()}
            loading={confirmMutation.isPending}
            disabled={confirmDisabled}
          >
            确认写入资源
          </Button>
        </Space>
      ) : null}
    </article>
  )
}
