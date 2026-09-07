import type { ProposeReviewPackageOutput, SubmitReviewPackageInput } from '@xiaotuanbao/ai-contracts'
import { proposeReviewPackageOutputSchema } from '@xiaotuanbao/ai-contracts'
import { postAiTool, type PostAiToolOptions } from './post-ai-tool'

export type SubmitReviewPackageClientOptions = PostAiToolOptions

export async function submitReviewPackage(
  options: SubmitReviewPackageClientOptions,
  input: SubmitReviewPackageInput,
): Promise<ProposeReviewPackageOutput> {
  return proposeReviewPackageOutputSchema.parse(
    await postAiTool(options, '/api/ai-tools/v1/propose-review-package', input),
  )
}
