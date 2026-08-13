import {
  assistStreamEventSchema,
  type AssistStreamEvent,
} from '@xiaotuanbao/ai-contracts'

/** Agent SSE 不是 NestJSON API：统一 request/axios 读不到 ReadableStream，故用 fetch。 */
export async function streamAiCreateAssistTurn(options: {
  agentRuntimeUrl: string
  delegationToken: string
  taskId: string
  runId: string
  onEvent: (event: AssistStreamEvent) => void
}): Promise<void> {
  const response = await fetch(options.agentRuntimeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.delegationToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskId: options.taskId, runId: options.runId }),
  })

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { data?: unknown } | null
    options.onEvent({
      type: 'run.failed',
      runStatus: 'failed',
      error: {
        code: 'AGENT_UNAVAILABLE',
        message: 'AI 辅助暂时不可用，请稍后重试或继续使用表单',
        retryable: true,
        ...(payload?.data && typeof payload.data === 'object' ? payload.data : {}),
      },
    })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const dataLine = chunk
        .split('\n')
        .find((line) => line.startsWith('data: '))
      if (!dataLine) continue
      const parsed = assistStreamEventSchema.safeParse(JSON.parse(dataLine.slice(6)))
      if (parsed.success) {
        options.onEvent(parsed.data)
      }
    }
  }
}
