import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamAiCreateAssistTurn } from './ai-create-assist-stream'

describe('streamAiCreateAssistTurn', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emits parsed SSE events from a successful agent stream', async () => {
    const body = [
      'data: {"type":"run.started","runStatus":"running"}\n\n',
      'data: {"type":"message.delta","text":"已填写：团名。"}\n\n',
      'data: {"type":"run.completed","runStatus":"completed"}\n\n',
    ].join('')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body))
            controller.close()
          },
        }),
      }),
    )

    const events: Array<{ type: string }> = []
    await streamAiCreateAssistTurn({
      agentRuntimeUrl: '/copilotkit',
      delegationToken: 'deleg-1',
      taskId: 'task-1',
      runId: 'run-1',
      onEvent: (event) => events.push(event),
    })

    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'message.delta',
      'run.completed',
    ])
  })

  it('emits a structured AGENT_UNAVAILABLE failure when the agent is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        body: null,
        json: async () => ({}),
      }),
    )

    const events: Array<{ type: string; error?: { code: string } }> = []
    await streamAiCreateAssistTurn({
      agentRuntimeUrl: '/copilotkit',
      delegationToken: 'deleg-1',
      taskId: 'task-1',
      runId: 'run-1',
      onEvent: (event) => events.push(event),
    })

    expect(events).toEqual([
      {
        type: 'run.failed',
        runStatus: 'failed',
        error: {
          code: 'AGENT_UNAVAILABLE',
          message: 'AI 辅助暂时不可用，请稍后重试或继续使用表单',
          retryable: true,
        },
      },
    ])
  })
})
