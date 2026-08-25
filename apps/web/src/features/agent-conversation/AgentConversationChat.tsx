import {
  CopilotChatConfigurationProvider,
  CopilotChatView,
  CopilotKit,
} from '@copilotkit/react-core/v2'
import { Alert, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiConversationEventView, AiConversationView } from '@xiaotuanbao/shared'
import {
  getAgentConversation,
  listAgentConversationEvents,
  sendAgentConversationMessage,
} from '@/services/agent-conversation.service'
import {
  isCopilotChatRunning,
  toCopilotChatMessages,
} from '@/features/ai-assist/ai-create-copilot-messages'
import { conversationCatchUpIntervalMs } from '@/features/ai-assist/ai-create-assist-polling'
import { ASSIST_ERROR_TEXT } from '@/features/ai-assist/assist-error-text'
import chatStyles from '@/features/ai-assist/AiCreateAssistChat.module.css'
import { useAgentConversationStore } from './agent-conversation.store'

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
  const selectConversation = useAgentConversationStore((state) => state.selectConversation)
  const [events, setEvents] = useState<AiConversationEventView[]>([])
  const [draft, setDraft] = useState('')
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const sendingRef = useRef(false)
  const lastSequenceRef = useRef(0)
  const idempotencyKeyRef = useRef<string | null>(null)
  const conversationIdRef = useRef(conversationId)

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  useEffect(() => {
    lastSequenceRef.current = getContiguousSequence(events)
  }, [events])

  useEffect(() => {
    let cancelled = false
    setEvents([])
    setDraft('')
    setPendingText(null)
    setErrorText(null)
    lastSequenceRef.current = 0
    if (!conversationId) {
      setLoading(false)
      return
    }
    setLoading(true)
    void getAgentConversation(conversationId, { silentError: true })
      .then((conversation: AiConversationView) => {
        if (cancelled) {
          return
        }
        setEvents(conversation.events)
        setDraft(conversation.draft?.text ?? '')
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
  }, [conversationId])

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
          if (abort.signal.aborted || cancelled || page.events.length === 0) {
            return
          }
          setEvents((current) => mergeEvents(current, page.events))
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
  }, [conversationId])

  const send = useCallback(
    async (text: string) => {
      const nextText = (text || pendingText || draft).trim()
      if (sendingRef.current || !nextText) {
        return
      }
      sendingRef.current = true
      setErrorText(null)
      setPendingText(nextText)
      setDraft('')
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID()
      }
      try {
        const result = await sendAgentConversationMessage(
          conversationIdRef.current,
          { text: nextText },
          idempotencyKeyRef.current,
        )
        setEvents((current) => mergeEvents(current, result.events))
        setPendingText(null)
        idempotencyKeyRef.current = null
        if (!conversationIdRef.current) {
          selectConversation({
            id: result.conversationId,
            title: nextText.slice(0, 40),
          })
        }
      } catch {
        setErrorText(ASSIST_ERROR_TEXT)
        setDraft(nextText)
        setPendingText(null)
      } finally {
        sendingRef.current = false
      }
    },
    [draft, pendingText, selectConversation],
  )

  const messages = useMemo(
    () => toCopilotChatMessages(events, pendingText, null, 0),
    [events, pendingText],
  )
  const isRunning = isCopilotChatRunning(events, null, pendingText)

  return (
    <div className={chatStyles.root}>
      {errorText ? <Alert type="error" showIcon message={errorText} /> : null}
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
                onInputChange={setDraft}
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
