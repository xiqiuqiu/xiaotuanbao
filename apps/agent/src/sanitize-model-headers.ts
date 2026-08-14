const INBOUND_IDENTITY_HEADERS = new Set(['authorization', 'x-ai-task-id', 'x-ai-run-id'])

export interface AgentModelSettings {
  headers?: Record<string, string>
  [key: string]: unknown
}

export interface AgentExecutionOptionsWithModelSettings {
  modelSettings?: AgentModelSettings
  [key: string]: unknown
}

type AgentMethod = (input: unknown, options?: unknown) => unknown

export function withoutInboundAuthHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) {
    return headers
  }

  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (INBOUND_IDENTITY_HEADERS.has(key.toLowerCase())) {
      continue
    }
    next[key] = value
  }
  return next
}

export function sanitizeAgentExecutionOptions<T>(options: T): T {
  if (!options || typeof options !== 'object') {
    return options
  }

  const candidate = options as AgentExecutionOptionsWithModelSettings
  if (!candidate.modelSettings?.headers) {
    return options
  }

  return {
    ...candidate,
    modelSettings: {
      ...candidate.modelSettings,
      headers: withoutInboundAuthHeaders(candidate.modelSettings.headers),
    },
  } as T
}

export function wrapAgentExecutionWithoutInboundAuth<T extends object>(agent: T): T {
  const target = agent as T & { stream: AgentMethod; resumeStream?: AgentMethod; generate?: AgentMethod }
  const originalStream = target.stream.bind(target)
  target.stream = (input, options) => originalStream(input, sanitizeAgentExecutionOptions(options))

  if (typeof target.resumeStream === 'function') {
    const originalResume = target.resumeStream.bind(target)
    target.resumeStream = (input, options) => originalResume(input, sanitizeAgentExecutionOptions(options))
  }

  if (typeof target.generate === 'function') {
    const originalGenerate = target.generate.bind(target)
    target.generate = (input, options) => originalGenerate(input, sanitizeAgentExecutionOptions(options))
  }

  return agent
}
