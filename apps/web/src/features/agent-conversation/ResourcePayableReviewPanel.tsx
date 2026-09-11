import { Alert, App, Button, Descriptions, Space, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  RESOURCE_PAYABLE_CONFIRMATION_UNIT,
  RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA,
} from '@xiaotuanbao/ai-contracts'
import { RESOURCE_KIND_LABELS } from '@xiaotuanbao/shared'
import type { AiReviewCandidateView, AiReviewPackageView } from '@/types/api'
import { formatCents } from '@/features/departure/catalog'
import {
  acceptReviewConfirmation,
  getDepartureCollaboration,
  getReviewConfirmation,
} from '@/services/agent-collaboration.service'
import { confirmationForPackage } from './review-confirmation-for-package'
import { useAgentConversationStore } from './agent-conversation.store'
import styles from './SegmentResourceReviewPanel.module.css'

function candidateValues(candidates: AiReviewCandidateView[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const candidate of candidates) {
    values[candidate.fieldKey] =
      candidate.userCorrectedValue !== undefined
        ? candidate.userCorrectedValue
        : candidate.proposedValue
  }
  return values
}

export function ResourcePayableReviewPanel({
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
  const collaborationQuery = useQuery({
    queryKey: ['departure-collaboration', departureId, conversationId],
    queryFn: () => getDepartureCollaboration(departureId, conversationId),
    enabled: Boolean(departureId && conversationId),
  })
  const packages = (collaborationQuery.data?.items ?? []).filter(
    (item) =>
      (!onlyPackageId || item.id === onlyPackageId) &&
      (item.confirmationUnit === RESOURCE_PAYABLE_CONFIRMATION_UNIT ||
        item.payloadSchema === RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA),
  )
  if (packages.length === 0) {
    return null
  }
  return (
    <section className={styles.panel} aria-label="初始应付审核">
      <div className={styles.heading}>
        <Typography.Text strong>初始应付审核</Typography.Text>
        <Typography.Text type="secondary">
          以下为约定应付，不是付款或流水。按所选资源逐项确认，不扩大到未选资源。
        </Typography.Text>
      </div>
      {packages.map((pkg) => (
        <ResourcePayableReviewItem
          key={pkg.id}
          pkg={pkg}
          departureId={departureId}
          focused={focusedReviewPackageId === pkg.id}
          confirmation={confirmationForPackage(collaborationQuery.data?.confirmations ?? [], pkg.id)}
        />
      ))}
    </section>
  )
}

function ResourcePayableReviewItem({
  pkg,
  departureId,
  focused,
  confirmation,
}: {
  pkg: AiReviewPackageView
  departureId: string
  focused: boolean
  confirmation?: ReturnType<typeof confirmationForPackage>
}) {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const decisionCommandIds = useRef<Record<string, string>>({})
  const [unknownCommandId, setUnknownCommandId] = useState<string | null>(null)
  const values = useMemo(() => candidateValues(pkg.candidates), [pkg.candidates])
  const historyStatus = typeof values.historyStatus === 'string' ? values.historyStatus : ''
  const historyMessage =
    typeof values.historyMessage === 'string' ? values.historyMessage : undefined
  const sourceId = typeof values.sourceId === 'string' ? values.sourceId : undefined
  const sourceType = typeof values.sourceType === 'string' ? values.sourceType : undefined
  const title = typeof values.title === 'string' ? values.title : '资源'
  const supplierName = typeof values.supplierName === 'string' ? values.supplierName : undefined
  const resourceKind = typeof values.resourceKind === 'string' ? values.resourceKind : undefined
  const amountCents = typeof values.amountCents === 'number' ? values.amountCents : null
  const pending = pkg.status === 'pending'
  const schemaSupported = pkg.schemaSupported === true
  const anomaly = historyStatus === 'anomaly'
  const noPositiveAmount = historyStatus === 'no_positive_amount'
  const alreadyPresent = historyStatus === 'complete_and_consistent'
  const confirmDisabled =
    Boolean(pkg.confirmationBlockedReason) ||
    Boolean(pkg.conflicts?.length) ||
    !pending ||
    !schemaSupported ||
    anomaly

  const openOrdinaryPayables = () => {
    useAgentConversationStore.getState().closeGlobalForBusinessNavigation()
    void navigate({
      to: '/departure/$departureId',
      params: { departureId },
      search: {
        tab: 'payables',
        ...(sourceId && sourceType === 'segment_resource'
          ? { highlightSegmentResourceId: sourceId }
          : sourceId
            ? { highlightDepartureResourceId: sourceId }
            : {}),
      },
    })
  }

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const decisionKey = `${pkg.id}:${pkg.version}`
      const decisionCommandId = decisionCommandIds.current[decisionKey] ?? crypto.randomUUID()
      decisionCommandIds.current[decisionKey] = decisionCommandId
      const accepted = await acceptReviewConfirmation({
        decisionCommandId,
        items: [{ packageId: pkg.id, expectedPackageVersion: pkg.version }],
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
        message.success(
          alreadyPresent ? '已核对已有约定应付，未重复提交' : '已提交约定应付',
        )
        setUnknownCommandId(null)
        for (const [key, commandId] of Object.entries(decisionCommandIds.current)) {
          if (commandId === result.decisionCommandId) delete decisionCommandIds.current[key]
        }
      } else if (
        item?.status === 'accepted' ||
        item?.status === 'queued' ||
        item?.status === 'running'
      ) {
        setUnknownCommandId(result.decisionCommandId)
        message.info('正在核对提交结果')
      } else if (item?.reason) {
        setUnknownCommandId(null)
        message.error(item.reason)
      }
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['departure-payables', departureId],
      })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '确认审核失败')
    },
  })

  const recheckMutation = useMutation({
    mutationFn: async (decisionCommandId: string) => getReviewConfirmation(decisionCommandId),
    onSuccess: async (result) => {
      const item = result.items.find((entry) => entry.packageId === pkg.id) ?? result.items[0]
      if (item?.status === 'succeeded') {
        setUnknownCommandId(null)
        message.success(
          alreadyPresent ? '已核对已有约定应付，未重复提交' : '已提交约定应付',
        )
      } else if (
        item?.status === 'accepted' ||
        item?.status === 'queued' ||
        item?.status === 'running'
      ) {
        message.info('仍在核对提交结果')
      } else if (item?.reason) {
        setUnknownCommandId(null)
        message.error(item.reason)
      }
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId],
      })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '查询确认结果失败')
    },
  })

  const writeSucceeded =
    confirmation?.status === 'succeeded' ||
    (pkg.status === 'confirmed' &&
      confirmation?.status !== 'failed' &&
      confirmation?.status !== 'conflict')
  if (!pending && writeSucceeded) {
    const generation = confirmation?.resultRef?.generation
    return (
      <article className={styles.item} data-review-package-id={pkg.id} data-focused={focused || undefined}>
        <Alert
          type="success"
          showIcon
          title={
            alreadyPresent || generation === 'already_present'
              ? '已有约定应付与当前约定一致'
              : '约定应付已提交'
          }
          description={`${title}。提交的是约定应付，不是付款。`}
        />
        <Button onClick={openOrdinaryPayables}>查看应付</Button>
      </article>
    )
  }

  return (
    <article className={styles.item} data-review-package-id={pkg.id} data-focused={focused || undefined}>
      {pkg.confirmationBlockedReason ? (
        <Alert type="info" showIcon title={pkg.confirmationBlockedReason} />
      ) : null}
      {!schemaSupported ? (
        <Alert type="error" showIcon title="审核包版本不受支持，暂无法确认。" />
      ) : null}
      {confirmation?.status === 'conflict' || confirmation?.status === 'failed' ? (
        <Alert type="error" showIcon title={confirmation.reason ?? '提交失败，请核对后重试'} />
      ) : null}
      {confirmMutation.error ? (
        <Alert type="error" showIcon title={confirmMutation.error.message} />
      ) : null}
      {anomaly ? (
        <Alert
          type="error"
          showIcon
          title="已有账款异常，不能从这里补建或覆盖"
          description={historyMessage}
          action={
            <Button size="small" onClick={openOrdinaryPayables}>
              前往普通应付处理
            </Button>
          }
        />
      ) : null}
      {noPositiveAmount ? (
        <Alert type="info" showIcon title="无需生成应付" description={historyMessage} />
      ) : null}
      {alreadyPresent ? (
        <Alert type="info" showIcon title="已有完整约定应付" description={historyMessage} />
      ) : null}
      {historyStatus === 'ready' && historyMessage ? (
        <Alert type="info" showIcon title={historyMessage} />
      ) : null}
      <Descriptions
        size="small"
        bordered
        column={1}
        items={[
          { key: 'title', label: '资源名称', children: title },
          {
            key: 'resourceKind',
            label: '资源种类',
            children: resourceKind
              ? (RESOURCE_KIND_LABELS[resourceKind as keyof typeof RESOURCE_KIND_LABELS] ??
                resourceKind)
              : '—',
          },
          { key: 'supplierName', label: '供应商', children: supplierName ?? '—' },
          {
            key: 'amountCents',
            label: '约定总价',
            children: amountCents == null ? '—' : formatCents(amountCents),
          },
          {
            key: 'sourceType',
            label: '来源',
            children: sourceType === 'departure_resource' ? '发团级资源' : '行程段资源',
          },
        ]}
      />
      {pending ? (
        <div className={styles.actions}>
          {unknownCommandId ? (
            <Alert
              type="info"
              showIcon
              title="正在核对提交结果"
              description="结果尚未明确，请查询同一次确认，不要当作失败或历史异常。"
              action={
                <Button
                  size="small"
                  loading={recheckMutation.isPending}
                  onClick={() => void recheckMutation.mutateAsync(unknownCommandId).catch(() => undefined)}
                >
                  重新查询本次确认
                </Button>
              }
            />
          ) : null}
          <Space>
            <Button
              type="primary"
              loading={confirmMutation.isPending}
              disabled={confirmDisabled || confirmMutation.isPending || Boolean(unknownCommandId)}
              onClick={() => void confirmMutation.mutateAsync().catch(() => undefined)}
            >
              {alreadyPresent
                ? '确认已有记录'
                : noPositiveAmount
                  ? '确认无需生成'
                  : '确认提交约定应付'}
            </Button>
          </Space>
        </div>
      ) : null}
    </article>
  )
}
