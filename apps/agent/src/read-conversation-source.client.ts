import type {
  ReadConversationSourceInput,
  ReadConversationSourceOutput,
} from '@xiaotuanbao/ai-contracts'
import { readConversationSourceOutputSchema } from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError } from './map-agent-error'

export interface ReadConversationSourceClientOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

export async function fetchConversationSource(
  options: ReadConversationSourceClientOptions,
  input: ReadConversationSourceInput,
): Promise<ReadConversationSourceOutput> {
  let response: Response
  try {
    response = await fetch(
      `${options.apiBaseUrl.replace(/\/$/, '')}/api/ai-tools/v1/read-conversation-source`,
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

  return readConversationSourceOutputSchema.parse(payload?.data)
}
