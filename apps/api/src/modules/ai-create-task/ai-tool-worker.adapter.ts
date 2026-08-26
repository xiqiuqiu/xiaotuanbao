import { Injectable } from '@nestjs/common'
import type { SubmitReviewPackageModelInput } from '@xiaotuanbao/ai-contracts'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import type {
  AiActionActor,
  AiActionForwardContext,
  AiActionSummary,
} from '../ai-action/ai-action.types'

@Injectable()
export class AiToolWorkerAdapter {
  constructor(private readonly gateway: AiActionGateway) {}

  async projectReviewPackage(params: {
    actor: AiActionActor
    input: SubmitReviewPackageModelInput
    persist: (context: AiActionForwardContext) => Promise<string>
  }): Promise<{ action: AiActionSummary | null; reviewPackageId: string }> {
    const executed = await this.gateway.execute({
      name: 'proposeReviewPackage',
      actor: params.actor,
      input: params.input,
      forward: params.persist,
    })
    if (typeof executed.result !== 'string' || executed.result.length === 0) {
      throw new Error('REVIEW_PACKAGE_PROJECTION_SKIPPED')
    }
    return { action: executed.action, reviewPackageId: executed.result }
  }
}
