import { mapAgentFetchError } from './map-agent-error'

export interface PostAiToolOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

export async function postAiTool(
  options: PostAiToolOptions,
  path: string,
  input: unknown,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${options.apiBaseUrl.replace(/\/$/, '')}${path}`, {
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
    throw mapAgentFetchError(payload?.data, response.status)
  }

  return payload?.data
}
