import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement, StrictMode, type ComponentType, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiCreateSharedLightStateSchema } from '@xiaotuanbao/ai-contracts'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { uploadDepartureMaterial } from '@/services/ai-create-task.service'
import { AI_CREATE_CONSUME_MATERIALS_TURN, AI_CREATE_FIRST_TURN } from './ai-create-first-turn'
import { AiCreateAssistChat } from './AiCreateAssistChat'

const { addMessage, runAgent, useAgentContext, agentMessages, agentState } = vi.hoisted(() => {
  const addMessage = vi.fn()
  const agentMessages: unknown[] = []
  return {
    addMessage,
    runAgent: vi.fn(),
    useAgentContext: vi.fn(),
    agentMessages,
    agentState: { addMessage, messages: agentMessages, isRunning: false },
  }
})

let capturedKit: {
  runtimeUrl?: string
  headers?: Record<string, string>
  properties?: Record<string, unknown>
  useSingleEndpoint?: boolean
  onError?: (event: { error: Error }) => void
} = {}
let capturedChat: {
  agentId?: string
  threadId?: string
  onError?: (event: { error: Error }) => void
  attachments?: {
    enabled?: boolean
    accept?: string
    maxSize?: number
    onUpload?: (file: File) => Promise<unknown>
  }
} = {}
let capturedRenderTool: {
  name?: string
  render?: (props: {
    status: string
    parameters?: { candidates?: Array<{ fieldKey: string }> }
    result?: unknown
  }) => ReactNode
} = {}
let capturedSearchRenderTool: {
  name?: string
  render?: (props: {
    status: string
    result?: unknown
  }) => ReactNode
} = {}
let capturedHumanInTheLoop: {
  name?: string
  render?: ComponentType<{
    name: string
    description: string
    toolCallId: string
    args: { reviewPackageId: string }
    status: 'executing'
    result: undefined
    respond: (result: unknown) => Promise<void>
  }>
} = {}

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: ({
    children,
    runtimeUrl,
    headers,
    properties,
    useSingleEndpoint,
    onError,
  }: {
    children: ReactNode
    runtimeUrl?: string
    headers?: Record<string, string>
    properties?: Record<string, unknown>
    useSingleEndpoint?: boolean
    onError?: (event: { error: Error }) => void
  }) => {
    capturedKit = { runtimeUrl, headers, properties, useSingleEndpoint, onError }
    return <div data-testid="copilot-kit">{children}</div>
  },
  CopilotChatConfigurationProvider: ({ children }: { children: ReactNode }) => children,
  CopilotChat: ({
    agentId,
    threadId,
    onError,
    attachments,
  }: {
    agentId?: string
    threadId?: string
    onError?: (event: { error: Error }) => void
    attachments?: {
      enabled?: boolean
      accept?: string
      maxSize?: number
      onUpload?: (file: File) => Promise<unknown>
    }
  }) => {
    capturedChat = { agentId, threadId, onError, attachments }
    return (
      <div data-testid="copilot-chat" data-agent-id={agentId}>
        <button type="button" onClick={() => onError?.({ error: new Error('runtime down') })}>
          触发协助错误
        </button>
      </div>
    )
  },
  useAgentContext: (...args: unknown[]) => useAgentContext(...args),
  useAgent: () => ({ agent: agentState, isReady: true }),
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
  useRenderTool: (config: { name?: string; render?: (props: never) => ReactNode }) => {
    if (config.name === 'searchRouteTemplates') {
      capturedSearchRenderTool = config
      return
    }
    capturedRenderTool = config
  },
  useHumanInTheLoop: (config: typeof capturedHumanInTheLoop) => {
    capturedHumanInTheLoop = config
  },
}))

vi.mock('@copilotkit/react-core/v2/styles.css', () => ({}))

vi.mock('@/services/ai-create-task.service', () => ({
  uploadDepartureMaterial: vi.fn(),
}))

const chatProps = {
  agentRuntimeUrl: '/copilotkit',
  delegationToken: 'deleg-1',
  taskId: 'task-assist',
  runId: 'run-1',
  snapshotVersion: 1,
  stageKey: 'basic_info' as const,
  runStatus: 'idle' as const,
}

const pendingReview: AiReviewPackageView = {
  id: 'pkg-1',
  status: 'pending',
  confirmationUnit: 'basic_info_draft',
  baseObjectVersion: 1,
  runId: 'run-1',
  candidates: [
    {
      fieldKey: 'name',
      proposedValue: '八月川西团',
      userCorrectedValue: null,
      clarity: 'clear',
      status: 'pending',
      evidence: [{ kind: 'user_message', excerpt: '八月川西团' }],
    },
  ],
}

describe('AiCreateAssistChat', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    capturedKit = {}
    capturedChat = {}
    capturedRenderTool = {}
    capturedSearchRenderTool = {}
    capturedHumanInTheLoop = {}
    agentMessages.length = 0
    agentState.isRunning = false
  })

  it('passes runtimeUrl, identity headers and the readonly agent id', () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-headers" />)


    expect(capturedKit.headers).toMatchObject({
      Authorization: 'Bearer deleg-1',
      'X-Ai-Task-Id': 'task-assist',
      'X-Ai-Run-Id': 'run-headers',
    })
    expect(capturedKit.runtimeUrl).toBe('/copilotkit')
    expect(capturedKit.useSingleEndpoint).toBe(false)
    expect(capturedChat.agentId).toBe('ai-create-readonly-assist')
    expect(capturedChat.threadId).toBe('run-headers')
    expect(screen.getByTestId('copilot-chat')).toBeInTheDocument()
  })

  it('exposes only shared light state to CopilotKit, never the draft snapshot', () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-light" reviewPackageId="pkg-1" />)

    expect(useAgentContext).toHaveBeenCalled()
    const readable = useAgentContext.mock.calls[0]?.[0] as { value?: unknown }
    const parsed = aiCreateSharedLightStateSchema.parse(readable.value)
    expect(parsed).toEqual({
      taskId: 'task-assist',
      stageKey: 'basic_info',
      runStatus: 'idle',
      reviewPackageId: 'pkg-1',
      snapshotVersion: 1,
      progress: 'collecting',
    })
    expect(parsed).not.toHaveProperty('draft')
    expect(JSON.stringify(parsed)).not.toContain('routeName')
  })

  it('renders a thin notice that confirmation belongs on the form', async () => {
    const onReviewPackageSubmitted = vi.fn()
    render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-notice"
        onReviewPackageSubmitted={onReviewPackageSubmitted}
      />,
    )

    expect(capturedRenderTool.name).toBe('submitReviewPackage')
    const inProgress = capturedRenderTool.render?.({
      status: 'inProgress',
      parameters: { candidates: [{ fieldKey: 'name' }] },
    })
    const complete = capturedRenderTool.render?.({
      status: 'complete',
      parameters: { candidates: [{ fieldKey: 'name' }, { fieldKey: 'routeName' }] },
      result: { reviewPackageId: 'pkg-1' },
    })

    render(
      <>
        {inProgress}
        {complete}
      </>,
    )
    expect(screen.getByText('正在整理审核建议…')).toBeInTheDocument()
    expect(
      screen.getByText(
        '已建议修改团名、路线。请到中间表单确认，不会自动写入发团创建草稿。',
      ),
    ).toBeInTheDocument()

    await act(async () => {
      await Promise.resolve()
    })
    expect(onReviewPackageSubmitted).toHaveBeenCalledTimes(1)
  })

  it('notifies again when a later submitReviewPackage completes with a different package', async () => {
    const onReviewPackageSubmitted = vi.fn()
    render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-notice-second"
        onReviewPackageSubmitted={onReviewPackageSubmitted}
      />,
    )

    capturedRenderTool.render?.({
      status: 'complete',
      parameters: { candidates: [{ fieldKey: 'name' }] },
      result: { reviewPackageId: 'pkg-1', status: 'pending' },
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onReviewPackageSubmitted).toHaveBeenCalledTimes(1)

    capturedRenderTool.render?.({
      status: 'complete',
      parameters: { candidates: [{ fieldKey: 'routeName' }] },
      result: { reviewPackageId: 'pkg-2', status: 'pending' },
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onReviewPackageSubmitted).toHaveBeenCalledTimes(2)

    capturedRenderTool.render?.({
      status: 'complete',
      parameters: { candidates: [{ fieldKey: 'routeName' }] },
      result: { reviewPackageId: 'pkg-2', status: 'pending' },
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onReviewPackageSubmitted).toHaveBeenCalledTimes(2)
  })

  it('shows a waiting state and responds after the form confirms', async () => {
    const respond = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-hitl"
        pendingReview={{
          ...pendingReview,
          candidates: pendingReview.candidates.map((candidate) => ({
            ...candidate,
            clarity: 'needs_confirmation' as const,
          })),
        }}
      />,
    )

    expect(capturedHumanInTheLoop.name).toBe('awaitReviewPackageDecision')
    const RenderHitl = capturedHumanInTheLoop.render!
    const hitlProps = {
      name: 'awaitReviewPackageDecision',
      description: '等待 User 审核 AI 候选',
      toolCallId: 'call-1',
      args: { reviewPackageId: 'pkg-1' },
      status: 'executing' as const,
      result: undefined,
      respond,
    }
    const card = render(createElement(RenderHitl, hitlProps))

    expect(screen.getByText('AI 建议待审核')).toBeInTheDocument()
    expect(screen.getByText('已建议修改团名')).toBeInTheDocument()
    expect(screen.getByText('其中 1 项需要重点核对')).toBeInTheDocument()
    expect(screen.getByText('等待你在发团表单中完成审核')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认写入草稿' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '拒绝建议' })).not.toBeInTheDocument()
    expect(card.container.querySelector('button')).toBeNull()
    expect(respond).not.toHaveBeenCalled()

    rerender(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-hitl"
        pendingReview={null}
        reviewDecision={{
          reviewPackageId: 'pkg-1',
          status: 'confirmed',
          snapshotVersion: 2,
        }}
      />,
    )
    const UpdatedRenderHitl = capturedHumanInTheLoop.render!
    card.rerender(createElement(UpdatedRenderHitl, hitlProps))

    await waitFor(() => {
      expect(respond).toHaveBeenCalledWith({
        reviewPackageId: 'pkg-1',
        status: 'confirmed',
        snapshotVersion: 2,
      })
    })
    expect(respond).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting without a decision and returns a rejection only after the user API succeeds', async () => {
    const respond = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-reject"
        pendingReview={pendingReview}
        reviewDecision={null}
      />,
    )
    const RenderHitl = capturedHumanInTheLoop.render!
    const hitlProps = {
      name: 'awaitReviewPackageDecision',
      description: '等待 User 审核 AI 候选',
      toolCallId: 'call-reject',
      args: { reviewPackageId: 'pkg-1' },
      status: 'executing' as const,
      result: undefined,
      respond,
    }
    const card = render(createElement(RenderHitl, hitlProps))

    expect(respond).not.toHaveBeenCalled()
    rerender(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-reject"
        pendingReview={null}
        reviewDecision={{ reviewPackageId: 'pkg-1', status: 'rejected' }}
      />,
    )
    card.rerender(createElement(capturedHumanInTheLoop.render!, hitlProps))

    await waitFor(() => {
      expect(respond).toHaveBeenCalledWith({ reviewPackageId: 'pkg-1', status: 'rejected' })
    })
    expect(screen.getByText('本次建议已放弃，草稿未修改。')).toBeInTheDocument()
  })

  it('sends the first-turn prompt once even under StrictMode', () => {
    render(
      <StrictMode>
        <AiCreateAssistChat {...chatProps} runId="run-first" />
      </StrictMode>,
    )

    const contents = addMessage.mock.calls.map((call) => {
      const message = call[0] as { content?: string } | string
      return typeof message === 'string' ? message : message.content
    })
    expect(contents).toEqual([AI_CREATE_FIRST_TURN])
    expect(AI_CREATE_FIRST_TURN).toBe(
      '请根据当前草稿说明已填写和仍缺少的信息，并只问一个下一步问题。',
    )
  })

  it('sends the first-turn prompt again after a real remount of the same runId', async () => {
    const { unmount } = render(<AiCreateAssistChat {...chatProps} runId="run-remount" />)
    expect(addMessage).toHaveBeenCalledTimes(1)

    unmount()
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })

    render(<AiCreateAssistChat {...chatProps} runId="run-remount" />)
    expect(addMessage).toHaveBeenCalledTimes(2)
    expect(addMessage.mock.calls[1]?.[0]).toMatchObject({ content: AI_CREATE_FIRST_TURN })
  })

  it('shows a visible assist failure without throwing', async () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-error" />)
    await act(async () => {
      screen.getByRole('button', { name: '触发协助错误' }).click()
    })
    expect(screen.getByText('AI 辅助暂时不可用，请稍后重试或继续使用表单')).toBeInTheDocument()
  })

  it('renders searchRouteTemplates results as read-only chat copy without adopt buttons', () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-search" />)

    expect(capturedSearchRenderTool.name).toBe('searchRouteTemplates')
    const empty = capturedSearchRenderTool.render?.({
      status: 'complete',
      result: { items: [] },
    })
    const results = capturedSearchRenderTool.render?.({
      status: 'complete',
      result: {
        items: [
          {
            id: 'tpl-1',
            name: '川西稻城线',
            defaultDayCount: 8,
            usageCount: 4,
            updatedAt: '2026-08-01T00:00:00.000Z',
            matchReasons: [{ code: 'name_contains_token', token: '川西' }],
          },
        ],
      },
    })

    render(
      <>
        {empty}
        {results}
      </>,
    )
    expect(screen.getByText(/没有匹配的常用路线/)).toBeInTheDocument()
    expect(screen.getByText(/川西稻城线 · 8 天 · 用过 4 次/)).toBeInTheDocument()
    expect(screen.getByText(/名称包含「川西」/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /采用|确认|选择/ })).not.toBeInTheDocument()
  })

  it('keeps composer attachments local until the user sends the message', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:preview')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    const { unmount } = render(<AiCreateAssistChat {...chatProps} runId="run-attach" />)

    expect(capturedChat.attachments).toMatchObject({
      enabled: true,
      accept: 'image/*,application/pdf',
      maxSize: 20 * 1024 * 1024,
    })
    const result = await capturedChat.attachments?.onUpload?.(
      new File(['png'], '行程.png', { type: 'image/png' }),
    )
    expect(uploadDepartureMaterial).not.toHaveBeenCalled()
    expect(result).toEqual({
      type: 'url',
      value: 'blob:preview',
      mimeType: 'image/png',
      metadata: { filename: '行程.png' },
    })
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    vi.unstubAllGlobals()
  })

  it('uploads attached files to the material archive after the user sends them', async () => {
    vi.mocked(uploadDepartureMaterial).mockResolvedValue({
      id: 'mat-1',
      originalFilename: '行程.png',
      contentType: 'image/png',
      status: 'queued',
      statusVersion: 1,
      createdAt: '2026-08-14T00:00:00.000Z',
      latestResultVersion: 1,
    })
    const createObjectURL = vi.fn().mockReturnValue('blob:sent')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    agentMessages.length = 0

    const { rerender, unmount } = render(
      <AiCreateAssistChat {...chatProps} runId="run-commit" />,
    )
    await capturedChat.attachments?.onUpload?.(
      new File(['png'], '行程.png', { type: 'image/png' }),
    )
    expect(uploadDepartureMaterial).not.toHaveBeenCalled()

    agentMessages.push({
      role: 'user',
      content: [
        { type: 'text', text: '帮我看看' },
        { type: 'document', source: { type: 'url', value: 'blob:sent' } },
      ],
    })
    rerender(<AiCreateAssistChat {...chatProps} runId="run-commit" />)

    await waitFor(() => {
      expect(uploadDepartureMaterial).toHaveBeenCalledWith('task-assist', expect.any(File))
    })
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:sent')
    vi.unstubAllGlobals()
  })

  it('does not dump the consume-materials instruction into the chat after a user turn', async () => {
    const { rerender } = render(<AiCreateAssistChat {...chatProps} runId="run-consume" />)
    expect(addMessage.mock.calls[0]?.[0]).toMatchObject({ content: AI_CREATE_FIRST_TURN })

    rerender(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-consume"
        materialConsumePending
        materialConsumeKey="mat-1:1"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    const contents = addMessage.mock.calls.map((call) => {
      const message = call[0] as { content?: string }
      return message.content
    })
    expect(contents).not.toContain(AI_CREATE_CONSUME_MATERIALS_TURN)
    expect(runAgent).toHaveBeenCalledTimes(2)
  })

  it('does not start a consume run while the agent thread is already running', async () => {
    agentState.isRunning = true
    const { rerender } = render(<AiCreateAssistChat {...chatProps} runId="run-busy" />)
    expect(runAgent).toHaveBeenCalledTimes(1)

    rerender(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-busy"
        materialConsumePending
        materialConsumeKey="mat-1:1"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(
      addMessage.mock.calls.map((call) => (call[0] as { content?: string }).content),
    ).not.toContain(AI_CREATE_CONSUME_MATERIALS_TURN)
  })
})
