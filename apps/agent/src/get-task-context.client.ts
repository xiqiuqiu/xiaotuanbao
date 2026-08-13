import type { GetTaskContextInput, GetTaskContextOutput } from '@xiaotuanbao/ai-contracts'
import { getTaskContextOutputSchema } from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError } from './map-agent-error'

export interface GetTaskContextClientOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

export async function fetchTaskContext(
  options: GetTaskContextClientOptions,
  input: GetTaskContextInput,
): Promise<GetTaskContextOutput> {
  let response: Response
  try {
    response = await fetch(`${options.apiBaseUrl.replace(/\/$/, '')}/api/ai-tools/v1/get-task-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Key': options.serviceSecret,
        Authorization: `Bearer ${options.delegationToken}`,
      },
      body: JSON.stringify(input),
    })
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

  return getTaskContextOutputSchema.parse(payload?.data)
}
