import type { ProposeReviewPackageOutput, SubmitReviewPackageInput } from '@xiaotuanbao/ai-contracts'
import { proposeReviewPackageOutputSchema } from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError } from './map-agent-error'

export interface SubmitReviewPackageClientOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

export async function submitReviewPackage(
  options: SubmitReviewPackageClientOptions,
  input: SubmitReviewPackageInput,
): Promise<ProposeReviewPackageOutput> {
  let response: Response
  try {
    response = await fetch(`${options.apiBaseUrl.replace(/\/$/, '')}/api/ai-tools/v1/propose-review-package`, {
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

  return proposeReviewPackageOutputSchema.parse(payload?.data)
}
