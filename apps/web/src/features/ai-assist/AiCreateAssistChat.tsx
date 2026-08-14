import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CopilotChatConfigurationProvider,
  CopilotChatView,
  CopilotKit,
  useAgentContext,
  useAttachments,
  useHumanInTheLoop,
  useRenderTool,
  type ReactActivityMessageRenderer,
} from '@copilotkit/react-core/v2'
import { Alert, Badge, Button, Card, Space, Typography } from 'antd'
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
import type {
  AiConversationEventView,
  AiInputBatchView,
  AiReviewPackageView,
} from '@xiaotuanbao/shared'
import { env } from '@/config/env'
import { useOptionalAssistPaneSlot } from '@/layouts/assist-pane-slot'
import {
  abandonConversationBatch,
  listAiConversationEvents,
  removeConversationMaterials,
  retryFailedConversationMaterials,
  sendAiConversationMessage,
  stopConversationBatch,
} from '@/services/ai-create-task.service'
import { ASSIST_ERROR_TEXT } from './assist-error-text'
import { formatReviewFieldList } from './review-field-labels'
import {
  BATCH_STATUS_ACTIVITY_TYPE,
  isCopilotChatRunning,
  toCopilotChatMessages,
  type BatchStatusActivityContent,
} from './ai-create-copilot-messages'
import { AiCreateAssistWelcome } from './AiCreateAssistWelcome'
import { AssistMaterialsTrigger } from './AssistMaterialsTrigger'
import styles from './AiCreateAssistChat.module.css'

const AGENT_ID = 'ai-create-readonly-assist'

export interface AiCreateAssistChatProps {
  agentRuntimeUrl: string
  delegationToken: string
  taskId: string
  runId: string
  conversationId: string
  initialEvents?: AiConversationEventView[]
  initialActiveBatch?: AiInputBatchView | null
  snapshotVersion: number
  stageKey: AiCreateSharedLightState['stageKey']
  runStatus: AiCreateSharedLightState['runStatus']
  reviewPackageId?: string | null
  progress?: AiCreateSharedLightState['progress']
  pendingReview?: AiReviewPackageView | null
  reviewDecision?: ReviewPackageDecision | null
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

function mergeEvents(
  current: AiConversationEventView[],
  incoming: AiConversationEventView[],
): AiConversationEventView[] {
  const bySequence = new Map(current.map((event) => [event.sequence, event]))
  for (const event of incoming) {
    bySequence.set(event.sequence, event)
  }
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence)
}

function createBatchStatusActivityRenderer(handlers: {
  pending: boolean
  onRetry: (batchId: string) => void
  onRemove: (batchId: string, materialId: string) => void
  onAbandon: (batchId: string) => void
  onStop: (batchId: string) => void
}): ReactActivityMessageRenderer<BatchStatusActivityContent> {
  return {
    activityType: BATCH_STATUS_ACTIVITY_TYPE,
    content: {
      '~standard': {
        version: 1,
        vendor: 'xiaotuanbao',
        validate(value) {
          if (
            value &&
            typeof value === 'object' &&
            typeof (value as { label?: unknown }).label === 'string'
          ) {
            return { value: value as BatchStatusActivityContent }
          }
          return { issues: [{ message: 'invalid batch status activity' }] }
        },
      },
    },
    render: ({ content }) => (
      <div className={styles.noticeBlock}>
        <p className={styles.notice} role="status">
          {content.label}
        </p>
        {content.failedMaterials?.map((item) => (
          <div key={item.materialId} className={styles.failedMaterial}>
            <p className={styles.failedMaterialName}>
              {item.originalFilename}
              {item.errorMessage ? `：${item.errorMessage}` : ''}
            </p>
            {content.showMaterialActions && content.batchId ? (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  loading={handlers.pending}
                  disabled={handlers.pending}
                  onClick={() => handlers.onRemove(content.batchId!, item.materialId)}
                >
                  移除
                </Button>
              </Space>
            ) : null}
          </div>
        ))}
        {content.showMaterialActions && content.batchId ? (
          <Space size={8} className={styles.failedActions}>
            <Button
              type="primary"
              size="small"
              loading={handlers.pending}
              onClick={() => handlers.onRetry(content.batchId!)}
            >
              重试失败资料
            </Button>
            <Button
              danger
              size="small"
              loading={handlers.pending}
              onClick={() => handlers.onAbandon(content.batchId!)}
            >
              放弃本批
            </Button>
          </Space>
        ) : null}
        {content.showStopAction && content.batchId ? (
          <Space size={8} className={styles.failedActions}>
            <Button
              danger
              size="small"
              loading={handlers.pending}
              onClick={() => handlers.onStop(content.batchId!)}
            >
              停止当前处理
            </Button>
          </Space>
        ) : null}
      </div>
    ),
  }
}
const EVENT_CATCH_UP_POLL_MS = 1_000
const MATERIAL_ACCEPT = 'image/png,image/jpeg,image/webp,image/tiff,application/pdf'
const MATERIAL_MAX_BYTES = 20 * 1024 * 1024
const DEFAULT_ATTACHMENT_TEXT = '请根据附件整理发团资料。'

function filesFromAttachmentSources(
  ready: Array<{ source?: { value?: unknown }; metadata?: Record<string, unknown> }>,
  filesByKey: Map<string, File>,
): File[] {
  return ready.flatMap((item) => {
    const key = typeof item.source?.value === 'string' ? item.source.value : ''
    const fromKey = filesByKey.get(key)
    if (fromKey) {
      return [fromKey]
    }
    const metaFile = item.metadata?.file
    return metaFile instanceof File ? [metaFile] : []
  })
}

function dropPreviewKey(filesByKey: Map<string, File>, key: string) {
  filesByKey.delete(key)
  if (key.startsWith('blob:')) {
    URL.revokeObjectURL(key)
  }
}

function ChatComposer({
  messages,
  isRunning,
  draft,
  pendingText,
  setDraft,
  onSend,
  WelcomeScreen,
}: {
  messages: ReturnType<typeof toCopilotChatMessages>
  isRunning: boolean
  draft: string
  pendingText: string | null
  setDraft: (value: string) => void
  onSend: (text: string, files: File[], restoreFiles?: () => Promise<void>) => Promise<void>
  WelcomeScreen: (props: { input?: ReactNode }) => ReactNode
}) {
  const filesByKeyRef = useRef(new Map<string, File>())
  const {
    attachments,
    consumeAttachments,
    processFiles,
    removeAttachment,
    handleFileUpload,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    dragOver,
    fileInputRef,
    containerRef,
  } = useAttachments({
    config: {
      enabled: true,
      accept: MATERIAL_ACCEPT,
      maxSize: MATERIAL_MAX_BYTES,
      onUpload: async (file) => {
        const url = URL.createObjectURL(file)
        filesByKeyRef.current.set(url, file)
        return { type: 'url', value: url, mimeType: file.type }
      },
    },
  })

  useEffect(() => {
    const filesByKey = filesByKeyRef.current
    return () => {
      for (const key of [...filesByKey.keys()]) {
        dropPreviewKey(filesByKey, key)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={styles.chat}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        void handleDrop(event)
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept={MATERIAL_ACCEPT}
        onChange={(event) => {
          void handleFileUpload(event)
        }}
      />
      <CopilotChatView
        className={styles.chat}
        messages={messages}
        isRunning={isRunning}
        inputValue={pendingText ? '' : draft}
        onInputChange={setDraft}
        onSubmitMessage={(value) => {
          const ready = consumeAttachments()
          const files = filesFromAttachmentSources(ready, filesByKeyRef.current)
          for (const item of ready) {
            const key = typeof item.source?.value === 'string' ? item.source.value : ''
            dropPreviewKey(filesByKeyRef.current, key)
          }
          void onSend(value, files, () => processFiles(files))
        }}
        welcomeScreen={WelcomeScreen}
        attachments={attachments}
        onRemoveAttachment={(id) => {
          const current = attachments.find((item) => item.id === id)
          const key = typeof current?.source?.value === 'string' ? current.source.value : ''
          dropPreviewKey(filesByKeyRef.current, key)
          removeAttachment(id)
        }}
        onAddFile={() => fileInputRef.current?.click()}
        dragOver={dragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => {
          void handleDrop(event)
        }}
        input={{
          textArea: { 'aria-label': '询问当前发团草稿' },
        }}
      />
    </div>
  )
}

export function AiCreateAssistChat({
  agentRuntimeUrl,
  delegationToken,
  taskId,
  runId,
  conversationId,
  initialEvents = [],
  initialActiveBatch = null,
  snapshotVersion,
  stageKey,
  runStatus,
  reviewPackageId,
  progress,
  pendingReview,
  reviewDecision,
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
  const [events, setEvents] = useState<AiConversationEventView[]>(initialEvents)
  const [draft, setDraft] = useState('')
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [pendingUploadCount, setPendingUploadCount] = useState(0)
  const [commandPending, setCommandPending] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const assistPane = useOptionalAssistPaneSlot()
  const setHeaderExtra = assistPane?.setHeaderExtra
  const [materialsRefreshKey, setMaterialsRefreshKey] = useState(0)
  const idempotencyKeyRef = useRef<string | null>(null)
  const sendingRef = useRef(false)
  const lastSequenceRef = useRef(0)

  useEffect(() => {
    lastSequenceRef.current = events.reduce((max, event) => Math.max(max, event.sequence), 0)
  }, [events])

  useEffect(() => {
    if (!setHeaderExtra) {
      return
    }
    setHeaderExtra(<AssistMaterialsTrigger taskId={taskId} refreshKey={materialsRefreshKey} />)
    return () => setHeaderExtra(null)
  }, [materialsRefreshKey, setHeaderExtra, taskId])

  useEffect(() => {
    const abort = new AbortController()
    const catchUp = () =>
      Promise.resolve(
        listAiConversationEvents(taskId, conversationId, lastSequenceRef.current, {
          signal: abort.signal,
          silentError: true,
        }),
      )
        .then((page) => {
          if (!abort.signal.aborted && page.events.length > 0) {
            setEvents((current) => mergeEvents(current, page.events))
            if (page.events.some((event) => event.kind === 'batch_status')) {
              setMaterialsRefreshKey((key) => key + 1)
            }
          }
        })
        .catch(() => undefined)

    const source = new EventSource(
      `${env.apiBaseUrl}/ai-create-tasks/${taskId}/conversations/${conversationId}/stream?afterSequence=${lastSequenceRef.current}`,
      { withCredentials: true },
    )
    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as AiConversationEventView
        if (typeof parsed.sequence === 'number' && typeof parsed.kind === 'string') {
          setEvents((current) => mergeEvents(current, [parsed]))
          if (parsed.kind === 'batch_status') {
            setMaterialsRefreshKey((key) => key + 1)
          }
        }
      } catch {
        // ignore malformed frames
      }
    }
    source.onerror = () => {
      void catchUp()
    }
    void catchUp()
    const timer = window.setInterval(() => {
      void catchUp()
    }, EVENT_CATCH_UP_POLL_MS)
    return () => {
      abort.abort()
      source.close()
      window.clearInterval(timer)
    }
  }, [conversationId, taskId])

  const send = useCallback(
    async (text: string, files: File[] = [], restoreFiles?: () => Promise<void>) => {
      const nextText = (text || pendingText || draft).trim()
      if (sendingRef.current) {
        return
      }
      if (!nextText && files.length === 0) {
        return
      }
      sendingRef.current = true
      setErrorText(null)
      const outboundText = nextText || DEFAULT_ATTACHMENT_TEXT
      setPendingText(outboundText)
      setPendingUploadCount(files.length)
      setDraft('')
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID()
      }
      try {
        const result = await sendAiConversationMessage(
          taskId,
          conversationId,
          files.length > 0 ? { text: outboundText, files } : { text: outboundText },
          idempotencyKeyRef.current,
        )
        setEvents((current) => mergeEvents(current, result.events))
        setPendingText(null)
        setPendingUploadCount(0)
        idempotencyKeyRef.current = null
        if (files.length > 0 || result.events.some((event) => event.kind === 'batch_status')) {
          setMaterialsRefreshKey((key) => key + 1)
        }
      } catch {
        setErrorText(ASSIST_ERROR_TEXT)
        setDraft(nextText)
        setPendingText(null)
        setPendingUploadCount(0)
        await restoreFiles?.()
      } finally {
        sendingRef.current = false
      }
    },
    [conversationId, draft, pendingText, taskId],
  )

  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  const applyCommandResult = useCallback((result: { events: AiConversationEventView[] }) => {
    setEvents((current) => mergeEvents(current, result.events))
    setMaterialsRefreshKey((key) => key + 1)
  }, [])

  const runBatchCommand = useCallback(
    async (execute: () => Promise<{ events: AiConversationEventView[] }>) => {
      if (sendingRef.current) {
        return
      }
      sendingRef.current = true
      setCommandPending(true)
      setErrorText(null)
      try {
        applyCommandResult(await execute())
      } catch {
        setErrorText(ASSIST_ERROR_TEXT)
      } finally {
        sendingRef.current = false
        setCommandPending(false)
      }
    },
    [applyCommandResult],
  )

  const activityRenderers = useMemo(
    () => [
      createBatchStatusActivityRenderer({
        pending: commandPending,
        onRetry: (batchId) => {
          void runBatchCommand(() =>
            retryFailedConversationMaterials(
              taskId,
              conversationId,
              batchId,
              undefined,
              crypto.randomUUID(),
            ),
          )
        },
        onRemove: (batchId, materialId) => {
          void runBatchCommand(() =>
            removeConversationMaterials(
              taskId,
              conversationId,
              batchId,
              [materialId],
              crypto.randomUUID(),
            ),
          )
        },
        onAbandon: (batchId) => {
          void runBatchCommand(() =>
            abandonConversationBatch(taskId, conversationId, batchId, crypto.randomUUID()),
          )
        },
        onStop: (batchId) => {
          void runBatchCommand(() =>
            stopConversationBatch(taskId, conversationId, batchId, crypto.randomUUID()),
          )
        },
      }),
    ],
    [commandPending, conversationId, runBatchCommand, taskId],
  )

  const WelcomeScreen = useMemo(
    () =>
      function WelcomeScreenSlot({ input }: { input?: ReactNode }) {
        return (
          <AiCreateAssistWelcome
            input={input}
            onSelectSuggestion={(suggestion) => {
              void sendRef.current(suggestion.message, [])
            }}
          />
        )
      },
    [],
  )

  const messages = useMemo(
    () => toCopilotChatMessages(events, pendingText, initialActiveBatch, pendingUploadCount),
    [events, initialActiveBatch, pendingText, pendingUploadCount],
  )
  const isRunning = isCopilotChatRunning(events, initialActiveBatch, pendingText)

  return (
    <div className={styles.root}>
      {errorText ? (
        <Alert type="error" showIcon message={errorText} />
      ) : null}
      <CopilotKit
        runtimeUrl={agentRuntimeUrl}
        headers={headers}
        properties={properties}
        useSingleEndpoint={false}
        enableInspector={false}
        renderActivityMessages={activityRenderers}
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
        <CopilotChatConfigurationProvider
          agentId={AGENT_ID}
          threadId={conversationId}
          labels={{ chatInputPlaceholder: '询问当前发团草稿…' }}
        >
          <ChatComposer
            messages={messages}
            isRunning={isRunning}
            draft={draft}
            pendingText={pendingText}
            setDraft={setDraft}
            onSend={send}
            WelcomeScreen={WelcomeScreen}
          />
        </CopilotChatConfigurationProvider>
      </CopilotKit>
    </div>
  )
}
