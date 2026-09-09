import type {
  ProposeDepartureResourceReviewPackageOutput,
  SubmitDepartureResourceReviewInput,
} from '@xiaotuanbao/ai-contracts'
import { proposeDepartureResourceReviewPackageOutputSchema } from '@xiaotuanbao/ai-contracts'
import { postAiTool, type PostAiToolOptions } from './post-ai-tool'

export type ProposeDepartureResourceReviewClientOptions = PostAiToolOptions

export async function proposeDepartureResourceReviewPackage(
  options: ProposeDepartureResourceReviewClientOptions,
  input: SubmitDepartureResourceReviewInput,
): Promise<ProposeDepartureResourceReviewPackageOutput> {
  return proposeDepartureResourceReviewPackageOutputSchema.parse(
    await postAiTool(options, '/api/ai-tools/v1/propose-departure-resource-review-package', input),
  )
}
