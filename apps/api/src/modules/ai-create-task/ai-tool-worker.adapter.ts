import { Injectable } from '@nestjs/common'
import {
  DEPARTURE_RESOURCE_CONFIRMATION_UNIT,
  SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT, RESOURCE_PAYABLE_CONFIRMATION_UNIT,
  type SubmitInitialFinanceReviewModelInput,
  ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT,
  SOURCE_ORDER_GUESTS_UPDATE_CONFIRMATION_UNIT,
  type SubmitDepartureEditReviewModelInput,
  SEGMENT_RESOURCE_CONFIRMATION_UNIT,
  SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT,
  type SubmitDepartureResourceReviewModelInput,
  type SubmitSourceOrderReviewPackageModelInput,
  type SubmitReviewPackageModelInput,
  type SubmitSegmentResourceReviewModelInput,
} from '@xiaotuanbao/ai-contracts'
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
    input: SubmitInitialFinanceReviewModelInput | SubmitDepartureEditReviewModelInput | SubmitReviewPackageModelInput | SubmitSegmentResourceReviewModelInput | SubmitDepartureResourceReviewModelInput | SubmitSourceOrderReviewPackageModelInput
    persist: (context: AiActionForwardContext) => Promise<string>
  }): Promise<{ action: AiActionSummary | null; reviewPackageId: string }> {
    const executed = await this.gateway.execute({
      name:
        params.input.confirmationUnit === SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT || params.input.confirmationUnit === RESOURCE_PAYABLE_CONFIRMATION_UNIT
          ? 'proposeInitialFinanceReviewPackage'
          :
        params.input.confirmationUnit === SEGMENT_RESOURCE_CONFIRMATION_UNIT
          ? 'proposeSegmentResourceReviewPackage'
          : params.input.confirmationUnit === DEPARTURE_RESOURCE_CONFIRMATION_UNIT
            ? 'proposeDepartureResourceReviewPackage'
          : params.input.confirmationUnit === ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT || params.input.confirmationUnit === SOURCE_ORDER_GUESTS_UPDATE_CONFIRMATION_UNIT
            ? 'proposeDepartureEditReviewPackage'
          : params.input.confirmationUnit === SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT
            ? 'proposeSourceOrderReviewPackage'
            : 'proposeReviewPackage',
      actor: params.actor,
      input: params.input,
      forward: params.persist,
    })
    if (typeof executed.result !== 'string' || executed.result.length === 0) {
      if (executed.action?.reasonCode === 'TARGET_VERSION_MISMATCH') {
        throw new Error('VERSION_CONFLICT')
      }
      throw new Error('REVIEW_PACKAGE_PROJECTION_SKIPPED')
    }
    return { action: executed.action, reviewPackageId: executed.result }
  }
}
