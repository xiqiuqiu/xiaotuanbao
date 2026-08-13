import type {
  SearchRouteTemplatesInput,
  SearchRouteTemplatesOutput,
} from '@xiaotuanbao/ai-contracts'
import { searchRouteTemplatesOutputSchema } from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError } from './map-agent-error'

export interface SearchRouteTemplatesClientOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

export async function searchRouteTemplates(
  options: SearchRouteTemplatesClientOptions,
  input: SearchRouteTemplatesInput,
): Promise<SearchRouteTemplatesOutput> {
  let response: Response
  try {
    response = await fetch(
      `${options.apiBaseUrl.replace(/\/$/, '')}/api/ai-tools/v1/search-route-templates`,
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

  return searchRouteTemplatesOutputSchema.parse(payload?.data)
}
