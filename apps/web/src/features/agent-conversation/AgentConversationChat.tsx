import {
  CopilotChatConfigurationProvider,
  CopilotChatView,
  CopilotKit,
} from '@copilotkit/react-core/v2'
import { Alert, Button, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiConversationEventView, AiConversationView } from '@xiaotuanbao/shared'
import '@copilotkit/react-core/v2/styles.css'
import {
  getAgentConversation,
  listAgentConversationEvents,
  sendAgentConversationText,
} from '@/services/agent-conversation.service'
import {
  isCopilotChatRunning,
  toCopilotChatMessages,
} from '@/features/ai-assist/ai-create-copilot-messages'
import { conversationCatchUpIntervalMs } from '@/features/ai-assist/ai-create-assist-polling'
import {
  ASSIST_ERROR_TEXT,
  getAssistErrorText,
} from '@/features/ai-assist/assist-error-text'
import chatStyles from '@/features/ai-assist/AiCreateAssistChat.module.css'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'
import { useAgentConversationStore } from './agent-conversation.store'
import { useAgentConversationDraft } from './use-agent-conversation-draft'
import { currentPageAttachmentLabel } from './page-locator-attachment'
import { useCurrentPageAttachment } from './use-current-page-locator'

const AGENT_ID = 'conversation-general'

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

export function AgentConversationChat() {
  const conversationId = useAgentConversationStore((state) => state.conversationId)
  const conversationView = useAgentConversationStore((state) => state.view)
  const attachedPageAttachment = useAgentConversationStore(
    (state) => state.attachedPageAttachment,
  )
  const attachCurrentPage = useAgentConversationStore((state) => state.attachCurrentPage)
  const detachCurrentPage = useAgentConversationStore((state) => state.detachCurrentPage)
  const restoreCurrentPageAfterSend = useAgentConversationStore(
    (state) => state.restoreCurrentPageAfterSend,
  )
  const syncDefaultPageAttachment = useAgentConversationStore(
    (state) => state.syncDefaultPageAttachment,
  )
  const currentPageAttachment = useCurrentPageAttachment()
  const persistConversation = useAgentConversationStore((state) => state.persistConversation)
  const runtimeConversationId = useAgentConversationRuntimeStore((state) => state.conversationId)
  const events = useAgentConversationRuntimeStore((state) => state.events)
  const draft = useAgentConversationRuntimeStore((state) => state.draft)
  const pendingText = useAgentConversationRuntimeStore((state) => state.pendingText)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
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

    const interval = window.setInterval(() => {
      void catchUp()
    }, conversationCatchUpIntervalMs(null))
    void catchUp()
    return () => {
      cancelled = true
      abort.abort()
      window.clearInterval(interval)
    }
  }, [applyServerDraft, conversationId])

  const send = useCallback(
    async (text: string) => {
      const current = useAgentConversationRuntimeStore.getState()
      const nextText = (text || current.pendingText || current.draft).trim()
      if (current.sending || !nextText) {
        return
      }
      setErrorText(null)
      const sendIdempotencyKey = current.sendIdempotencyKey ?? crypto.randomUUID()
      useAgentConversationRuntimeStore.getState().hydrate({
        conversationId: conversationIdRef.current,
        pendingText: nextText,
        draft: '',
        sending: true,
        sendIdempotencyKey,
      })
      try {
        const attachment = useAgentConversationStore.getState().attachedPageAttachment
        const result = await sendAgentConversationText(
          conversationIdRef.current,
          {
            text: nextText,
            ...(attachment?.kind === 'page_locator'
              ? { pageLocator: attachment.locator }
              : attachment?.kind === 'departure_creation_task'
                ? { primaryTaskId: attachment.taskId }
                : {}),
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
        restoreCurrentPageAfterSend(currentPageAttachment)
        if (!conversationIdRef.current) {
          persistConversation({
            id: result.conversationId,
            title: nextText.slice(0, 40),
          })
        }
      } catch (error) {
        setErrorText(getAssistErrorText(error))
        updateDraft(nextText)
        useAgentConversationRuntimeStore.getState().hydrate({
          conversationId: conversationIdRef.current,
          pendingText: null,
          sending: false,
          sendIdempotencyKey: null,
        })
      }
    },
    [
      conversationIdRef,
      currentPageAttachment,
      draftEpochRef,
      draftRevisionRef,
      persistConversation,
      restoreCurrentPageAfterSend,
      updateDraft,
    ],
  )

  const messages = useMemo(
    () => toCopilotChatMessages(events, pendingText, null, 0),
    [events, pendingText],
  )
  const isRunning = isCopilotChatRunning(events, null, pendingText)

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
        <CopilotKit runtimeUrl="/copilotkit" useSingleEndpoint={false} enableInspector={false}>
          <CopilotChatConfigurationProvider
            agentId={AGENT_ID}
            threadId={conversationId ?? 'new'}
            labels={{ chatInputPlaceholder: '询问小团宝业务…' }}
          >
            <div className={chatStyles.chat}>
              <CopilotChatView
                className={chatStyles.chat}
                messages={messages}
                isRunning={isRunning}
                inputValue={pendingText ? '' : draft}
                onInputChange={updateDraft}
                onSubmitMessage={(value) => {
                  void send(value)
                }}
                input={{
                  textArea: { 'aria-label': '询问小团宝业务' },
                }}
              />
            </div>
          </CopilotChatConfigurationProvider>
        </CopilotKit>
      )}
    </div>
  )
}
