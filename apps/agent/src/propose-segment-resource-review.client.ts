import type {
  ProposeSegmentResourceReviewPackageOutput,
  SubmitSegmentResourceReviewInput,
} from '@xiaotuanbao/ai-contracts'
import { proposeSegmentResourceReviewPackageOutputSchema } from '@xiaotuanbao/ai-contracts'
import { postAiTool, type PostAiToolOptions } from './post-ai-tool'

export type ProposeSegmentResourceReviewClientOptions = PostAiToolOptions

export async function proposeSegmentResourceReviewPackage(
  options: ProposeSegmentResourceReviewClientOptions,
  input: SubmitSegmentResourceReviewInput,
): Promise<ProposeSegmentResourceReviewPackageOutput> {
  return proposeSegmentResourceReviewPackageOutputSchema.parse(
    await postAiTool(options, '/api/ai-tools/v1/propose-segment-resource-review-package', input),
  )
}
