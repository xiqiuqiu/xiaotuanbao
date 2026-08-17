import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CopilotChatConfigurationProvider,
  CopilotChatView,
  CopilotKit,
  useAgentContext,
  useAttachments,
  useRenderTool,
  type ReactActivityMessageRenderer,
} from '@copilotkit/react-core/v2'
import { Alert, Button, Card, Input, Radio, Space, Typography } from 'antd'
import '@copilotkit/react-core/v2/styles.css'
import {
  aiCreateSharedLightStateSchema,
  searchRouteTemplatesModelInputSchema,
  submitReviewPackageModelInputSchema,
  type AiCreateSharedLightState,
  type SearchRouteTemplatesOutput,
  type RouteTemplateMatchReason,
} from '@xiaotuanbao/ai-contracts'
import type {
  AiConversationEventView,
  AiConversationDraftView,
  AiInputBatchView,
} from '@xiaotuanbao/shared'
import { env } from '@/config/env'
import { useOptionalAssistPaneSlot } from '@/layouts/assist-pane-slot'
import {
  abandonConversationBatch,
  cancelAiConversationInteraction,
  listAiConversationEvents,
  removeConversationMaterials,
  retryFailedConversationMaterials,
  sendAiConversationMessage,
  saveAiConversationDraft,
  stopConversationBatch,
} from '@/services/ai-create-task.service'
import { ASSIST_ERROR_TEXT } from './assist-error-text'
import { formatReviewFieldList } from './review-field-labels'
import {
  BATCH_STATUS_ACTIVITY_TYPE,
  INTERACTION_ACTIVITY_TYPE,
  isCopilotChatRunning,
  toCopilotChatMessages,
  type BatchStatusActivityContent,
  type InteractionActivityContent,
} from './ai-create-copilot-messages'
import { AiCreateAssistWelcome } from './AiCreateAssistWelcome'
import { AssistMaterialsTrigger } from './AssistMaterialsTrigger'
import styles from './AiCreateAssistChat.module.css'

const AGENT_ID = 'ai-create-readonly-assist'

type DraftVersion = Pick<AiConversationDraftView, 'draftEpoch' | 'revision'>

function isNewerDraftVersion(next: DraftVersion, current: DraftVersion): boolean {
  return (
    next.draftEpoch > current.draftEpoch ||
    (next.draftEpoch === current.draftEpoch && next.revision > current.revision)
  )
}

export interface AiCreateAssistChatProps {
  agentRuntimeUrl: string
  delegationToken: string
  taskId: string
  runId: string
  conversationId: string
  initialEvents?: AiConversationEventView[]
  initialActiveBatch?: AiInputBatchView | null
  initialDraft?: AiConversationDraftView
  snapshotVersion: number
  stageKey: AiCreateSharedLightState['stageKey']
  runStatus: AiCreateSharedLightState['runStatus']
  reviewPackageId?: string | null
  progress?: AiCreateSharedLightState['progress']
  onReviewPackageSubmitted?: () => void
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

function getContiguousSequence(events: AiConversationEventView[]): number {
  const sequences = new Set(events.map((event) => event.sequence))
  let sequence = 0
  while (sequences.has(sequence + 1)) {
    sequence += 1
  }
  return sequence
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

// CopilotKit v2 没有可恢复的持久化追问 Slot；用 activity renderer 把服务端交互事件投影为追问卡。
function InteractionCard({
  content,
  pending,
  onReply,
  onCancel,
}: {
  content: InteractionActivityContent
  pending: boolean
  onReply: (content: InteractionActivityContent, text: string, selectedOptionId?: string) => void
  onCancel: (content: InteractionActivityContent) => void
}) {
  const [text, setText] = useState('')
  const [selectedOptionId, setSelectedOptionId] = useState<string>()
  const resolved = content.status !== 'pending'
  const title =
    content.status === 'answered'
      ? '追问已回答'
      : content.status === 'cancelled'
        ? '已取消本次等待'
        : content.type === 'single_choice'
          ? '请选择一项'
          : '请补充说明'

  return (
    <Card
      className={styles.reviewCard}
      classNames={{ body: styles.reviewCardBody }}
      size="small"
      title={title}
      role="status"
    >
      <Typography.Text>{content.prompt}</Typography.Text>
      {resolved ? (
        <Typography.Text type="secondary">
          {content.status === 'answered' ? '已根据你的回答继续处理。' : '已取消等待，可继续发送新的说明。'}
        </Typography.Text>
      ) : content.type === 'single_choice' ? (
        <Radio.Group
          value={selectedOptionId}
          onChange={(event) => setSelectedOptionId(event.target.value)}
          options={content.options.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
        />
      ) : (
        <Input.TextArea
          aria-label="回答当前追问"
          value={text}
          autoSize={{ minRows: 2, maxRows: 4 }}
          onChange={(event) => setText(event.target.value)}
        />
      )}
      {resolved ? null : (
        <Space size={8}>
          <Button
            type="primary"
            size="small"
            loading={pending}
            disabled={
              pending ||
              (content.type === 'single_choice' ? !selectedOptionId : text.trim().length === 0)
            }
            onClick={() =>
              onReply(
                content,
                content.type === 'single_choice'
                  ? (content.options.find((option) => option.id === selectedOptionId)?.label ?? '')
                  : text,
                selectedOptionId,
              )
            }
          >
            发送回答
          </Button>
          <Button size="small" loading={pending} disabled={pending} onClick={() => onCancel(content)}>
            取消本次等待
          </Button>
        </Space>
      )}
    </Card>
  )
}

function createInteractionActivityRenderer(handlers: {
  pending: boolean
  onReply: (content: InteractionActivityContent, text: string, selectedOptionId?: string) => void
  onCancel: (content: InteractionActivityContent) => void
}): ReactActivityMessageRenderer<InteractionActivityContent> {
  return {
    activityType: INTERACTION_ACTIVITY_TYPE,
    content: {
      '~standard': {
        version: 1,
        vendor: 'xiaotuanbao',
        validate(value) {
          if (
            value &&
            typeof value === 'object' &&
            typeof (value as { interactionId?: unknown }).interactionId === 'string' &&
            typeof (value as { prompt?: unknown }).prompt === 'string'
          ) {
            return { value: value as InteractionActivityContent }
          }
          return { issues: [{ message: 'invalid interaction activity' }] }
        },
      },
    },
    render: ({ content }) => (
      <InteractionCard
        content={content}
        pending={handlers.pending}
        onReply={handlers.onReply}
        onCancel={handlers.onCancel}
      />
    ),
  }
}
const EVENT_CATCH_UP_POLL_MS = 1_000
const DRAFT_SAVE_DEBOUNCE_MS = 600
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
  initialDraft,
  snapshotVersion,
  stageKey,
  runStatus,
  reviewPackageId,
  progress,
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
  const [activeBatch, setActiveBatch] = useState<AiInputBatchView | null>(
    initialActiveBatch ?? null,
  )
  const [draft, setDraft] = useState(initialDraft?.text ?? '')
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
  const draftEpochRef = useRef(initialDraft?.draftEpoch ?? 0)
  const draftRevisionRef = useRef(initialDraft?.revision ?? 0)
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const draftSaveGenerationRef = useRef(0)
  const editingDraftRef = useRef(false)
  const deferredDraftRef = useRef<AiConversationDraftView | null>(null)

  const applyServerDraft = useCallback((next: AiConversationDraftView) => {
    if (
      !isNewerDraftVersion(next, {
        draftEpoch: draftEpochRef.current,
        revision: draftRevisionRef.current,
      })
    ) {
      return
    }
    if (editingDraftRef.current) {
      const deferred = deferredDraftRef.current
      if (!deferred || isNewerDraftVersion(next, deferred)) {
        deferredDraftRef.current = next
      }
      return
    }
    draftEpochRef.current = next.draftEpoch
    draftRevisionRef.current = next.revision
    setDraft(next.text)
  }, [])

  const updateDraft = useCallback(
    (value: string) => {
      setDraft(value)
      editingDraftRef.current = true
      draftSaveGenerationRef.current += 1
      const generation = draftSaveGenerationRef.current
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
      }
      draftSaveTimerRef.current = setTimeout(() => {
        const epoch = draftEpochRef.current
        void saveAiConversationDraft(taskId, conversationId, { text: value, draftEpoch: epoch })
          .then((saved) => {
            if (generation !== draftSaveGenerationRef.current) {
              return
            }
            editingDraftRef.current = false
            applyServerDraft(saved)
            const deferred = deferredDraftRef.current
            deferredDraftRef.current = null
            if (deferred) {
              applyServerDraft(deferred)
            }
          })
          .catch(() => {
            if (generation !== draftSaveGenerationRef.current) {
              return
            }
            editingDraftRef.current = false
            const deferred = deferredDraftRef.current
            deferredDraftRef.current = null
            if (deferred) {
              applyServerDraft(deferred)
            }
          })
      }, DRAFT_SAVE_DEBOUNCE_MS)
    },
    [applyServerDraft, conversationId, taskId],
  )

  useEffect(
    () => () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    lastSequenceRef.current = getContiguousSequence(events)
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
          if (abort.signal.aborted) {
            return
          }
          if (page.activeBatch !== undefined) {
            setActiveBatch(page.activeBatch)
          }
          if (page.draft) {
            applyServerDraft(page.draft)
          }
          if (page.events.length > 0) {
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
  }, [applyServerDraft, conversationId, taskId])

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
      draftSaveGenerationRef.current += 1
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
      }
      editingDraftRef.current = false
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
        setActiveBatch(result.batch)
        setPendingText(null)
        setPendingUploadCount(0)
        if (result.draft) {
          applyServerDraft(result.draft)
        }
        idempotencyKeyRef.current = null
        if (files.length > 0 || result.events.some((event) => event.kind === 'batch_status')) {
          setMaterialsRefreshKey((key) => key + 1)
        }
      } catch {
        setErrorText(ASSIST_ERROR_TEXT)
        updateDraft(nextText)
        setPendingText(null)
        setPendingUploadCount(0)
        await restoreFiles?.()
      } finally {
        sendingRef.current = false
      }
    },
    [applyServerDraft, conversationId, draft, pendingText, taskId, updateDraft],
  )

  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  const applyCommandResult = useCallback(
    (result: {
      events: AiConversationEventView[]
      batch?: AiInputBatchView
      draft?: AiConversationDraftView
    }) => {
      setEvents((current) => mergeEvents(current, result.events))
      if (result.batch) {
        setActiveBatch(result.batch)
      }
      if (result.draft) {
        applyServerDraft(result.draft)
      }
      setMaterialsRefreshKey((key) => key + 1)
    },
    [applyServerDraft],
  )

  const runBatchCommand = useCallback(
    async (
      execute: () => Promise<{
        events: AiConversationEventView[]
        batch?: AiInputBatchView
        draft?: AiConversationDraftView
      }>,
    ) => {
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
      createInteractionActivityRenderer({
        pending: commandPending,
        onReply: (content, text, selectedOptionId) => {
          void runBatchCommand(() =>
            sendAiConversationMessage(
              taskId,
              conversationId,
              {
                text,
                replyToEventId: content.eventId,
                interactionId: content.interactionId,
                interactionVersion: content.version,
                selectedOptionId,
              },
              crypto.randomUUID(),
            ),
          )
        },
        onCancel: (content) => {
          void runBatchCommand(() =>
            cancelAiConversationInteraction(
              taskId,
              conversationId,
              content.interactionId,
              content.version,
              crypto.randomUUID(),
            ),
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
    () => toCopilotChatMessages(events, pendingText, activeBatch, pendingUploadCount),
    [activeBatch, events, pendingText, pendingUploadCount],
  )
  const isRunning = isCopilotChatRunning(events, activeBatch, pendingText)

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
            setDraft={updateDraft}
            onSend={send}
            WelcomeScreen={WelcomeScreen}
          />
        </CopilotChatConfigurationProvider>
      </CopilotKit>
    </div>
  )
}
