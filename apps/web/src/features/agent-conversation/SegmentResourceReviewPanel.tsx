import {
  Alert,
  App,
  Button,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SEGMENT_RESOURCE_CONFIRMATION_UNIT,
  SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  resolveReviewField,
  resolveSegmentResourceReviewDraft,
} from '@xiaotuanbao/ai-contracts'
import type {
  AiReviewCandidateView,
  AiReviewPackageView,
  ReviewConfirmationView,
} from '@/types/api'
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
  const value =
    candidate.userCorrectedValue !== undefined
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
  onlyPackageId,
}: {
  departureId: string
  conversationId: string
  focusedReviewPackageId?: string | null
  onlyPackageId?: string
}) {
  const canEdit = canEditDeparture(useAuthStore((state) => state.actionKeys))
  const collaborationQuery = useQuery({
    queryKey: ['departure-collaboration', departureId, conversationId],
    queryFn: () => getDepartureCollaboration(departureId, conversationId),
    enabled: Boolean(departureId && conversationId),
  })
  const packages = (collaborationQuery.data?.items ?? []).filter(
    (item) =>
      (!onlyPackageId || item.id === onlyPackageId) &&
      (item.confirmationUnit === SEGMENT_RESOURCE_CONFIRMATION_UNIT ||
        item.payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA),
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
          confirmation={confirmationForPackage(
            collaborationQuery.data?.confirmations ?? [],
            pkg.id,
          )}
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
  const savedVersion = useRef(pkg.version)
  const savingCorrections = useRef<Promise<void> | null>(null)
  const [localCorrections, setLocalCorrections] = useState<Record<string, string | number | null>>(
    {},
  )
  const fieldValue = (key: string) =>
    Object.hasOwn(localCorrections, key)
      ? localCorrections[key]
      : candidateValue(pkg.candidates.find((candidate) => candidate.fieldKey === key))
  const [saveError, setSaveError] = useState<string | null>(null)
  const [supplierSearch, setSupplierSearch] = useState('')

  useEffect(() => {
    if (focused) {
      rootRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [focused])

  useEffect(() => {
    pendingCorrections.current = {}
  }, [pkg.id])

  useEffect(() => {
    savedVersion.current = Math.max(savedVersion.current, pkg.version)
  }, [pkg.version])

  useEffect(
    () => () => {
      if (correctTimer.current) clearTimeout(correctTimer.current)
    },
    [],
  )

  const segmentsQuery = useQuery({
    queryKey: ['segments', departureId],
    queryFn: () => listSegments(departureId),
  })
  const resourceKind = fieldValue('resourceKind')
  const supplierId = fieldValue('supplierId')
  const kindForSearch = KIND_OPTIONS.find((option) => option.value === resourceKind)?.value

  const suppliersQuery = useQuery({
    queryKey: ['review-suppliers', kindForSearch, supplierSearch],
    enabled: kindForSearch !== undefined,
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
    while (savingCorrections.current || Object.keys(pendingCorrections.current).length > 0) {
      if (savingCorrections.current) {
        await savingCorrections.current
        continue
      }
      const corrections = { ...pendingCorrections.current }
      pendingCorrections.current = {}
      savingCorrections.current = (async () => {
        try {
          const summary = await patchAiReviewPackage('', pkg.id, {
            expectedPackageVersion: savedVersion.current,
            corrections,
          })
          const updated =
            summary.pendingReviews?.find((item) => item.id === pkg.id) ??
            (summary.pendingReview?.id === pkg.id ? summary.pendingReview : undefined)
          if (!updated) throw new Error('未取得修订后的审核包，请刷新后重试')
          savedVersion.current = updated.version
          setSaveError(null)
        } catch (error) {
          pendingCorrections.current = {
            ...corrections,
            ...pendingCorrections.current,
          }
          throw error
        } finally {
          savingCorrections.current = null
        }
      })()
      await savingCorrections.current
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId],
      })
      setLocalCorrections((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([key, value]) => !Object.hasOwn(corrections, key) || corrections[key] !== value,
          ),
        ),
      )
    }
    return savedVersion.current
  }, [departureId, pkg.id, queryClient])

  const patchField = useCallback(
    (fieldKey: string, value: string | number | null) => {
      setLocalCorrections((current) => ({ ...current, [fieldKey]: value }))
      pendingCorrections.current = {
        ...pendingCorrections.current,
        [fieldKey]: value,
      }
      if (correctTimer.current) clearTimeout(correctTimer.current)
      correctTimer.current = setTimeout(() => {
        void flushCorrections().catch((error) => {
          setSaveError(error instanceof Error ? error.message : '修正候选失败')
        })
      }, 300)
    },
    [flushCorrections],
  )

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const expectedPackageVersion = await flushCorrections()
      const decisionKey = `${pkg.id}:${expectedPackageVersion}`
      const decisionCommandId = decisionCommandIds.current[decisionKey] ?? crypto.randomUUID()
      decisionCommandIds.current[decisionKey] = decisionCommandId
      const accepted = await acceptReviewConfirmation({
        decisionCommandId,
        items: [{ packageId: pkg.id, expectedPackageVersion }],
      })
      const deadline = Date.now() + 15_000
      let latest = accepted
      while (Date.now() < deadline) {
        const pendingItems = latest.items.some(
          (item) =>
            item.status === 'accepted' || item.status === 'queued' || item.status === 'running',
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
        for (const [key, commandId] of Object.entries(decisionCommandIds.current)) {
          if (commandId === result.decisionCommandId) delete decisionCommandIds.current[key]
        }
      } else if (
        item?.status === 'accepted' ||
        item?.status === 'queued' ||
        item?.status === 'running'
      ) {
        message.info('正在核对提交结果')
      } else if (item?.reason) {
        message.error(item.reason)
      }
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['segments', departureId],
      })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '确认审核失败')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () =>
      rejectAiReviewPackage('', pkg.id, {
        expectedPackageVersion: pkg.version,
      }),
    onSuccess: async () => {
      message.success('已拒绝本次建议，未写入资源')
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId],
      })
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
          proposedValue:
            candidate.userCorrectedValue !== undefined
              ? candidate.userCorrectedValue
              : candidate.proposedValue,
        })),
        localCorrections,
      ),
    [pkg.candidates, localCorrections],
  )
  const invalidFields = new Set<string>(
    resolution.status === 'incomplete'
      ? resolution.missingFieldKeys
      : resolution.status === 'invalid'
        ? [resolution.fieldKey]
        : [],
  )
  const schemaSupported = pkg.schemaSupported === true
  const pending = pkg.status === 'pending'
  const editingDisabled =
    !canEdit || !pending || confirmMutation.isPending || rejectMutation.isPending
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
      ? segmentsQuery.isError
        ? '行程段加载失败'
        : '加载行程段…'
      : '未确定'

  const warningCandidate = pkg.candidates.find(
    (candidate) => candidate.fieldKey === 'capacityWarning',
  )
  const amountCents = fieldValue('amountCents')

  if (!pending && confirmation?.status === 'succeeded' && confirmation.resultRef) {
    return (
      <article ref={rootRef} className={styles.item} data-review-package-id={pkg.id}>
        <Alert
          type="success"
          showIcon
          title="资源已写入"
          description={`${String(fieldValue('title') ?? '资源')}。写入时未自动提交应付，可从业务页面核对后继续处理。`}
        />
      </article>
    )
  }

  return (
    <article ref={rootRef} className={styles.item} data-review-package-id={pkg.id}>
      {!canEdit && pending ? (
        <Alert
          type="info"
          showIcon
          title="当前为只读模式"
          description="你可以查看审核内容；修改和确认需要发团编辑权限。"
        />
      ) : null}
      {!schemaSupported ? (
        <Alert type="error" showIcon title="审核包版本不受支持，请拒绝本次建议" />
      ) : null}
      {resolution.status === 'incomplete' ? (
        <Alert
          type="error"
          showIcon
          title={resolution.reason}
          description={resolution.missingFieldKeys
            .map(
              (key) =>
                resolveReviewField(pkg.payloadSchema, pkg.confirmationUnit, key)?.label ?? key,
            )
            .join('、')}
        />
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

      {saveError || confirmMutation.error || rejectMutation.error ? (
        <Alert
          type="error"
          showIcon
          title={saveError ?? confirmMutation.error?.message ?? rejectMutation.error?.message}
        />
      ) : null}
      {segmentsQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title="行程段加载失败"
          action={<Button onClick={() => void segmentsQuery.refetch()}>重试</Button>}
        />
      ) : null}
      <Descriptions
        size="small"
        bordered
        column={1}
        items={[
          {
            key: 'segment',
            label: '行程段',
            children: <Typography.Text aria-label="行程段候选">{segmentLabel}</Typography.Text>,
          },
        ]}
      />
      <Form layout="vertical" component="div" className={styles.fields}>
        <Form.Item label="资源种类" className={styles.field}>
          <Select
            aria-label="资源种类候选"
            status={invalidFields.has('resourceKind') ? 'error' : undefined}
            value={typeof resourceKind === 'string' ? resourceKind : undefined}
            options={KIND_OPTIONS}
            disabled={editingDisabled}
            onChange={(value) => patchField('resourceKind', value)}
          />
        </Form.Item>
        <Form.Item label="供应商" className={styles.field}>
          <Select
            aria-label="供应商候选"
            status={invalidFields.has('supplierId') ? 'error' : undefined}
            showSearch={{ filterOption: false, onSearch: setSupplierSearch }}
            value={typeof supplierId === 'string' ? supplierId : undefined}
            options={[
              ...new Map(
                [
                  ...(suppliersQuery.data?.items ?? []),
                  ...(pinnedSupplierQuery.data ? [pinnedSupplierQuery.data] : []),
                ].map((supplier) => [supplier.id, { value: supplier.id, label: supplier.name }]),
              ).values(),
            ]}
            loading={suppliersQuery.isFetching || pinnedSupplierQuery.isFetching}
            labelRender={({ label }) =>
              label ?? (pinnedSupplierQuery.isError ? '供应商暂不可用，请重新选择' : '加载供应商…')
            }
            placeholder={
              kindForSearch ? '请选择已有供应商或先通过普通入口维护供应商档案' : '请先选择资源种类'
            }
            notFoundContent="请选择已有供应商或先通过普通入口维护供应商档案"
            disabled={editingDisabled || !kindForSearch}
            onChange={(value) => patchField('supplierId', value)}
          />
          {suppliersQuery.isError || pinnedSupplierQuery.isError ? (
            <Alert
              type="error"
              showIcon
              title="供应商加载失败"
              action={
                <Button
                  onClick={() => {
                    void suppliersQuery.refetch()
                    void pinnedSupplierQuery.refetch()
                  }}
                >
                  重试
                </Button>
              }
            />
          ) : null}
        </Form.Item>
        <Form.Item label="资源名称" className={styles.field}>
          <Input
            aria-label="资源名称候选"
            status={invalidFields.has('title') ? 'error' : undefined}
            value={String(fieldValue('title') ?? '')}
            disabled={editingDisabled}
            onChange={(event) => patchField('title', event.target.value)}
          />
        </Form.Item>
        <Form.Item label="约定总价" className={styles.field}>
          <InputNumber
            aria-label="约定总价候选"
            status={invalidFields.has('amountCents') ? 'error' : undefined}
            min={0.01}
            precision={2}
            suffix="元"
            style={{ width: '100%' }}
            value={typeof amountCents === 'number' ? amountCents / 100 : null}
            disabled={editingDisabled}
            onChange={(value) =>
              patchField('amountCents', typeof value === 'number' ? Math.round(value * 100) : null)
            }
          />
        </Form.Item>
        <Form.Item label="备注" className={styles.field}>
          <Input.TextArea
            aria-label="备注候选"
            autoSize={{ minRows: 2, maxRows: 4 }}
            value={String(fieldValue('notes') ?? '')}
            disabled={editingDisabled}
            onChange={(event) =>
              patchField('notes', event.target.value.trim() === '' ? null : event.target.value)
            }
          />
        </Form.Item>
      </Form>
      <Collapse
        size="small"
        className={styles.evidence}
        items={[
          {
            key: 'evidence',
            label: '查看证据',
            children: (
              <Descriptions
                size="small"
                column={1}
                items={pkg.candidates.flatMap((candidate) => {
                  const field = resolveReviewField(
                    pkg.payloadSchema,
                    pkg.confirmationUnit,
                    candidate.fieldKey,
                  )
                  return field
                    ? [
                        {
                          key: candidate.fieldKey,
                          label: field.label,
                          children: field.evidence.format(candidate.evidence),
                        },
                      ]
                    : []
                })}
              />
            ),
          },
        ]}
      />

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
