import type {
  ReadConversationHistoryInput,
  ReadConversationHistoryOutput,
} from '@xiaotuanbao/ai-contracts'
import { readConversationHistoryOutputSchema } from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError } from './map-agent-error'

export interface ReadConversationHistoryClientOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

export async function fetchConversationHistory(
  options: ReadConversationHistoryClientOptions,
  input: ReadConversationHistoryInput,
): Promise<ReadConversationHistoryOutput> {
  let response: Response
  try {
    response = await fetch(
      `${options.apiBaseUrl.replace(/\/$/, '')}/api/ai-tools/v1/read-conversation-history`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Service-Key': options.serviceSecret,
          Authorization: `Bearer ${options.delegationToken}`,
        },
        body: JSON.stringify(input),
      },
    )
  } catch {
    throw mapAgentFetchError(new Error('network'))
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: unknown
    message?: string
  } | null

  if (!response.ok) {
    throw mapAgentFetchError(payload?.data ?? { status: response.status })
  }

  return readConversationHistoryOutputSchema.parse(payload?.data)
}
