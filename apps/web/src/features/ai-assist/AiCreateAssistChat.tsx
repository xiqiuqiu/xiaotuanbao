import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CopilotChat,
  CopilotKit,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useHumanInTheLoop,
  useRenderTool,
} from '@copilotkit/react-core/v2'
import { Button, Typography } from 'antd'
import '@copilotkit/react-core/v2/styles.css'
import {
  AWAIT_REVIEW_PACKAGE_DECISION_TOOL,
  awaitReviewPackageDecisionInputSchema,
  aiCreateSharedLightStateSchema,
  submitReviewPackageModelInputSchema,
  type AiCreateSharedLightState,
  type ReviewPackageDecision,
} from '@xiaotuanbao/ai-contracts'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
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
  pendingReview?: AiReviewPackageView | null
  reviewDecision?: ReviewPackageDecision | null
  onReviewPackageSubmitted?: () => void
  onReviewRequested?: () => void
}

function ReviewDecisionCard({
  reviewPackageId,
  pendingReview,
  reviewDecision,
  respond,
  onReviewRequested,
}: {
  reviewPackageId: string
  pendingReview?: AiReviewPackageView | null
  reviewDecision?: ReviewPackageDecision | null
  respond?: (result: unknown) => Promise<void>
  onReviewRequested?: () => void
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

  return (
    <div className={styles.reviewCard} role="status">
      <Typography.Text strong>待确认 AI 建议</Typography.Text>
      <Typography.Text type="secondary">
        {labels ? `已建议修改${labels}` : '请在中间表单审核本次建议'}
      </Typography.Text>
      {needsReviewCount > 0 ? (
        <Typography.Text type="warning">其中 {needsReviewCount} 项需要重点核对</Typography.Text>
      ) : null}
      {matchingDecision ? (
        <Typography.Text type="secondary">
          {matchingDecision.status === 'confirmed'
            ? '已确认写入，正在继续协作…'
            : '本次建议已放弃，草稿未修改。'}
        </Typography.Text>
      ) : (
        <Button type="link" size="small" className={styles.reviewLink} onClick={onReviewRequested}>
          查看审核内容
        </Button>
      )}
    </div>
  )
}

function ReviewDecisionGate({
  agentId,
  pendingReview,
  reviewDecision,
  onReviewRequested,
}: {
  agentId: string
  pendingReview?: AiReviewPackageView | null
  reviewDecision?: ReviewPackageDecision | null
  onReviewRequested?: () => void
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
          onReviewRequested={onReviewRequested}
        />
      ),
    },
    [agentId, onReviewRequested, pendingReview, reviewDecision],
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
  pendingReview,
  reviewDecision,
  onReviewPackageSubmitted,
  onReviewRequested,
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
        <ReviewDecisionGate
          agentId={AGENT_ID}
          pendingReview={pendingReview}
          reviewDecision={reviewDecision}
          onReviewRequested={onReviewRequested}
        />
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
