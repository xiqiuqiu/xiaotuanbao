import type {
  GetMaterialParseResultInput,
  GetMaterialParseResultOutput,
} from '@xiaotuanbao/ai-contracts'
import { getMaterialParseResultOutputSchema } from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError } from './map-agent-error'

export interface GetMaterialParseResultClientOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

export async function fetchMaterialParseResult(
  options: GetMaterialParseResultClientOptions,
  input: GetMaterialParseResultInput,
): Promise<GetMaterialParseResultOutput> {
  let response: Response
  try {
    response = await fetch(
      `${options.apiBaseUrl.replace(/\/$/, '')}/api/ai-tools/v1/get-material-parse-result`,
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

  return getMaterialParseResultOutputSchema.parse(payload?.data)
}
