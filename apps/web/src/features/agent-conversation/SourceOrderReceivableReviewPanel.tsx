import { Alert, App, Button, Descriptions, Space, Table, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT,
  SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA,
} from '@xiaotuanbao/ai-contracts'
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

const COLLECTION_MODE_LABELS: Record<string, string> = {
  partner_settled: '客户结算',
  guest_only: '全部我方代收',
  split: '分拆收款',
}

type ReceivablePathRow = {
  sourceType: string
  title: string
  amountCents: number
  counterpartyType: string
  counterpartyName: string | null
}

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

function pathRows(value: unknown): ReceivablePathRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const path = row as Partial<ReceivablePathRow>
    if (typeof path.sourceType !== 'string' || typeof path.title !== 'string') return []
    if (typeof path.amountCents !== 'number') return []
    return [
      {
        sourceType: path.sourceType,
        title: path.title,
        amountCents: path.amountCents,
        counterpartyType: typeof path.counterpartyType === 'string' ? path.counterpartyType : '',
        counterpartyName: typeof path.counterpartyName === 'string' ? path.counterpartyName : null,
      },
    ]
  })
}

export function SourceOrderReceivableReviewPanel({
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
      (item.confirmationUnit === SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT ||
        item.payloadSchema === SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA),
  )
  if (packages.length === 0) {
    return null
  }
  return (
    <section className={styles.panel} aria-label="初始应收审核">
      <div className={styles.heading}>
        <Typography.Text strong>初始应收审核</Typography.Text>
        <Typography.Text type="secondary">
          以下为约定应收，不是到账或流水。按该客源整单确认，不能取消其中一笔。
        </Typography.Text>
      </div>
      {packages.map((pkg) => (
        <SourceOrderReceivableReviewItem
          key={pkg.id}
          pkg={pkg}
          departureId={departureId}
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

function SourceOrderReceivableReviewItem({
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
  const paths = pathRows(values.paths)
  const historyStatus = typeof values.historyStatus === 'string' ? values.historyStatus : ''
  const historyMessage =
    typeof values.historyMessage === 'string' ? values.historyMessage : undefined
  const sourceOrderId = typeof values.sourceOrderId === 'string' ? values.sourceOrderId : undefined
  const displayName = typeof values.displayName === 'string' ? values.displayName : '客源'
  const partnerName = typeof values.partnerName === 'string' ? values.partnerName : undefined
  const collectionMode =
    typeof values.collectionMode === 'string' ? values.collectionMode : undefined
  const netReceivableCents =
    typeof values.netReceivableCents === 'number' ? values.netReceivableCents : null
  const pending = pkg.status === 'pending'
  const schemaSupported = pkg.schemaSupported === true
  const anomaly = historyStatus === 'anomaly'
  const noPositivePaths = historyStatus === 'no_positive_paths'
  const confirmDisabled =
    Boolean(pkg.confirmationBlockedReason) ||
    Boolean(pkg.conflicts?.length) ||
    !pending ||
    !schemaSupported ||
    anomaly

  const openOrdinaryReceivables = () => {
    useAgentConversationStore.getState().closeGlobalForBusinessNavigation()
    void navigate({
      to: '/departure/$departureId',
      params: { departureId },
      search: {
        tab: 'receivables',
        ...(sourceOrderId ? { sourceId: sourceOrderId } : {}),
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
          historyStatus === 'complete_and_consistent'
            ? '已核对已有约定应收，未重复提交'
            : '已提交约定应收',
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
        queryKey: ['receivables', departureId],
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
          historyStatus === 'complete_and_consistent'
            ? '已核对已有约定应收，未重复提交'
            : '已提交约定应收',
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

  if (!pending && confirmation?.status === 'succeeded') {
    return (
      <article className={styles.item} data-review-package-id={pkg.id} data-focused={focused || undefined}>
        <Alert
          type="success"
          showIcon
          title={
            historyStatus === 'complete_and_consistent'
              ? '已有约定应收与当前约定一致'
              : '约定应收已提交'
          }
          description={`${displayName}。提交的是约定应收，不是到账。`}
        />
        <Button onClick={openOrdinaryReceivables}>查看应收</Button>
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
            <Button size="small" onClick={openOrdinaryReceivables}>
              前往普通应收处理
            </Button>
          }
        />
      ) : null}
      {noPositivePaths ? (
        <Alert type="info" showIcon title="无需生成应收" description={historyMessage} />
      ) : null}
      {historyStatus === 'complete_and_consistent' ? (
        <Alert type="info" showIcon title="已有完整约定应收" description={historyMessage} />
      ) : null}
      {historyStatus === 'ready' && historyMessage ? (
        <Alert type="info" showIcon title={historyMessage} />
      ) : null}
      <Descriptions
        size="small"
        bordered
        column={1}
        items={[
          { key: 'displayName', label: '客源名称', children: displayName },
          {
            key: 'partnerName',
            label: '客户',
            children: partnerName ?? '—',
          },
          {
            key: 'collectionMode',
            label: '收款方式',
            children: collectionMode ? (COLLECTION_MODE_LABELS[collectionMode] ?? collectionMode) : '—',
          },
          {
            key: 'netReceivableCents',
            label: '结算金额（约定）',
            children: netReceivableCents == null ? '—' : formatCents(netReceivableCents),
          },
        ]}
      />
      {paths.length > 0 ? (
        <Table<ReceivablePathRow>
          size="small"
          pagination={false}
          rowKey="sourceType"
          dataSource={paths}
          columns={[
            { title: '约定应收', dataIndex: 'title', key: 'title' },
            {
              title: '金额',
              dataIndex: 'amountCents',
              key: 'amountCents',
              render: (value: number) => formatCents(value),
            },
            {
              title: '收款对象',
              dataIndex: 'counterpartyName',
              key: 'counterpartyName',
              render: (value: string | null) => value || '—',
            },
          ]}
        />
      ) : null}
      {pending ? (
        <div className={styles.actions}>
          {confirmDisabled && !anomaly && !noPositivePaths ? (
            <Typography.Text type="secondary" role="status">
              {pkg.confirmationBlockedReason ??
                (pkg.conflicts?.length ? '请先核对新建议与人工修改的差异。' : undefined) ??
                (!schemaSupported ? '审核包版本不受支持。' : undefined)}
            </Typography.Text>
          ) : null}
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
              disabled={
                confirmDisabled || confirmMutation.isPending || Boolean(unknownCommandId)
              }
              onClick={() => void confirmMutation.mutateAsync().catch(() => undefined)}
            >
              {historyStatus === 'complete_and_consistent'
                ? '确认已有记录'
                : noPositivePaths
                  ? '确认无需生成'
                  : '确认提交约定应收'}
            </Button>
          </Space>
        </div>
      ) : null}
    </article>
  )
}
