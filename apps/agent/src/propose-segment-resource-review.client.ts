import type {
  ProposeSegmentResourceReviewPackageOutput,
  SubmitSegmentResourceReviewInput,
} from '@xiaotuanbao/ai-contracts'
import { proposeSegmentResourceReviewPackageOutputSchema } from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError } from './map-agent-error'

export interface ProposeSegmentResourceReviewClientOptions {
  apiBaseUrl: string
  serviceSecret: string
  delegationToken: string
}

export async function proposeSegmentResourceReviewPackage(
  options: ProposeSegmentResourceReviewClientOptions,
  input: SubmitSegmentResourceReviewInput,
): Promise<ProposeSegmentResourceReviewPackageOutput> {
  let response: Response
  try {
    response = await fetch(
      `${options.apiBaseUrl.replace(/\/$/, '')}/api/ai-tools/v1/propose-segment-resource-review-package`,
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

  return proposeSegmentResourceReviewPackageOutputSchema.parse(payload?.data)
}
