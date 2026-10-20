import {
  proposeDepartureEditReviewPackageOutputSchema,
  type ProposeDepartureEditReviewPackageOutput,
  type SubmitDepartureEditReviewInput,
} from '@xiaotuanbao/ai-contracts'
import { postAiTool, type PostAiToolOptions } from './post-ai-tool'

export async function proposeDepartureEditReviewPackage(
  options: PostAiToolOptions,
  input: SubmitDepartureEditReviewInput,
): Promise<ProposeDepartureEditReviewPackageOutput> {
  return proposeDepartureEditReviewPackageOutputSchema.parse(
    await postAiTool(options, '/api/ai-tools/v1/propose-departure-edit-review-package', input),
  )
}
