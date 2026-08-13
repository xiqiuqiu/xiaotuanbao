const MAX_STORED_REASONING = 200

const reasoningByToolCallId = new Map<string, string>()

export function clearStoredToolCallReasoning(): void {
  reasoningByToolCallId.clear()
}

export function rememberToolCallReasoning(toolCallId: string, text: string): void {
  const reasoning = text.trim()
  if (!toolCallId || reasoning.length === 0) {
    return
  }
  if (reasoningByToolCallId.has(toolCallId)) {
    reasoningByToolCallId.delete(toolCallId)
  }
  reasoningByToolCallId.set(toolCallId, reasoning)
  if (reasoningByToolCallId.size > MAX_STORED_REASONING) {
    const oldest = reasoningByToolCallId.keys().next().value
    if (oldest) {
      reasoningByToolCallId.delete(oldest)
    }
  }
}

export function restoreReasoningParts<T>(input: T): T {
  if (!Array.isArray(input)) {
    return input
  }

  return input.map((message) => restoreAssistantReasoning(message)) as T
}

function restoreAssistantReasoning(message: unknown): unknown {
  if (!message || typeof message !== 'object') {
    return message
  }
  const candidate = message as {
    role?: unknown
    content?: unknown
  }
  if (candidate.role !== 'assistant' || !Array.isArray(candidate.content)) {
    return message
  }
  if (candidate.content.some(isReasoningPart)) {
    return message
  }

  const toolCallIds = candidate.content
    .map(readToolCallId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const reasoning = toolCallIds
    .map((id) => reasoningByToolCallId.get(id))
    .find((text): text is string => typeof text === 'string' && text.length > 0)
  if (!reasoning) {
    return message
  }

  return {
    ...candidate,
    content: [{ type: 'reasoning', text: reasoning }, ...candidate.content],
  }
}

function isReasoningPart(part: unknown): boolean {
  return Boolean(part && typeof part === 'object' && (part as { type?: unknown }).type === 'reasoning')
}

function readToolCallId(part: unknown): string | undefined {
  if (!part || typeof part !== 'object') {
    return undefined
  }
  const candidate = part as { type?: unknown; toolCallId?: unknown }
  if (candidate.type !== 'tool-call' || typeof candidate.toolCallId !== 'string') {
    return undefined
  }
  return candidate.toolCallId
}

export async function* recordReasoningFromStream<T>(stream: AsyncIterable<T>): AsyncIterable<T> {
  let stepReasoning = ''
  const stepToolCallIds: string[] = []

  for await (const chunk of stream) {
    const type = readChunkType(chunk)
    if (type === 'reasoning-delta') {
      stepReasoning += readChunkText(chunk)
    } else if (type === 'tool-call') {
      const toolCallId = readChunkToolCallId(chunk)
      if (toolCallId) {
        stepToolCallIds.push(toolCallId)
      }
    } else if (type === 'step-finish' || type === 'finish') {
      for (const toolCallId of stepToolCallIds) {
        rememberToolCallReasoning(toolCallId, stepReasoning)
      }
      stepReasoning = ''
      stepToolCallIds.length = 0
    }
    yield chunk
  }

  for (const toolCallId of stepToolCallIds) {
    rememberToolCallReasoning(toolCallId, stepReasoning)
  }
}

export function tapStreamResultForReasoning<T>(result: T): T {
  if (isPromiseLike(result)) {
    return result.then(tapOutputForReasoning) as T
  }
  return tapOutputForReasoning(result)
}

function tapOutputForReasoning<T>(output: T): T {
  if (!output || typeof output !== 'object') {
    return output
  }
  const record = output as { fullStream?: AsyncIterable<unknown> }
  const original = record.fullStream
  if (!original || typeof original[Symbol.asyncIterator] !== 'function') {
    return output
  }

  return new Proxy(output as object, {
    get(target, prop, receiver) {
      if (prop === 'fullStream') {
        return recordReasoningFromStream(original)
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as T
}

type AgentMethod = (input: unknown, options?: unknown) => unknown

export function wrapAgentStreamToRestoreToolReasoning<T extends object>(agent: T): T {
  const target = agent as T & { stream: AgentMethod; resumeStream?: AgentMethod }
  const originalStream = target.stream.bind(target)
  target.stream = (input, options) =>
    tapStreamResultForReasoning(originalStream(restoreReasoningParts(input), options))

  if (typeof target.resumeStream === 'function') {
    const originalResume = target.resumeStream.bind(target)
    target.resumeStream = (input, options) => tapStreamResultForReasoning(originalResume(input, options))
  }

  return agent
}

function readChunkType(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== 'object') {
    return undefined
  }
  const type = (chunk as { type?: unknown }).type
  return typeof type === 'string' ? type : undefined
}

function readChunkText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') {
    return ''
  }
  const payload = (chunk as { payload?: { text?: unknown } }).payload
  return typeof payload?.text === 'string' ? payload.text : ''
}

function readChunkToolCallId(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== 'object') {
    return undefined
  }
  const payload = (chunk as { payload?: { toolCallId?: unknown } }).payload
  return typeof payload?.toolCallId === 'string' ? payload.toolCallId : undefined
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof value === 'object' && typeof (value as PromiseLike<unknown>).then === 'function')
}
