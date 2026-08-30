import {
  CopilotChatConfigurationProvider,
  CopilotChatInput,
  CopilotChatView,
  CopilotKit,
  type CopilotChatInputProps,
  type ReactActivityMessageRenderer,
} from '@copilotkit/react-core/v2'
import { EditOutlined, FileTextOutlined, OrderedListOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, Radio, Space, Tag, Typography } from 'antd'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  AI_REVIEW_CONFIRMATION_UNIT,
  DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
} from '@xiaotuanbao/ai-contracts'
import {
  parseConversationStreamFrame,
  type AiConversationEventView,
  type AiConversationView,
} from '@xiaotuanbao/shared'
import '@copilotkit/react-core/v2/styles.css'
import { env } from '@/config/env'
import {
  getAgentConversation,
  listAgentConversationEvents,
  cancelAgentConversationInteraction,
  retractQueuedAgentConversationBatch,
  sendAgentConversationText,
  stopAgentConversationBatch,
} from '@/services/agent-conversation.service'
import {
  BATCH_STATUS_ACTIVITY_TYPE,
  AGENT_TASK_ACTIVITY_TYPE,
  INTERACTION_ACTIVITY_TYPE,
  REVIEW_PACKAGE_ACTIVITY_TYPE,
  currentStoppableBatchId,
  isCopilotChatRunning,
  projectConversationFrame,
  projectQueuedConversationMessages,
  type AgentTaskActivityContent,
  type BatchStatusActivityContent,
  type InteractionActivityContent,
  type QueuedConversationMessage,
  type ReviewPackageActivityContent,
} from '@/features/ai-assist/ai-create-copilot-messages'
import { AgentReasoningHeader } from './agent-reasoning-message'
import {
  CONVERSATION_ERROR_CATCH_UP_DEBOUNCE_MS,
  CONVERSATION_IDLE_CATCH_UP_MS,
} from '@/features/ai-assist/ai-create-assist-polling'
import {
  ASSIST_ERROR_TEXT,
  getAssistErrorText,
} from '@/features/ai-assist/assist-error-text'
import chatStyles from '@/features/ai-assist/AiCreateAssistChat.module.css'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'
import { useAgentConversationStore } from './agent-conversation.store'
import { useAgentConversationDraft } from './use-agent-conversation-draft'
import {
  conversationSendContextFromAttachment,
  currentPageAttachmentLabel,
} from './page-locator-attachment'
import {
  agentTaskWorkspaceNavigation,
  isCurrentAgentTaskWorkspace,
  resolveRegisteredTaskDescriptor,
} from './task-descriptor-navigation'
import { useCurrentPageAttachment } from './use-current-page-locator'
import { formatReviewFieldList } from '@/features/ai-assist/review-field-labels'
import { ComposerSendButton } from '@/features/ai-assist/composer-send-button'
import {
  DEFAULT_TASKLESS_ATTACHMENT_TEXT,
  filesFromAttachmentSources,
  MATERIAL_ACCEPT,
  useConversationComposerAttachments,
} from '@/features/ai-assist/conversation-composer-attachments'

/** CopilotKit runtime 注册名（apps/agent）；不是 conversation-general 领域指令版本。 */
const COPILOTKIT_RUNTIME_AGENT_ID = 'ai-create-readonly-assist'

type QueuedMessagesContextValue = {
  editingBatchId: string | null
  messages: QueuedConversationMessage[]
  onEdit: (batchId: string) => void
  stoppable: boolean
  onStop?: () => void
}

const QueuedMessagesContext = createContext<QueuedMessagesContextValue>({
  editingBatchId: null,
  messages: [],
  onEdit: () => undefined,
  stoppable: false,
})

function QueueAwareChatInputView(props: CopilotChatInputProps) {
  const {
    editingBatchId,
    messages: queuedMessages,
    onEdit,
    stoppable,
    onStop,
  } = useContext(QueuedMessagesContext)
  const draftValue = String(props.value ?? '')
  const hasDraft = draftValue.trim().length > 0
  const draftEpoch = useAgentConversationRuntimeStore((state) => state.draftEpoch)
  const draftRevision = useAgentConversationRuntimeStore((state) => state.revision)
  return (
    <div className={chatStyles.composerStack}>
      {queuedMessages.length > 0 ? (
        <section
          className={chatStyles.queuePanel}
          aria-label={`排队消息，共 ${queuedMessages.length} 条`}
          aria-live="polite"
        >
          <div className={chatStyles.queueHeading}>
            <span className={chatStyles.queueTitle}>
              <OrderedListOutlined aria-hidden="true" />
              <Typography.Text strong>排队中 · {queuedMessages.length}</Typography.Text>
            </span>
            <Typography.Text type="secondary" className={chatStyles.queueHint}>
              当前处理结束后自动发送
            </Typography.Text>
          </div>
          <ol className={chatStyles.queueList}>
            {queuedMessages.map((item) => (
              <li key={item.batchId} className={chatStyles.queueItem}>
                <Typography.Text ellipsis className={chatStyles.queueItemText}>
                  {item.text}
                </Typography.Text>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label="编辑"
                  loading={editingBatchId === item.batchId}
                  disabled={editingBatchId != null && editingBatchId !== item.batchId}
                  onClick={() => onEdit(item.batchId)}
                >
                  编辑
                </Button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <CopilotChatInput
        {...props}
        key={`${draftEpoch}-${draftRevision}`}
        isRunning={stoppable && !hasDraft}
        onStop={onStop}
        textArea={{ 'aria-label': '询问小团宝业务' }}
        sendButton={(buttonProps) => (
          <ComposerSendButton
            {...buttonProps}
            isRunning={stoppable}
            canStop={Boolean(onStop)}
            draftValue={draftValue}
          />
        )}
      />
    </div>
  )
}

const QueueAwareChatInput = Object.assign(QueueAwareChatInputView, CopilotChatInput)

function createBatchStatusActivityRenderer(): ReactActivityMessageRenderer<BatchStatusActivityContent> {
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
      <div className={chatStyles.noticeBlock}>
        <p className={chatStyles.notice} role="status">
          {content.label}
        </p>
      </div>
    ),
  }
}

function taskActivityPresentation(status: string): {
  color?: 'processing' | 'warning' | 'success' | 'error'
  label: string
  description: string
} {
  if (status === 'awaiting_review') {
    return { color: 'warning', label: '待审核', description: '候选内容已准备好，等待你审核。' }
  }
  if (status === 'awaiting_user_input') {
    return { color: 'warning', label: '待补充', description: 'Agent 正在等待你补充信息。' }
  }
  if (status === 'completed') {
    return { color: 'success', label: '本轮完成', description: '本轮任务处理已经完成。' }
  }
  if (status === 'failed') {
    return { color: 'error', label: '处理失败', description: '本轮处理失败，可在会话中继续处理。' }
  }
  if (status === 'cancelled') {
    return { label: '已停止', description: '本轮处理已经停止。' }
  }
  return { color: 'processing', label: '进行中', description: 'Agent 正在推进这个任务。' }
}

function createAgentTaskActivityRenderer(
  openTask: (taskId: string, taskType?: string) => void,
): ReactActivityMessageRenderer<AgentTaskActivityContent> {
  return {
    activityType: AGENT_TASK_ACTIVITY_TYPE,
    content: {
      '~standard': {
        version: 1,
        vendor: 'xiaotuanbao',
        validate(value) {
          if (
            value &&
            typeof value === 'object' &&
            typeof (value as { taskId?: unknown }).taskId === 'string' &&
            typeof (value as { title?: unknown }).title === 'string' &&
            typeof (value as { status?: unknown }).status === 'string'
          ) {
            return { value: value as AgentTaskActivityContent }
          }
          return { issues: [{ message: 'invalid agent task activity' }] }
        },
      },
    },
    render: ({ content }) => {
      const presentation = taskActivityPresentation(content.status)
      const descriptor = resolveRegisteredTaskDescriptor(content.taskType)
      const regionLabel = descriptor?.activity.regionLabel ?? 'Agent 任务'
      const actionLabel = descriptor?.activity.actionLabel ?? '查看任务'
      return (
        <section aria-label={regionLabel}>
          <Card
            className={chatStyles.activityCard}
            size="small"
            title={
              <div className={chatStyles.activityHeading}>
                <Typography.Text strong>{content.title}</Typography.Text>
                <Tag color={presentation.color}>{presentation.label}</Tag>
              </div>
            }
          >
            <Typography.Text type="secondary">{presentation.description}</Typography.Text>
            <div className={chatStyles.activityActions}>
              <Button size="small" onClick={() => openTask(content.taskId, content.taskType)}>
                {actionLabel}
              </Button>
            </div>
          </Card>
        </section>
      )
    },
  }
}

function createReviewPackageActivityRenderer(
  openTask: (taskId: string, taskType?: string) => void,
): ReactActivityMessageRenderer<ReviewPackageActivityContent> {
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
            typeof (value as { reviewPackageId?: unknown }).reviewPackageId === 'string' &&
            Array.isArray((value as { fieldKeys?: unknown }).fieldKeys)
          ) {
            return { value: value as ReviewPackageActivityContent }
          }
          return { issues: [{ message: 'invalid review package activity' }] }
        },
      },
    },
    render: ({ content }) => (
      <section aria-label="待审核内容">
        <Card
          className={chatStyles.reviewActivityCard}
          size="small"
          title={
            <div className={chatStyles.activityHeading}>
              <span className={chatStyles.activityTitle}>
                <FileTextOutlined aria-hidden="true" />
                <Typography.Text strong>待审核内容</Typography.Text>
              </span>
              <Tag color="warning">待审核</Tag>
            </div>
          }
        >
          <Typography.Paragraph className={chatStyles.activityDescription} type="secondary">
            {formatReviewFieldList(
              content.fieldKeys,
              DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
              AI_REVIEW_CONFIRMATION_UNIT,
            ) || '发团基础信息'}
          </Typography.Paragraph>
          <div className={chatStyles.activityActions}>
            {content.taskId ? (
              <Button
                type="primary"
                size="small"
                onClick={() => openTask(content.taskId!, content.taskType)}
              >
                查看审核内容
              </Button>
            ) : (
              <Typography.Text type="secondary">请在对应业务表单中审核。</Typography.Text>
            )}
          </div>
        </Card>
      </section>
    ),
  }
}

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
    <section aria-label={`追问：${content.prompt}`}>
      <Card className={chatStyles.activityCard} size="small" title={title}>
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>{content.prompt}</Typography.Text>
          {resolved ? (
            <Typography.Text type="secondary">
              {content.status === 'answered'
                ? '已根据你的回答继续处理。'
                : '已取消本次等待。'}
            </Typography.Text>
          ) : content.type === 'single_choice' ? (
            <Radio.Group
              orientation="vertical"
              value={selectedOptionId}
              onChange={(event) => setSelectedOptionId(event.target.value)}
              options={content.options.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
            />
          ) : (
            <Input.TextArea
              aria-label={`回答追问：${content.prompt}`}
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
                      : text.trim(),
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
        </Space>
      </Card>
    </section>
  )
}

function createInteractionActivityRenderer(handlers: {
  pendingInteractionId: string | null
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
        pending={handlers.pendingInteractionId === content.interactionId}
        onReply={handlers.onReply}
        onCancel={handlers.onCancel}
      />
    ),
  }
}

function getContiguousSequence(events: AiConversationEventView[]): number {
  let last = 0
  for (const event of events) {
    if (event.sequence !== last + 1) {
      break
    }
    last = event.sequence
  }
  return last
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

function useAgentConversationChatController() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useRouterState({
    select: (state) => state.location,
  })
  const conversationId = useAgentConversationStore((state) => state.conversationId)
  const conversationView = useAgentConversationStore((state) => state.view)
  const attachedPageAttachment = useAgentConversationStore(
    (state) => state.attachedPageAttachment,
  )
  const attachCurrentPage = useAgentConversationStore((state) => state.attachCurrentPage)
  const detachCurrentPage = useAgentConversationStore((state) => state.detachCurrentPage)
  const composerEpoch = useAgentConversationStore((state) => state.composerEpoch)
  const syncDefaultPageAttachment = useAgentConversationStore(
    (state) => state.syncDefaultPageAttachment,
  )
  const closeGlobalForBusinessNavigation = useAgentConversationStore(
    (state) => state.closeGlobalForBusinessNavigation,
  )
  const currentPageAttachment = useCurrentPageAttachment()
  const persistConversation = useAgentConversationStore((state) => state.persistConversation)
  const runtimeConversationId = useAgentConversationRuntimeStore((state) => state.conversationId)
  const events = useAgentConversationRuntimeStore((state) => state.events)
  const liveAssistant = useAgentConversationRuntimeStore((state) => state.liveAssistant)
  const sessionReasoning = useAgentConversationRuntimeStore((state) => state.sessionReasoning)
  const draft = useAgentConversationRuntimeStore((state) => state.draft)
  const pendingText = useAgentConversationRuntimeStore((state) => state.pendingText)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pendingUploadCount, setPendingUploadCount] = useState(0)
  const [editingQueueBatchId, setEditingQueueBatchId] = useState<string | null>(null)
  const [pendingInteractionId, setPendingInteractionId] = useState<string | null>(null)
  const commandPendingRef = useRef(false)
  const lastSequenceRef = useRef(0)
  const { applyServerDraft, updateDraft, conversationIdRef, draftEpochRef, draftRevisionRef } =
    useAgentConversationDraft(conversationId)

  useEffect(() => {
    lastSequenceRef.current = getContiguousSequence(events)
  }, [events])

  useEffect(() => {
    syncDefaultPageAttachment(currentPageAttachment)
  }, [conversationId, conversationView, currentPageAttachment, syncDefaultPageAttachment])

  useEffect(() => {
    useAgentConversationRuntimeStore.getState().resetIfConversationChanged(conversationId)
  }, [conversationId])

  const skipComposerEpochReset = useRef(true)
  useEffect(() => {
    if (skipComposerEpochReset.current) {
      skipComposerEpochReset.current = false
      return
    }
    useAgentConversationRuntimeStore.getState().clear()
  }, [composerEpoch])

  useEffect(() => {
    let cancelled = false
    const currentRuntime = useAgentConversationRuntimeStore.getState()
    const alreadyHydrated =
      runtimeConversationId === conversationId &&
      (currentRuntime.events.length > 0 || currentRuntime.sending || currentRuntime.pendingText)
    if (!conversationId) {
      setLoading(false)
      setErrorText(null)
      return
    }
    if (alreadyHydrated) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErrorText(null)
    void getAgentConversation(conversationId, { silentError: true })
      .then((conversation: AiConversationView) => {
        if (cancelled) {
          return
        }
        const live = useAgentConversationRuntimeStore.getState()
        useAgentConversationRuntimeStore.getState().hydrate({
          conversationId,
          events: mergeEvents(live.events, conversation.events),
          draft: live.draft !== '' ? live.draft : (conversation.draft?.text ?? ''),
          draftEpoch: conversation.draft?.draftEpoch ?? live.draftEpoch,
          revision: conversation.draft?.revision ?? live.revision,
        })
        if (conversation.title) {
          persistConversation({ id: conversation.id, title: conversation.title })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorText(ASSIST_ERROR_TEXT)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, persistConversation, runtimeConversationId])

  useEffect(() => {
    if (!conversationId) {
      return
    }
    const abort = new AbortController()
    let cancelled = false
    let errorDebounce: ReturnType<typeof setTimeout> | undefined
    const catchUp = () =>
      listAgentConversationEvents(conversationId, lastSequenceRef.current, {
        signal: abort.signal,
        silentError: true,
      })
        .then((page) => {
          if (abort.signal.aborted || cancelled) {
            return
          }
          if (page.events.length > 0) {
            useAgentConversationRuntimeStore.getState().hydrate({
              conversationId,
              events: mergeEvents(
                useAgentConversationRuntimeStore.getState().events,
                page.events,
              ),
            })
          }
          if (page.draft) {
            applyServerDraft(page.draft)
          }
        })
        .catch(() => undefined)

    const source = new EventSource(
      `${env.apiBaseUrl}/agent/conversations/${conversationId}/stream?afterSequence=${lastSequenceRef.current}`,
      { withCredentials: true },
    )
    source.onmessage = (message) => {
      try {
        const frame = parseConversationStreamFrame(JSON.parse(message.data) as unknown)
        if (!frame) {
          return
        }
        if (frame.type === 'assistant.snapshot') {
          useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
            attemptId: frame.attemptId,
            batchId: frame.batchId,
            generation: frame.generation,
            revision: frame.revision,
            reasoningText: frame.reasoningText,
            text: frame.text,
          })
          return
        }
        if (frame.type !== 'conversation.event') {
          return
        }
        const parsed = frame.event
        if (typeof parsed.sequence !== 'number' || typeof parsed.kind !== 'string') {
          return
        }
        useAgentConversationRuntimeStore.getState().hydrate({
          conversationId,
          events: mergeEvents(useAgentConversationRuntimeStore.getState().events, [parsed]),
        })
      } catch {
        // ignore malformed frames
      }
    }
    source.onerror = () => {
      if (cancelled || errorDebounce) {
        return
      }
      errorDebounce = setTimeout(() => {
        errorDebounce = undefined
        void catchUp()
      }, CONVERSATION_ERROR_CATCH_UP_DEBOUNCE_MS)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void catchUp()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    const idleCatchUp = window.setInterval(() => {
      if (source.readyState === EventSource.CLOSED) {
        void catchUp()
      }
    }, CONVERSATION_IDLE_CATCH_UP_MS)
    void catchUp()
    return () => {
      cancelled = true
      abort.abort()
      source.close()
      window.clearInterval(idleCatchUp)
      if (errorDebounce) {
        clearTimeout(errorDebounce)
      }
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [applyServerDraft, conversationId])

  const send = useCallback(
    async (text: string, files: File[] = [], restoreFiles?: () => Promise<void>) => {
      const current = useAgentConversationRuntimeStore.getState()
      const nextText = (text || current.pendingText || current.draft).trim()
      if (current.sending || (!nextText && files.length === 0)) {
        return
      }
      setErrorText(null)
      const outboundText = nextText || DEFAULT_TASKLESS_ATTACHMENT_TEXT
      const sendIdempotencyKey = current.sendIdempotencyKey ?? crypto.randomUUID()
      setPendingUploadCount(files.length)
      useAgentConversationRuntimeStore.getState().hydrate({
        conversationId: conversationIdRef.current,
        pendingText: outboundText,
        draft: '',
        sending: true,
        sendIdempotencyKey,
      })
      try {
        const attachment = useAgentConversationStore.getState().attachedPageAttachment
        const result = await sendAgentConversationText(
          conversationIdRef.current,
          {
            text: outboundText,
            ...(files.length > 0 ? { files } : {}),
            ...conversationSendContextFromAttachment(attachment),
          },
          sendIdempotencyKey,
        )
        useAgentConversationRuntimeStore.getState().hydrate({
          conversationId: result.conversationId,
          events: mergeEvents(
            useAgentConversationRuntimeStore.getState().events,
            result.events,
          ),
          pendingText: null,
          draft: result.draft?.text ?? '',
          draftEpoch: result.draft?.draftEpoch ?? draftEpochRef.current + 1,
          revision: result.draft?.revision ?? draftRevisionRef.current + 1,
          sending: false,
          sendIdempotencyKey: null,
        })
        setPendingUploadCount(0)
        if (!conversationIdRef.current) {
          persistConversation({
            id: result.conversationId,
            title: outboundText.slice(0, 40),
          })
        }
      } catch (error) {
        setErrorText(getAssistErrorText(error))
        updateDraft(nextText)
        setPendingUploadCount(0)
        useAgentConversationRuntimeStore.getState().hydrate({
          conversationId: conversationIdRef.current,
          pendingText: null,
          sending: false,
          sendIdempotencyKey: null,
        })
        await restoreFiles?.()
      }
    },
    [
      conversationIdRef,
      draftEpochRef,
      draftRevisionRef,
      persistConversation,
      updateDraft,
    ],
  )

  const stop = useCallback(async () => {
    const currentConversationId = conversationIdRef.current
    const currentRuntime = useAgentConversationRuntimeStore.getState()
    const batchId = currentStoppableBatchId(
      projectQueuedConversationMessages(currentRuntime.events, currentRuntime.liveAssistant)
        .visibleEvents,
    )
    if (!currentConversationId || !batchId || commandPendingRef.current) {
      return
    }
    setErrorText(null)
    commandPendingRef.current = true
    try {
      const result = await stopAgentConversationBatch(
        currentConversationId,
        batchId,
        crypto.randomUUID(),
      )
      useAgentConversationRuntimeStore.getState().hydrate({
        conversationId: currentConversationId,
        events: mergeEvents(useAgentConversationRuntimeStore.getState().events, result.events),
      })
    } catch (error) {
      setErrorText(getAssistErrorText(error))
    } finally {
      commandPendingRef.current = false
    }
  }, [conversationIdRef])

  const editQueuedMessage = useCallback(
    async (batchId: string) => {
      const currentConversationId = conversationIdRef.current
      if (!currentConversationId || editingQueueBatchId) {
        return
      }
      if (draft.trim()) {
        setErrorText('输入框已有内容，请先处理后再编辑排队消息')
        return
      }
      setErrorText(null)
      setEditingQueueBatchId(batchId)
      try {
        const result = await retractQueuedAgentConversationBatch(
          currentConversationId,
          batchId,
          crypto.randomUUID(),
        )
        useAgentConversationRuntimeStore.getState().hydrate({
          conversationId: currentConversationId,
          events: mergeEvents(useAgentConversationRuntimeStore.getState().events, result.events),
        })
        if (result.draft) {
          applyServerDraft(result.draft)
        }
      } catch (error) {
        setErrorText(getAssistErrorText(error))
      } finally {
        setEditingQueueBatchId(null)
      }
    },
    [applyServerDraft, conversationIdRef, draft, editingQueueBatchId],
  )

  const runInteractionCommand = useCallback(
    async (
      interactionId: string,
      command: (conversationId: string) => ReturnType<typeof sendAgentConversationText>,
    ) => {
      const currentConversationId = conversationIdRef.current
      if (!currentConversationId || pendingInteractionId) {
        return
      }
      setErrorText(null)
      setPendingInteractionId(interactionId)
      try {
        const result = await command(currentConversationId)
        useAgentConversationRuntimeStore.getState().hydrate({
          conversationId: currentConversationId,
          events: mergeEvents(useAgentConversationRuntimeStore.getState().events, result.events),
        })
      } catch (error) {
        setErrorText(getAssistErrorText(error))
      } finally {
        setPendingInteractionId(null)
      }
    },
    [conversationIdRef, pendingInteractionId],
  )

  const replyToInteraction = useCallback(
    (content: InteractionActivityContent, text: string, selectedOptionId?: string) => {
      void runInteractionCommand(content.interactionId, (currentConversationId) =>
        sendAgentConversationText(
          currentConversationId,
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
    [runInteractionCommand],
  )

  const cancelInteraction = useCallback(
    (content: InteractionActivityContent) => {
      void runInteractionCommand(content.interactionId, (currentConversationId) =>
        cancelAgentConversationInteraction(
          currentConversationId,
          content.interactionId,
          content.version,
          crypto.randomUUID(),
        ),
      )
    },
    [runInteractionCommand],
  )

  const queueProjection = useMemo(
    () => projectQueuedConversationMessages(events, liveAssistant),
    [events, liveAssistant],
  )
  const visibleEvents = queueProjection.visibleEvents
  const messages = useMemo(
    () =>
      projectConversationFrame({
        events: visibleEvents,
        pendingText,
        liveAssistant,
        sessionReasoning,
        pendingUploadCount,
      }),
    [liveAssistant, pendingText, pendingUploadCount, sessionReasoning, visibleEvents],
  )
  const isRunning = isCopilotChatRunning(visibleEvents, null, pendingText, liveAssistant)
  const stoppableBatchId = currentStoppableBatchId(visibleEvents)
  const messageView = useMemo(
    () => ({ reasoningMessage: { header: AgentReasoningHeader } }),
    [],
  )
  const openAgentTask = useCallback(
    (taskId: string, taskType?: string) => {
      if (!resolveRegisteredTaskDescriptor(taskType)) {
        return
      }
      closeGlobalForBusinessNavigation()
      const alreadyOnTask = isCurrentAgentTaskWorkspace(
        location.pathname,
        location.searchStr,
        taskId,
        taskType,
      )
      void queryClient.invalidateQueries({ queryKey: ['ai-create-task', taskId] })
      void queryClient.invalidateQueries({ queryKey: ['ai-create-assist-state', taskId] })
      if (alreadyOnTask) {
        return
      }
      void navigate(agentTaskWorkspaceNavigation(taskId, taskType))
    },
    [closeGlobalForBusinessNavigation, location.pathname, location.searchStr, navigate, queryClient],
  )
  const activityRenderers = useMemo(
    () => [
      createBatchStatusActivityRenderer(),
      createInteractionActivityRenderer({
        pendingInteractionId,
        onReply: replyToInteraction,
        onCancel: cancelInteraction,
      }),
      createAgentTaskActivityRenderer(openAgentTask),
      createReviewPackageActivityRenderer(openAgentTask),
    ],
    [cancelInteraction, openAgentTask, pendingInteractionId, replyToInteraction],
  )

  return {
    activityRenderers,
    attachCurrentPage,
    attachedPageAttachment,
    conversationId,
    currentPageAttachment,
    detachCurrentPage,
    draft,
    errorText,
    isRunning,
    loading,
    messages,
    messageView,
    pendingText,
    queuedMessages: queueProjection.messages,
    editingQueueBatchId,
    editQueuedMessage,
    send,
    stop,
    stoppableBatchId,
    updateDraft,
    composerEpoch,
  }
}

function AgentConversationComposer({
  draft,
  isRunning,
  messages,
  messageView,
  pendingText,
  queuedMessagesContextValue,
  send,
  stop,
  updateDraft,
}: {
  draft: string
  isRunning: boolean
  messages: ReturnType<typeof projectConversationFrame>
  messageView: { reasoningMessage: { header: typeof AgentReasoningHeader } }
  pendingText: string | null
  queuedMessagesContextValue: QueuedMessagesContextValue
  send: (text: string, files?: File[], restoreFiles?: () => Promise<void>) => Promise<void>
  stop?: () => void
  updateDraft: (value: string) => void
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
      className={chatStyles.chat}
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
      <QueuedMessagesContext.Provider value={queuedMessagesContextValue}>
        <CopilotChatView
          className={chatStyles.chat}
          messages={messages}
          isRunning={isRunning}
          messageView={messageView}
          input={QueueAwareChatInput}
          inputValue={pendingText ? '' : draft}
          onInputChange={updateDraft}
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
          onSubmitMessage={(value) => {
            const files = filesFromAttachmentSources(consumeAttachments())
            void send(value, files, () => processFiles(files))
          }}
          onStop={stop}
        />
      </QueuedMessagesContext.Provider>
    </div>
  )
}

export function AgentConversationChat() {
  const {
    activityRenderers,
    attachCurrentPage,
    attachedPageAttachment,
    conversationId,
    currentPageAttachment,
    detachCurrentPage,
    draft,
    errorText,
    isRunning,
    loading,
    messages,
    messageView,
    pendingText,
    queuedMessages,
    editingQueueBatchId,
    editQueuedMessage,
    send,
    stop,
    stoppableBatchId,
    updateDraft,
    composerEpoch,
  } = useAgentConversationChatController()
  const queuedMessagesContextValue = useMemo(
    () => ({
      editingBatchId: editingQueueBatchId,
      messages: queuedMessages,
      onEdit: editQueuedMessage,
      stoppable: stoppableBatchId != null,
      onStop: stoppableBatchId
        ? () => {
            void stop()
          }
        : undefined,
    }),
    [editQueuedMessage, editingQueueBatchId, queuedMessages, stop, stoppableBatchId],
  )

  return (
    <div className={chatStyles.root}>
      {errorText ? <Alert type="error" showIcon title={errorText} /> : null}
      {attachedPageAttachment ? (
        <div className={chatStyles.pageContext}>
          <Tag
            className={chatStyles.pageContextChip}
            data-testid="current-page-chip"
            closable={{ 'aria-label': '移除当前页面' }}
            onClose={detachCurrentPage}
          >
            {currentPageAttachmentLabel(attachedPageAttachment)}
          </Tag>
        </div>
      ) : currentPageAttachment ? (
        <div className={chatStyles.pageContext}>
          <Button
            type="link"
            size="small"
            aria-label="获取当前页面"
            onClick={() => attachCurrentPage(currentPageAttachment)}
          >
            获取当前页面
          </Button>
        </div>
      ) : null}
      {loading ? (
        <Typography.Text type="secondary">正在加载会话</Typography.Text>
      ) : (
        <CopilotKit
          runtimeUrl="/copilotkit"
          useSingleEndpoint={false}
          enableInspector={false}
          renderActivityMessages={activityRenderers}
        >
          <CopilotChatConfigurationProvider
            agentId={COPILOTKIT_RUNTIME_AGENT_ID}
            threadId={conversationId ?? 'new'}
            labels={{ chatInputPlaceholder: '询问小团宝业务…' }}
          >
            <AgentConversationComposer
              key={composerEpoch}
              draft={draft}
              isRunning={isRunning}
              messages={messages}
              messageView={messageView}
              pendingText={pendingText}
              queuedMessagesContextValue={queuedMessagesContextValue}
              send={send}
              stop={stoppableBatchId ? stop : undefined}
              updateDraft={updateDraft}
            />
          </CopilotChatConfigurationProvider>
        </CopilotKit>
      )}
    </div>
  )
}
