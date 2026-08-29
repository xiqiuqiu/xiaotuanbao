import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CopilotChatConfigurationProvider,
  CopilotChatInput,
  CopilotChatView,
  CopilotKit,
  useAgentContext,
  type CopilotChatInputProps,
  type ReactActivityMessageRenderer,
} from '@copilotkit/react-core/v2'
import { Alert, Button, Card, Input, Radio, Space, Typography } from 'antd'
import '@copilotkit/react-core/v2/styles.css'
import {
  aiCreateSharedLightStateSchema,
  type AiCreateSharedLightState,
  type RouteTemplateMatchReason,
} from '@xiaotuanbao/ai-contracts'
import {
  parseConversationStreamFrame,
  type AiConversationEventView,
  type AiConversationDraftView,
  type AiInputBatchView,
} from '@xiaotuanbao/shared'
import { env } from '@/config/env'
import { useOptionalAssistPaneSlot } from '@/layouts/assist-pane-slot'
import {
  abandonConversationBatch,
  cancelAiConversationInteraction,
  listAiConversationEvents,
  removeConversationMaterials,
  retryFailedConversationMaterials,
  retryFailedConversationBatch,
  sendAiConversationMessage,
  saveAiConversationDraft,
  stopConversationBatch,
} from '@/services/ai-create-task.service'
import { ASSIST_ERROR_TEXT, getAssistErrorText } from './assist-error-text'
import { formatReviewFieldList } from './review-field-labels'
import {
  BATCH_STATUS_ACTIVITY_TYPE,
  INTERACTION_ACTIVITY_TYPE,
  REVIEW_PACKAGE_ACTIVITY_TYPE,
  SEARCH_ROUTE_TEMPLATES_ACTIVITY_TYPE,
  isCopilotChatRunning,
  currentStoppableBatchId,
  toCopilotChatMessages,
  type BatchStatusActivityContent,
  type InteractionActivityContent,
  type ReviewPackageActivityContent,
  type SearchRouteTemplatesActivityContent,
} from './ai-create-copilot-messages'
import { AiCreateAssistWelcome } from './AiCreateAssistWelcome'
import { AssistMaterialsTrigger } from './AssistMaterialsTrigger'
import {
  CONVERSATION_ERROR_CATCH_UP_DEBOUNCE_MS,
  conversationCatchUpIntervalMs,
} from './ai-create-assist-polling'
import styles from './AiCreateAssistChat.module.css'
import { ComposerSendButton } from './composer-send-button'
import {
  filesFromAttachmentSources,
  MATERIAL_ACCEPT,
  useConversationComposerAttachments,
} from './conversation-composer-attachments'

const AGENT_ID = 'ai-create-readonly-assist'

type DraftVersion = Pick<AiConversationDraftView, 'draftEpoch' | 'revision'>

function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

function isNewerDraftVersion(next: DraftVersion, current: DraftVersion): boolean {
  return (
    next.draftEpoch > current.draftEpoch ||
    (next.draftEpoch === current.draftEpoch && next.revision > current.revision)
  )
}

export interface AiCreateAssistChatProps {
  agentRuntimeUrl: string
  taskId: string
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

function formatMatchReason(reason: Record<string, unknown> | RouteTemplateMatchReason): string {
  if (reason.code === 'name_contains_token') {
    return `名称包含「${String(reason.token ?? '')}」`
  }
  if (reason.code === 'segment_name_contains_token') {
    return `行程段「${String(reason.segmentName ?? '')}」包含「${String(reason.token ?? '')}」`
  }
  if (reason.code === 'destination_contains_token') {
    return `目的地「${String(reason.destination ?? '')}」包含「${String(reason.token ?? '')}」`
  }
  if (reason.code === 'day_count_equals') {
    const dayCount = 'dayCount' in reason ? reason.dayCount : undefined
    return typeof dayCount === 'number' ? `默认 ${dayCount} 天` : '默认天数匹配'
  }
  return '常用路线'
}

function ReviewPackageNotice({ fieldKeys }: { fieldKeys: string[] }) {
  const labels = formatReviewFieldList(fieldKeys)
  return (
    <p className={styles.notice}>
      已建议修改{labels || '基础信息'}。请到中间表单确认，不会自动写入发团创建草稿。
    </p>
  )
}

function SearchRouteTemplatesNotice({ items }: { items: SearchRouteTemplatesActivityContent['items'] }) {
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
  onRetryBatch: (batchId: string) => void
  onRemove: (batchId: string, materialId: string) => void
  onAbandon: (batchId: string) => void
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
        {content.showBatchRetryAction && content.batchId ? (
          <Space size={8} className={styles.failedActions}>
            <Button
              type="primary"
              size="small"
              autoInsertSpace={false}
              loading={handlers.pending}
              onClick={() => handlers.onRetryBatch(content.batchId!)}
            >
              重试
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

function createReviewPackageActivityRenderer(): ReactActivityMessageRenderer<ReviewPackageActivityContent> {
  return {
    activityType: REVIEW_PACKAGE_ACTIVITY_TYPE,
    content: {
      '~standard': {
        version: 1,
        vendor: 'xiaotuanbao',
        validate(value) {
          if (
            value &&
            typeof value === 'object' &&
            typeof (value as { reviewPackageId?: unknown }).reviewPackageId === 'string'
          ) {
            return { value: value as ReviewPackageActivityContent }
          }
          return { issues: [{ message: 'invalid review package activity' }] }
        },
      },
    },
    render: ({ content }) => <ReviewPackageNotice fieldKeys={content.fieldKeys} />,
  }
}

function createSearchRouteTemplatesActivityRenderer(): ReactActivityMessageRenderer<SearchRouteTemplatesActivityContent> {
  return {
    activityType: SEARCH_ROUTE_TEMPLATES_ACTIVITY_TYPE,
    content: {
      '~standard': {
        version: 1,
        vendor: 'xiaotuanbao',
        validate(value) {
          if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
            return { value: value as SearchRouteTemplatesActivityContent }
          }
          return { issues: [{ message: 'invalid search route templates activity' }] }
        },
      },
    },
    render: ({ content }) => <SearchRouteTemplatesNotice items={content.items} />,
  }
}

const DRAFT_SAVE_DEBOUNCE_MS = 600
const DEFAULT_ATTACHMENT_TEXT = '请根据附件整理发团资料。'

function DepartureAssistChatInputView(props: CopilotChatInputProps) {
  const draftValue = String(props.value ?? '')
  const hasDraft = draftValue.trim().length > 0
  return (
    <CopilotChatInput
      {...props}
      isRunning={Boolean(props.isRunning) && !hasDraft}
      textArea={{ 'aria-label': '询问当前发团草稿' }}
      sendButton={(buttonProps) => (
        <ComposerSendButton
          {...buttonProps}
          isRunning={props.isRunning}
          canStop={Boolean(props.onStop)}
          draftValue={draftValue}
        />
      )}
    />
  )
}

const DepartureAssistChatInput = Object.assign(DepartureAssistChatInputView, CopilotChatInput)

function ChatComposer({
  messages,
  isRunning,
  draft,
  pendingText,
  setDraft,
  onSend,
  onStop,
  WelcomeScreen,
}: {
  messages: ReturnType<typeof toCopilotChatMessages>
  isRunning: boolean
  draft: string
  pendingText: string | null
  setDraft: (value: string) => void
  onSend: (text: string, files: File[], restoreFiles?: () => Promise<void>) => Promise<void>
  onStop?: () => void
  WelcomeScreen: (props: { input?: ReactNode }) => ReactNode
}) {
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
  } = useConversationComposerAttachments()

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
          const files = filesFromAttachmentSources(ready)
          void onSend(value, files, () => processFiles(files))
        }}
        welcomeScreen={WelcomeScreen}
        attachments={attachments}
        onRemoveAttachment={(id) => {
          removeAttachment(id)
        }}
        onAddFile={() => fileInputRef.current?.click()}
        dragOver={dragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => {
          void handleDrop(event)
        }}
        input={DepartureAssistChatInput}
        onStop={onStop}
      />
    </div>
  )
}

type ValueRef<T> = { current: T }

function startConversationCatchUpPolling(
  catchUp: () => Promise<void>,
  activeBatchStatusRef: ValueRef<AiInputBatchView['status'] | null>,
  isCancelled: () => boolean,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    timer = setTimeout(() => {
      if (isCancelled()) {
        return
      }
      if (document.visibilityState === 'hidden') {
        schedule()
        return
      }
      void catchUp().finally(() => {
        if (!isCancelled()) {
          schedule()
        }
      })
    }, conversationCatchUpIntervalMs(activeBatchStatusRef.current))
  }
  schedule()
  return () => {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function createCatchUpErrorHandler(catchUp: () => Promise<void>, isCancelled: () => boolean) {
  let debounce: ReturnType<typeof setTimeout> | undefined
  return {
    trigger() {
      if (isCancelled() || debounce) {
        return
      }
      debounce = setTimeout(() => {
        debounce = undefined
      }, CONVERSATION_ERROR_CATCH_UP_DEBOUNCE_MS)
      void catchUp()
    },
    dispose() {
      if (debounce) {
        clearTimeout(debounce)
      }
    },
  }
}

type ConversationEventSink = {
  updateActiveBatch: (batch: AiInputBatchView | null) => void
  applyServerDraft: (draft: AiConversationDraftView) => void
  mergeEvents: (events: AiConversationEventView[]) => void
  materialsChanged: () => void
  notifyReviewPackageSubmitted: () => void
}

function useConversationEventSync({
  taskId,
  conversationId,
  lastSequenceRef,
  activeBatchStatusRef,
  sink,
}: {
  taskId: string
  conversationId: string
  lastSequenceRef: ValueRef<number>
  activeBatchStatusRef: ValueRef<AiInputBatchView['status'] | null>
  sink: ConversationEventSink
}) {
  useEffect(() => {
    const abort = new AbortController()
    let cancelled = false
    const isCancelled = () => cancelled
    const catchUp = () =>
      Promise.resolve(
        listAiConversationEvents(taskId, conversationId, lastSequenceRef.current, {
          signal: abort.signal,
          silentError: true,
        }),
      )
        .then((page) => {
          if (abort.signal.aborted || cancelled) return
          if (page.activeBatch !== undefined) sink.updateActiveBatch(page.activeBatch)
          if (page.draft) sink.applyServerDraft(page.draft)
          if (page.events.length === 0) return
          sink.mergeEvents(page.events)
          if (page.events.some((event) => event.kind === 'batch_status')) {
            sink.materialsChanged()
            sink.notifyReviewPackageSubmitted()
          }
        })
        .catch(() => undefined)

    const stopPolling = startConversationCatchUpPolling(
      catchUp,
      activeBatchStatusRef,
      isCancelled,
    )
    const errorHandler = createCatchUpErrorHandler(catchUp, isCancelled)
    const source = new EventSource(
      `${env.apiBaseUrl}/agent/conversations/${conversationId}/stream?afterSequence=${lastSequenceRef.current}`,
      { withCredentials: true },
    )
    source.onmessage = (message) => {
      try {
        const frame = parseConversationStreamFrame(JSON.parse(message.data) as unknown)
        if (!frame || frame.type !== 'conversation.event') {
          return
        }
        const parsed = frame.event
        if (typeof parsed.sequence !== 'number' || typeof parsed.kind !== 'string') return
        sink.mergeEvents([parsed])
        if (parsed.kind === 'batch_status') {
          sink.materialsChanged()
          sink.notifyReviewPackageSubmitted()
        }
      } catch {
        // ignore malformed frames
      }
    }
    source.onerror = errorHandler.trigger
    const onVisible = () => {
      if (document.visibilityState === 'visible') void catchUp()
    }
    document.addEventListener('visibilitychange', onVisible)
    void catchUp()
    return () => {
      cancelled = true
      abort.abort()
      source.close()
      stopPolling()
      errorHandler.dispose()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [
    activeBatchStatusRef,
    conversationId,
    lastSequenceRef,
    sink,
    taskId,
  ])
}

type BatchCommandResult = {
  events: AiConversationEventView[]
  batch?: AiInputBatchView
  draft?: AiConversationDraftView
}

function useBatchCommands({
  sendingRef,
  applyServerDraft,
  setEvents,
  setActiveBatch,
  setMaterialsRefreshKey,
  setErrorText,
}: {
  sendingRef: ValueRef<boolean>
  applyServerDraft: (next: AiConversationDraftView) => void
  setEvents: (updater: (current: AiConversationEventView[]) => AiConversationEventView[]) => void
  setActiveBatch: (batch: AiInputBatchView) => void
  setMaterialsRefreshKey: (updater: (current: number) => number) => void
  setErrorText: (error: string | null) => void
}) {
  const [status, setStatus] = useState<'idle' | 'pending'>('idle')
  const generationRef = useRef(0)
  const finish = useCallback(
    (generation: number) => {
      if (generation !== generationRef.current) return
      sendingRef.current = false
      setStatus('idle')
    },
    [sendingRef],
  )
  const applyResult = useCallback(
    (result: BatchCommandResult) => {
      setEvents((current) => mergeEvents(current, result.events))
      if (result.batch) setActiveBatch(result.batch)
      if (result.draft) applyServerDraft(result.draft)
      setMaterialsRefreshKey((key) => key + 1)
    },
    [applyServerDraft, setActiveBatch, setEvents, setMaterialsRefreshKey],
  )
  const run = useCallback(
    async (execute: () => Promise<BatchCommandResult>) => {
      if (sendingRef.current) return
      sendingRef.current = true
      generationRef.current += 1
      const generation = generationRef.current
      setStatus('pending')
      setErrorText(null)
      try {
        applyResult(await execute())
      } catch {
        setErrorText(ASSIST_ERROR_TEXT)
      } finally {
        finish(generation)
      }
    },
    [applyResult, finish, sendingRef, setErrorText],
  )
  return { pending: status === 'pending', run }
}

function useActivityRenderers({
  pending,
  run,
  taskId,
  conversationId,
}: {
  pending: boolean
  run: (execute: () => Promise<BatchCommandResult>) => Promise<void>
  taskId: string
  conversationId: string
}) {
  return useMemo(
    () => [
      createBatchStatusActivityRenderer({
        pending,
        onRetry: (batchId) => {
          void run(() =>
            retryFailedConversationMaterials(
              taskId,
              conversationId,
              batchId,
              undefined,
              crypto.randomUUID(),
            ),
          )
        },
        onRetryBatch: (batchId) => {
          void run(() =>
            retryFailedConversationBatch(taskId, conversationId, batchId, crypto.randomUUID()),
          )
        },
        onRemove: (batchId, materialId) => {
          void run(() =>
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
          void run(() =>
            abandonConversationBatch(taskId, conversationId, batchId, crypto.randomUUID()),
          )
        },
      }),
      createInteractionActivityRenderer({
        pending,
        onReply: (content, text, selectedOptionId) => {
          void run(() =>
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
          void run(() =>
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
      createReviewPackageActivityRenderer(),
      createSearchRouteTemplatesActivityRenderer(),
    ],
    [conversationId, pending, run, taskId],
  )
}

function AiCreateAssistChatView({
  errorText,
  agentRuntimeUrl,
  activityRenderers,
  taskId,
  snapshotVersion,
  stageKey,
  runStatus,
  reviewPackageId,
  progress,
  conversationId,
  messages,
  isRunning,
  draft,
  pendingText,
  updateDraft,
  send,
  stop,
  WelcomeScreen,
}: Pick<
  AiCreateAssistChatProps,
  | 'agentRuntimeUrl'
  | 'taskId'
  | 'snapshotVersion'
  | 'stageKey'
  | 'runStatus'
  | 'reviewPackageId'
  | 'progress'
  | 'conversationId'
> & {
  errorText: string | null
  activityRenderers: ReturnType<typeof useActivityRenderers>
  messages: ReturnType<typeof toCopilotChatMessages>
  isRunning: boolean
  draft: string
  pendingText: string | null
  updateDraft: (value: string) => void
  send: (text: string, files?: File[], restoreFiles?: () => Promise<void>) => Promise<void>
  stop?: () => void
  WelcomeScreen: (props: { input?: ReactNode }) => ReactNode
}) {
  return (
    <div className={styles.root}>
      {errorText ? <Alert type="error" showIcon message={errorText} /> : null}
      <CopilotKit
        runtimeUrl={agentRuntimeUrl}
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
            onStop={stop}
            WelcomeScreen={WelcomeScreen}
          />
        </CopilotChatConfigurationProvider>
      </CopilotKit>
    </div>
  )
}

function useAiCreateAssistChatController({
  taskId,
  conversationId,
  initialEvents = [],
  initialActiveBatch = null,
  initialDraft,
  onReviewPackageSubmitted,
}: Pick<
  AiCreateAssistChatProps,
  | 'taskId'
  | 'conversationId'
  | 'initialEvents'
  | 'initialActiveBatch'
  | 'initialDraft'
  | 'onReviewPackageSubmitted'
>) {
  const [events, setEvents] = useState<AiConversationEventView[]>(initialEvents)
  const [activeBatch, setActiveBatch] = useState<AiInputBatchView | null>(
    initialActiveBatch ?? null,
  )
  const activeBatchStatusRef = useLatestRef(activeBatch?.status ?? null)
  const [draft, setDraft] = useState(initialDraft?.text ?? '')
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [pendingUploadCount, setPendingUploadCount] = useState(0)
  const [errorText, setErrorText] = useState<string | null>(null)
  const assistPane = useOptionalAssistPaneSlot()
  const setHeaderExtra = assistPane?.setHeaderExtra
  const [materialsRefreshKey, setMaterialsRefreshKey] = useState(0)
  const idempotencyKeyRef = useRef<string | null>(null)
  const sendingRef = useRef(false)
  const lastSequenceRef = useRef(0)
  const onReviewPackageSubmittedRef = useLatestRef(onReviewPackageSubmitted)
  const notifiedReviewPackageIdRef = useRef<string | null>(null)
  const draftEpochRef = useRef(initialDraft?.draftEpoch ?? 0)
  const draftRevisionRef = useRef(initialDraft?.revision ?? 0)
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const draftSaveAbortRef = useRef<AbortController | null>(null)
  const draftSaveGenerationRef = useRef(0)
  const pendingDraftTextRef = useRef<string | null>(null)
  const editingDraftRef = useRef(false)
  const deferredDraftRef = useRef<AiConversationDraftView | null>(null)

  const abortDraftSave = useCallback(() => {
    draftSaveAbortRef.current?.abort()
    draftSaveAbortRef.current = null
  }, [])

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

  const conversationEventSink = useMemo<ConversationEventSink>(
    () => ({
      updateActiveBatch: setActiveBatch,
      applyServerDraft,
      mergeEvents: (incoming) => {
        setEvents((current) => mergeEvents(current, incoming))
      },
      materialsChanged: () => {
        setMaterialsRefreshKey((key) => key + 1)
      },
      notifyReviewPackageSubmitted: () => {
        onReviewPackageSubmittedRef.current?.()
      },
    }),
    [applyServerDraft, onReviewPackageSubmittedRef],
  )

  const { pending: commandPending, run: runBatchCommand } = useBatchCommands({
    sendingRef,
    applyServerDraft,
    setEvents,
    setActiveBatch,
    setMaterialsRefreshKey,
    setErrorText,
  })
  const activityRenderers = useActivityRenderers({
    pending: commandPending,
    run: runBatchCommand,
    taskId,
    conversationId,
  })

  const updateDraft = useCallback(
    (value: string) => {
      setDraft(value)
      editingDraftRef.current = true
      draftSaveGenerationRef.current += 1
      const generation = draftSaveGenerationRef.current
      pendingDraftTextRef.current = value
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
      }
      draftSaveTimerRef.current = setTimeout(() => {
        pendingDraftTextRef.current = null
        const epoch = draftEpochRef.current
        abortDraftSave()
        const abort = new AbortController()
        draftSaveAbortRef.current = abort
        void saveAiConversationDraft(
          taskId,
          conversationId,
          { text: value, draftEpoch: epoch },
          { signal: abort.signal },
        )
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
          // Failed idle saves must keep editingDraftRef so a deferred remote
          // snapshot cannot replace still-local unsaved composer text.
          .catch(() => undefined)
      }, DRAFT_SAVE_DEBOUNCE_MS)
    },
    [abortDraftSave, applyServerDraft, conversationId, taskId],
  )

  useEffect(
    () => () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
        draftSaveTimerRef.current = undefined
      }
      const text = pendingDraftTextRef.current
      if (text === null) {
        return
      }
      pendingDraftTextRef.current = null
      void saveAiConversationDraft(taskId, conversationId, {
        text,
        draftEpoch: draftEpochRef.current,
      }).catch(() => undefined)
    },
    [conversationId, taskId],
  )

  useEffect(() => {
    lastSequenceRef.current = getContiguousSequence(events)
  }, [events, onReviewPackageSubmittedRef])

  useEffect(() => {
    let latest: string | null = null
    for (const event of events) {
      if (event.kind === 'agent_message' && typeof event.payload.reviewPackageId === 'string') {
        latest = event.payload.reviewPackageId
      }
    }
    if (latest && notifiedReviewPackageIdRef.current !== latest) {
      notifiedReviewPackageIdRef.current = latest
      onReviewPackageSubmittedRef.current?.()
    }
  }, [events, onReviewPackageSubmittedRef])

  useEffect(() => {
    if (!setHeaderExtra) {
      return
    }
    setHeaderExtra(
      <AssistMaterialsTrigger conversationId={conversationId} refreshKey={materialsRefreshKey} />,
    )
    return () => setHeaderExtra(null)
  }, [conversationId, materialsRefreshKey, setHeaderExtra])

  useConversationEventSync({
    taskId,
    conversationId,
    lastSequenceRef,
    activeBatchStatusRef,
    sink: conversationEventSink,
  })

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
      pendingDraftTextRef.current = null
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current)
      }
      abortDraftSave()
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
      } catch (error) {
        setErrorText(getAssistErrorText(error))
        updateDraft(nextText)
        setPendingText(null)
        setPendingUploadCount(0)
        await restoreFiles?.()
      } finally {
        sendingRef.current = false
      }
    },
    [abortDraftSave, applyServerDraft, conversationId, draft, pendingText, taskId, updateDraft],
  )

  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

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
  const stoppableBatchId = currentStoppableBatchId(events, activeBatch)
  const stop = useCallback(() => {
    const batchId = currentStoppableBatchId(events, activeBatch)
    if (!batchId) {
      return
    }
    void runBatchCommand(() =>
      stopConversationBatch(taskId, conversationId, batchId, crypto.randomUUID()),
    )
  }, [activeBatch, conversationId, events, runBatchCommand, taskId])

  return {
    activityRenderers,
    draft,
    errorText,
    isRunning,
    messages,
    pendingText,
    send,
    stop: stoppableBatchId ? stop : undefined,
    updateDraft,
    WelcomeScreen,
  }
}

export function AiCreateAssistChat({
  agentRuntimeUrl,
  taskId,
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
  const {
    activityRenderers,
    draft,
    errorText,
    isRunning,
    messages,
    pendingText,
    send,
    stop,
    updateDraft,
    WelcomeScreen,
  } = useAiCreateAssistChatController({
    taskId,
    conversationId,
    initialEvents,
    initialActiveBatch,
    initialDraft,
    onReviewPackageSubmitted,
  })

  return (
    <AiCreateAssistChatView
      errorText={errorText}
      agentRuntimeUrl={agentRuntimeUrl}
      activityRenderers={activityRenderers}
      taskId={taskId}
      snapshotVersion={snapshotVersion}
      stageKey={stageKey}
      runStatus={runStatus}
      reviewPackageId={reviewPackageId}
      progress={progress}
      conversationId={conversationId}
      messages={messages}
      isRunning={isRunning}
      draft={draft}
      pendingText={pendingText}
      updateDraft={updateDraft}
      send={send}
      stop={stop}
      WelcomeScreen={WelcomeScreen}
    />
  )
}
