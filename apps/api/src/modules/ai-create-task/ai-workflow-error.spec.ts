import { ServiceUnavailableException } from '@nestjs/common'
import { workflowErrorCode } from './ai-workflow-error'
import { ReviewProposalRejectedError } from './review-proposal.commit'

describe('workflowErrorCode', () => {
  it('keeps VERSION_CONFLICT distinct from agent outages', () => {
    expect(workflowErrorCode(new Error('VERSION_CONFLICT'))).toBe('VERSION_CONFLICT')
  })

  it('maps context capacity failures instead of collapsing them to AGENT_UNAVAILABLE', () => {
    expect(workflowErrorCode(new Error('CONTEXT_CAPACITY_EXCEEDED'))).toBe(
      'CONTEXT_CAPACITY_EXCEEDED',
    )
  })

  it('maps missing context-budget profile failures instead of collapsing them to AGENT_UNAVAILABLE', () => {
    expect(workflowErrorCode(new Error('CONTEXT_PROFILE_MISSING'))).toBe('CONTEXT_PROFILE_MISSING')
    expect(workflowErrorCode(new Error('CONTEXT_PROFILE_MISSING: unknown/model'))).toBe(
      'CONTEXT_PROFILE_MISSING',
    )
  })

  it('maps rejected review proposals to INVALID_FORMAT instead of retrying the Worker job', () => {
    expect(workflowErrorCode(new ReviewProposalRejectedError([]))).toBe('INVALID_FORMAT')
  })

  it('still treats runtime and unknown failures as AGENT_UNAVAILABLE', () => {
    expect(workflowErrorCode(new ServiceUnavailableException())).toBe('AGENT_UNAVAILABLE')
    expect(workflowErrorCode(new Error('boom'))).toBe('AGENT_UNAVAILABLE')
    expect(workflowErrorCode('not-an-error')).toBe('AGENT_UNAVAILABLE')
  })
})
