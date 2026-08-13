import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CopilotChat,
  CopilotKit,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useRenderTool,
} from '@copilotkit/react-core/v2'
import '@copilotkit/react-core/v2/styles.css'
import {
  aiCreateSharedLightStateSchema,
  submitReviewPackageModelInputSchema,
  type AiCreateSharedLightState,
} from '@xiaotuanbao/ai-contracts'
import { AI_CREATE_FIRST_TURN } from './ai-create-first-turn'
import { ASSIST_ERROR_TEXT } from './assist-error-text'
import { formatReviewFieldList } from './review-field-labels'
import styles from './AiCreateAssistChat.module.css'

const AGENT_ID = 'ai-create-readonly-assist'
const sentFirstTurns = new Set<string>()

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
        if (status === 'complete' && result && notifiedRef.current !== String(result)) {
          notifiedRef.current = String(result)
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

function FirstTurnSender({ agentId, runId }: { agentId: string; runId: string }) {
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
  }, [agent, copilotkit, isReady, runId])

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
      >
        <AssistLightState
          taskId={taskId}
          snapshotVersion={snapshotVersion}
          stageKey={stageKey}
          runStatus={runStatus}
          reviewPackageId={reviewPackageId}
          progress={progress}
        />
        <ReviewPackageNotice agentId={AGENT_ID} onSubmitted={onReviewPackageSubmitted} />
        <FirstTurnSender agentId={AGENT_ID} runId={runId} />
        <CopilotChat
          agentId={AGENT_ID}
          className={styles.chat}
          labels={{ chatInputPlaceholder: '询问当前发团草稿…' }}
          onError={handleError}
        />
      </CopilotKit>
    </div>
  )
}
