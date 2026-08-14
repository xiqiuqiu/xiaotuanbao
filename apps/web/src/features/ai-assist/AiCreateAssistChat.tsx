import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  CopilotKit,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useHumanInTheLoop,
  useRenderTool,
} from '@copilotkit/react-core/v2'
import { Badge, Card, Typography, message } from 'antd'
import '@copilotkit/react-core/v2/styles.css'
import {
  AWAIT_REVIEW_PACKAGE_DECISION_TOOL,
  awaitReviewPackageDecisionInputSchema,
  aiCreateSharedLightStateSchema,
  searchRouteTemplatesModelInputSchema,
  submitReviewPackageModelInputSchema,
  type AiCreateSharedLightState,
  type ReviewPackageDecision,
  type SearchRouteTemplatesOutput,
  type RouteTemplateMatchReason,
} from '@xiaotuanbao/ai-contracts'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { AI_CREATE_FIRST_TURN } from './ai-create-first-turn'
import { commitPendingMaterials, collectSentAttachmentBlobUrls } from './commit-sent-materials'
import { canStartConsumeRun } from './consume-materials-run'
import { createPreviewObjectUrl, type PreviewObjectUrl } from './preview-object-url'
import { uploadDepartureMaterial } from '@/services/ai-create-task.service'
import { ASSIST_ERROR_TEXT } from './assist-error-text'
import { formatReviewFieldList } from './review-field-labels'
import styles from './AiCreateAssistChat.module.css'

const AGENT_ID = 'ai-create-readonly-assist'
const MATERIAL_MAX_BYTES = 20 * 1024 * 1024
const sentFirstTurns = new Set<string>()
const sentConsumeKeys = new Set<string>()

function consumeTurnKey(runId: string, consumeKey: string): string {
  return `${runId}:${consumeKey}`
}

export interface AiCreateAssistChatProps {
  agentRuntimeUrl: string
  delegationToken: string
  taskId: string
  runId: string
  snapshotVersion: number
  stageKey: AiCreateSharedLightState['stageKey']
  runStatus: AiCreateSharedLightState['runStatus']
  reviewPackageId?: string | null
  progress?: AiCreateSharedLightState['progress']
  pendingReview?: AiReviewPackageView | null
  reviewDecision?: ReviewPackageDecision | null
  materialConsumePending?: boolean
  materialConsumeKey?: string | null
  onReviewPackageSubmitted?: () => void
}

function ReviewDecisionCard({
  reviewPackageId,
  pendingReview,
  reviewDecision,
  respond,
}: {
  reviewPackageId: string
  pendingReview?: AiReviewPackageView | null
  reviewDecision?: ReviewPackageDecision | null
  respond?: (result: unknown) => Promise<void>
}) {
  const respondedRef = useRef(false)
  const matchingReview = pendingReview?.id === reviewPackageId ? pendingReview : null
  const matchingDecision =
    reviewDecision?.reviewPackageId === reviewPackageId ? reviewDecision : null

  useEffect(() => {
    if (!respond || !matchingDecision || respondedRef.current) {
      return
    }
    respondedRef.current = true
    void respond(matchingDecision)
  }, [matchingDecision, respond])

  const labels = formatReviewFieldList(
    matchingReview?.candidates.map((candidate) => candidate.fieldKey) ?? [],
  )
  const needsReviewCount =
    matchingReview?.candidates.filter((candidate) => candidate.clarity !== 'clear').length ?? 0
  const cardTitle = matchingDecision
    ? matchingDecision.status === 'confirmed'
      ? 'AI 建议已确认'
      : 'AI 建议已放弃'
    : 'AI 建议待审核'

  return (
    <Card
      className={styles.reviewCard}
      classNames={{ body: styles.reviewCardBody }}
      size="small"
      title={cardTitle}
      role="status"
    >
      {matchingDecision ? (
        <Typography.Text type="secondary">
          {matchingDecision.status === 'confirmed'
            ? '已确认写入，正在继续协作…'
            : '本次建议已放弃，草稿未修改。'}
        </Typography.Text>
      ) : (
        <>
          <Typography.Text type="secondary">
            {labels ? `已建议修改${labels}` : '请在中间表单审核本次建议'}
          </Typography.Text>
          {needsReviewCount > 0 ? (
            <Typography.Text type="warning">其中 {needsReviewCount} 项需要重点核对</Typography.Text>
          ) : null}
          <Badge status="processing" text="等待你在发团表单中完成审核" />
        </>
      )}
    </Card>
  )
}

function ReviewDecisionGate({
  agentId,
  pendingReview,
  reviewDecision,
}: {
  agentId: string
  pendingReview?: AiReviewPackageView | null
  reviewDecision?: ReviewPackageDecision | null
}) {
  useHumanInTheLoop(
    {
      name: AWAIT_REVIEW_PACKAGE_DECISION_TOOL.name,
      description: '等待 User 在中间表单审核 AI 候选；此工具不写入业务数据',
      parameters: awaitReviewPackageDecisionInputSchema,
      agentId,
      render: ({ args, status, respond }) => (
        <ReviewDecisionCard
          reviewPackageId={args.reviewPackageId ?? ''}
          pendingReview={pendingReview}
          reviewDecision={reviewDecision}
          respond={status === 'executing' ? respond : undefined}
        />
      ),
    },
    [agentId, pendingReview, reviewDecision],
  )
  return null
}

function AssistLightState({
  taskId,
  snapshotVersion,
  stageKey,
  runStatus,
  reviewPackageId,
  progress,
}: Pick<
  AiCreateAssistChatProps,
  'taskId' | 'snapshotVersion' | 'stageKey' | 'runStatus' | 'reviewPackageId' | 'progress'
>) {
  const value = useMemo(
    () =>
      aiCreateSharedLightStateSchema.parse({
        taskId,
        stageKey,
        runStatus,
        reviewPackageId: reviewPackageId ?? null,
        snapshotVersion,
        progress: progress ?? 'collecting',
      }),
    [progress, reviewPackageId, runStatus, snapshotVersion, stageKey, taskId],
  )

  useAgentContext({
    description: '当前发团协助轻量协作状态',
    value,
  })

  return null
}

function formatMatchReason(reason: RouteTemplateMatchReason): string {
  if (reason.code === 'name_contains_token') {
    return `名称包含「${reason.token}」`
  }
  if (reason.code === 'segment_name_contains_token') {
    return `行程段「${reason.segmentName}」包含「${reason.token}」`
  }
  if (reason.code === 'destination_contains_token') {
    return `目的地「${reason.destination}」包含「${reason.token}」`
  }
  return `默认 ${reason.dayCount} 天`
}

function SearchRouteTemplatesNotice({ agentId }: { agentId: string }) {
  useRenderTool(
    {
      name: 'searchRouteTemplates',
      parameters: searchRouteTemplatesModelInputSchema,
      agentId,
      render: ({ status, result }) => {
        if (status === 'inProgress' || status === 'executing') {
          return <p className={styles.notice}>正在查找常用路线…</p>
        }
        const items =
          result && typeof result === 'object' && 'items' in result
            ? ((result as SearchRouteTemplatesOutput).items ?? [])
            : []
        if (items.length === 0) {
          return (
            <p className={styles.notice}>
              没有匹配的常用路线。可在表单填写路线名称，不阻断手动创建。
            </p>
          )
        }
        return (
          <div className={styles.reviewCardBody}>
            <p className={styles.notice}>组织内常用路线候选（回复要用哪一条；确认与拒绝只在中间表单）：</p>
            {items.map((item) => (
              <p key={item.id} className={styles.notice}>
                {item.name} · {item.defaultDayCount} 天 · 用过 {item.usageCount} 次
                {item.matchReasons.length > 0
                  ? ` · ${item.matchReasons.map(formatMatchReason).join('；')}`
                  : ''}
              </p>
            ))}
          </div>
        )
      },
    },
    [agentId],
  )
  return null
}

function submittedReviewNoticeKey(result: unknown): string | null {
  if (typeof result === 'object' && result !== null && 'reviewPackageId' in result) {
    const id = result.reviewPackageId
    if (typeof id === 'string' && id.length > 0) {
      return id
    }
  }
  if (typeof result === 'string' && result.length > 0 && result !== '[object Object]') {
    return result
  }
  return null
}

function ReviewPackageNotice({
  agentId,
  onSubmitted,
}: {
  agentId: string
  onSubmitted?: () => void
}) {
  const notifiedRef = useRef<string | null>(null)
  useRenderTool(
    {
      name: 'submitReviewPackage',
      parameters: submitReviewPackageModelInputSchema,
      agentId,
      render: ({ status, parameters, result }) => {
        const fieldKeys = parameters?.candidates?.map((candidate) => candidate.fieldKey) ?? []
        const labels = formatReviewFieldList(fieldKeys)
        const noticeKey = submittedReviewNoticeKey(result)
        if (status === 'complete' && noticeKey && notifiedRef.current !== noticeKey) {
          notifiedRef.current = noticeKey
          queueMicrotask(() => onSubmitted?.())
        }
        if (status === 'inProgress' || status === 'executing') {
          return <p className={styles.notice}>正在整理审核建议…</p>
        }
        return (
          <p className={styles.notice}>
            已建议修改{labels || '基础信息'}。请到中间表单确认，不会自动写入发团创建草稿。
          </p>
        )
      },
    },
    [agentId, onSubmitted],
  )
  return null
}

function FirstTurnSender({
  agentId,
  runId,
  consumeKey,
}: {
  agentId: string
  runId: string
  consumeKey?: string | null
}) {
  const sentRef = useRef(false)
  const { agent, isReady } = useAgent({ agentId })
  const { copilotkit } = useCopilotKit()

  useEffect(() => {
    if (isReady === false) {
      return
    }
    if (sentRef.current) {
      return
    }
    if (sentFirstTurns.has(runId)) {
      sentRef.current = true
      return
    }
    sentRef.current = true
    sentFirstTurns.add(runId)
    if (consumeKey) {
      sentConsumeKeys.add(consumeTurnKey(runId, consumeKey))
    }
    agent.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: AI_CREATE_FIRST_TURN,
    })
    void copilotkit.runAgent({ agent })

    return () => {
      window.setTimeout(() => {
        sentFirstTurns.delete(runId)
      }, 0)
    }
  }, [agent, consumeKey, copilotkit, isReady, runId])

  return null
}

function CommitMaterialsOnSend({
  agentId,
  taskId,
  pendingFilesRef,
}: {
  agentId: string
  taskId: string
  pendingFilesRef: MutableRefObject<Map<string, File>>
}) {
  const { agent } = useAgent({ agentId })
  const committedUrlsRef = useRef(new Set<string>())
  const committingRef = useRef(false)
  const messages = Array.isArray(agent.messages) ? agent.messages : []
  const blobUrls = messages.flatMap((message) => {
    if (!message || typeof message !== 'object' || !('content' in message)) {
      return []
    }
    return collectSentAttachmentBlobUrls(message.content)
  })
  const blobKey = blobUrls.join('\0')

  useEffect(() => {
    if (!blobKey || committingRef.current) {
      return
    }

    committingRef.current = true
    void commitPendingMaterials({
      taskId,
      blobUrls: blobKey.split('\0'),
      pendingFiles: pendingFilesRef.current,
      committedUrls: committedUrlsRef.current,
      upload: uploadDepartureMaterial,
    })
      .catch(() => {
        message.error('附件提交失败，可继续用表单填写')
      })
      .finally(() => {
        committingRef.current = false
      })
  }, [blobKey, pendingFilesRef, taskId])

  return null
}

function ConsumeMaterialsSender({
  agentId,
  runId,
  consumeKey,
}: {
  agentId: string
  runId: string
  consumeKey?: string | null
}) {
  const { agent, isReady } = useAgent({ agentId })
  const { copilotkit } = useCopilotKit()
  const isRunning = Boolean(agent.isRunning)

  useEffect(() => {
    if (isReady === false) {
      return
    }
    const key = consumeKey ? consumeTurnKey(runId, consumeKey) : ''
    if (
      !canStartConsumeRun({
        consumeKey,
        firstTurnSent: sentFirstTurns.has(runId),
        alreadySent: key ? sentConsumeKeys.has(key) : true,
        isRunning,
      })
    ) {
      return
    }
    sentConsumeKeys.add(key)
    void copilotkit.runAgent({ agent })
  }, [agent, consumeKey, copilotkit, isReady, isRunning, runId])

  return null
}

export function AiCreateAssistChat({
  agentRuntimeUrl,
  delegationToken,
  taskId,
  runId,
  snapshotVersion,
  stageKey,
  runStatus,
  reviewPackageId,
  progress,
  pendingReview,
  reviewDecision,
  materialConsumePending,
  materialConsumeKey,
  onReviewPackageSubmitted,
}: AiCreateAssistChatProps) {
  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${delegationToken}`,
      'X-Ai-Task-Id': taskId,
      'X-Ai-Run-Id': runId,
    }),
    [delegationToken, runId, taskId],
  )
  const properties = useMemo(
    () => ({
      taskId,
      runId,
    }),
    [runId, taskId],
  )
  const [errorText, setErrorText] = useState<string | null>(null)
  const handleError = useCallback(() => {
    setErrorText(ASSIST_ERROR_TEXT)
  }, [])
  const consumeKey = materialConsumePending ? materialConsumeKey ?? 'pending' : null
  const previewUrlsRef = useRef<PreviewObjectUrl[]>([])
  const pendingFilesRef = useRef(new Map<string, File>())
  useEffect(() => {
    const urls = previewUrlsRef.current
    const pendingFiles = pendingFilesRef.current
    return () => {
      for (const url of urls) {
        url.revoke()
      }
      pendingFiles.clear()
    }
  }, [])
  const handleUpload = useCallback(async (file: File) => {
    const previewUrl = createPreviewObjectUrl(file)
    previewUrlsRef.current.push(previewUrl)
    pendingFilesRef.current.set(previewUrl.value, file)
    return {
      type: 'url' as const,
      value: previewUrl.value,
      mimeType: file.type,
      metadata: { filename: file.name },
    }
  }, [])

  return (
    <div className={styles.root}>
      {errorText ? (
        <p className={styles.error} role="alert">
          {errorText}
        </p>
      ) : null}
      <CopilotKit
        runtimeUrl={agentRuntimeUrl}
        headers={headers}
        properties={properties}
        useSingleEndpoint={false}
        showDevConsole={import.meta.env.DEV}
        debug={{ events: true, lifecycle: true, verbose: false }}
      >
        <AssistLightState
          taskId={taskId}
          snapshotVersion={snapshotVersion}
          stageKey={stageKey}
          runStatus={runStatus}
          reviewPackageId={reviewPackageId}
          progress={progress}
        />
        <SearchRouteTemplatesNotice agentId={AGENT_ID} />
        <ReviewPackageNotice agentId={AGENT_ID} onSubmitted={onReviewPackageSubmitted} />
        <ReviewDecisionGate
          agentId={AGENT_ID}
          pendingReview={pendingReview}
          reviewDecision={reviewDecision}
        />
        <CopilotChatConfigurationProvider agentId={AGENT_ID} threadId={runId}>
          <FirstTurnSender agentId={AGENT_ID} runId={runId} consumeKey={consumeKey} />
          <CommitMaterialsOnSend
            agentId={AGENT_ID}
            taskId={taskId}
            pendingFilesRef={pendingFilesRef}
          />
          <ConsumeMaterialsSender agentId={AGENT_ID} runId={runId} consumeKey={consumeKey} />
          <CopilotChat
            agentId={AGENT_ID}
            threadId={runId}
            className={styles.chat}
            labels={{ chatInputPlaceholder: '询问当前发团草稿，或附上图片、PDF…' }}
            onError={handleError}
            attachments={{
              enabled: true,
              accept: 'image/*,application/pdf',
              maxSize: MATERIAL_MAX_BYTES,
              onUpload: handleUpload,
              onUploadFailed: () => {
                message.error('附件上传失败，可继续用表单填写')
              },
            }}
          />
        </CopilotChatConfigurationProvider>
      </CopilotKit>
    </div>
  )
}
