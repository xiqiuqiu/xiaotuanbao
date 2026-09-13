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
  prepareResourcePayableReviews,
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

function successCopy(
  historyStatus: string,
  generation?: string,
): { title: string; toast: string } {
  if (historyStatus === 'no_positive_amount' || generation === 'not_needed') {
    return { title: '已确认无需生成', toast: '已确认无需生成' }
  }
  if (historyStatus === 'complete_and_consistent' || generation === 'already_present') {
    return {
      title: '已有约定应付与当前约定一致',
      toast: '已核对已有约定应付，未重复提交',
    }
  }
  return { title: '约定应付已提交', toast: '已提交约定应付' }
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
    refetchInterval: (query) => query.state.data?.confirmations.some((confirmation) =>
      confirmation.items.some((item) => ['accepted', 'queued', 'running'].includes(item.status)),
    ) ? 1000 : false,
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
          conversationId={conversationId}
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
  conversationId,
  focused,
  confirmation,
}: {
  pkg: AiReviewPackageView
  departureId: string
  conversationId: string
  focused: boolean
  confirmation?: ReturnType<typeof confirmationForPackage>
}) {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const values = useMemo(() => candidateValues(pkg.candidates), [pkg.candidates])
  const historyStatus = typeof values.historyStatus === 'string' ? values.historyStatus : ''
  const sourceId = typeof values.sourceId === 'string' ? values.sourceId : undefined
  const sourceType = values.sourceType
  const pending = pkg.status === 'pending'
  const schemaSupported = pkg.schemaSupported === true
  const comparison = pkg.payableConventionComparison
  const decisionCommandIds = useRef<Record<string, string>>({})
  const [unknownCommandId, setUnknownCommandId] = useState<string | null>(null)
  const confirmationInFlight = Boolean(unknownCommandId) ||
    ['accepted', 'queued', 'running'].includes(confirmation?.status ?? '')
  const { confirmDisabled, writeSucceeded } = payableReviewState(pkg, confirmation, historyStatus)

  const openFormalSource = (tab: 'payables' | 'execution') => {
    useAgentConversationStore.getState().closeGlobalForBusinessNavigation()
    void navigate({
      to: '/departure/$departureId',
      params: { departureId },
      search: {
        tab,
        ...(tab === 'execution' && comparison?.current.segmentId
          ? { segmentId: comparison.current.segmentId } : {}),
        ...(sourceId && sourceType === 'segment_resource'
          ? { highlightSegmentResourceId: sourceId }
          : sourceId
            ? { highlightDepartureResourceId: sourceId }
            : {}),
      },
    })
  }
  const openOrdinaryPayables = () => openFormalSource('payables')

  const prepareMutation = useMutation({
    mutationFn: () => {
      if (!sourceId || (sourceType !== 'segment_resource' && sourceType !== 'departure_resource')) {
        throw new Error('审核事项缺少正式资源，无法重新准备')
      }
      return prepareResourcePayableReviews(departureId, {
        conversationId,
        items: [{ sourceType, sourceId }],
      })
    },
    onSuccess: async (reviews) => {
      queryClient.setQueryData<Awaited<ReturnType<typeof getDepartureCollaboration>>>(
        ['departure-collaboration', departureId, conversationId],
        (previous) => previous ? {
          ...previous,
          items: previous.items.map((item) => reviews.find((review) => review.id === item.id) ?? item),
        } : previous,
      )
      await queryClient.invalidateQueries({ queryKey: ['departure-collaboration', departureId] })
      message.success('已重新准备审核，请核对当前约定后再次确认')
    },
    onError: (error) => message.error(error instanceof Error ? error.message : '重新准备审核失败'),
  })

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
        message.success(successCopy(historyStatus, item.resultRef?.generation).toast)
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
        message.success(successCopy(historyStatus, item.resultRef?.generation).toast)
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

  const actionsBusy = confirmMutation.isPending || prepareMutation.isPending || confirmationInFlight
  if (!pending && writeSucceeded) {
    return <ResourcePayableReceipt pkg={pkg} focused={focused} confirmation={confirmation}
      openOrdinaryPayables={openOrdinaryPayables} />
  }

  return (
    <article className={styles.item} data-review-package-id={pkg.id} data-focused={focused || undefined}>
      <ResourcePayableNotices pkg={pkg} confirmation={confirmation}
        error={confirmMutation.error} openOrdinaryPayables={openOrdinaryPayables} />
      <ResourcePayableDetails values={values} comparison={comparison} />
      {pending ? (
        <div className={styles.actions}>
          <Typography.Text type="secondary">应付到期日取发团结束日期。此处只读，修改资源后须重新准备审核。</Typography.Text>
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
          <Space wrap>
            <Button
              type="primary"
              loading={confirmMutation.isPending}
              disabled={confirmDisabled || actionsBusy}
              onClick={() => void confirmMutation.mutateAsync().catch(() => undefined)}
            >
              {payableConfirmLabels[historyStatus] ?? '确认提交约定应付'}
            </Button>
            <Button onClick={() => openFormalSource('execution')}>前往修改资源</Button>
            <Button
              loading={prepareMutation.isPending}
              disabled={!schemaSupported || actionsBusy}
              onClick={() => prepareMutation.mutate()}
            >重新准备审核</Button>
          </Space>
        </div>
      ) : null}
    </article>
  )
}

function ResourcePayableDetails({ values, comparison }: {
  values: Record<string, unknown>
  comparison: AiReviewPackageView['payableConventionComparison']
}) {
  const title = typeof values.title === 'string' ? values.title : '资源'
  const supplierName = typeof values.supplierName === 'string' ? values.supplierName : undefined
  const resourceKind = typeof values.resourceKind === 'string' ? values.resourceKind : undefined
  const amountCents = typeof values.amountCents === 'number' ? values.amountCents : null
  const sourceType = values.sourceType
  return (
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
          label: '审核时约定总价',
          children: comparison ? formatCents(comparison.reviewed.amountCents)
            : amountCents == null ? '—' : formatCents(amountCents),
        },
        ...(comparison ? [
          { key: 'currentAmount', label: '当前约定总价', children: formatCents(comparison.current.amountCents) },
          { key: 'reviewedEndDate', label: '审核时结束日期', children: comparison.reviewed.endDate },
          { key: 'currentEndDate', label: '当前结束日期', children: comparison.current.endDate },
        ] : []),
        {
          key: 'sourceType',
          label: '来源',
          children: sourceType === 'departure_resource' ? '发团级资源' : '行程段资源',
        },
      ]}
    />
  )
}

function ResourcePayableNotices({ pkg, confirmation, error, openOrdinaryPayables }: {
  pkg: AiReviewPackageView
  confirmation?: ReturnType<typeof confirmationForPackage>
  error: Error | null
  openOrdinaryPayables: () => void
}) {
  const values = candidateValues(pkg.candidates)
  const historyStatus = values.historyStatus
  const historyMessage = typeof values.historyMessage === 'string' ? values.historyMessage : undefined
  const schemaSupported = pkg.schemaSupported === true
  const anomaly = historyStatus === 'anomaly'
  const noPositiveAmount = historyStatus === 'no_positive_amount'
  const alreadyPresent = historyStatus === 'complete_and_consistent'
  const comparison = pkg.payableConventionComparison
  return <>
      {pkg.confirmationBlockedReason ? (
        <Alert type="info" showIcon title={pkg.confirmationBlockedReason} />
      ) : null}
      {!schemaSupported ? (
        <Alert type="error" showIcon title="审核包版本不受支持，暂无法确认。" />
      ) : null}
      {confirmation?.status === 'conflict' || confirmation?.status === 'failed' ? (
        <Alert type="error" showIcon title={`上次提交未完成：${confirmation.reason ?? '请核对后重试'}`} />
      ) : null}
      {error ? (
        <Alert type="error" showIcon title={error.message} />
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
      {comparison?.changed ? (
        <Alert type="warning" showIcon title="正式资源约定已变化"
          description="请核对金额、结束日期及资源信息。需要修改时前往资源入口；按当前约定提交时，先重新准备审核，再确认。" />
      ) : null}
  </>
}

function payableReviewState(
  pkg: AiReviewPackageView,
  confirmation: ReturnType<typeof confirmationForPackage>,
  historyStatus: string,
) {
  return {
    confirmDisabled: Boolean(pkg.confirmationBlockedReason) || Boolean(pkg.conflicts?.length) ||
      pkg.status !== 'pending' || pkg.schemaSupported !== true ||
      historyStatus === 'anomaly' || Boolean(pkg.payableConventionComparison?.changed),
    writeSucceeded: confirmation?.status === 'succeeded' ||
      (pkg.status === 'confirmed' && confirmation?.status !== 'failed' && confirmation?.status !== 'conflict'),
  }
}

const payableConfirmLabels: Record<string, string> = {
  complete_and_consistent: '确认已有记录',
  no_positive_amount: '确认无需生成',
}

function ResourcePayableReceipt({ pkg, focused, confirmation, openOrdinaryPayables }: {
  pkg: AiReviewPackageView
  focused: boolean
  confirmation: ReturnType<typeof confirmationForPackage>
  openOrdinaryPayables: () => void
}) {
  const values = candidateValues(pkg.candidates)
  const title = typeof values.title === 'string' ? values.title : '资源'
  const historyStatus = typeof values.historyStatus === 'string' ? values.historyStatus : ''
  const noPositiveAmount = historyStatus === 'no_positive_amount'
  const generation = confirmation?.resultRef?.generation
  const copy = successCopy(historyStatus, generation)
  return (
    <article className={styles.item} data-review-package-id={pkg.id} data-focused={focused || undefined}>
      <Alert
        type="success"
        showIcon
        title={copy.title}
        description={
          noPositiveAmount || generation === 'not_needed'
            ? `${title}。已确认当前无需生成约定应付。`
            : `${title}。提交的是约定应付，不是付款。`
        }
      />
      <Button onClick={openOrdinaryPayables}>查看应付</Button>
    </article>
  )
}
