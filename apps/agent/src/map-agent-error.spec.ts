import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { mapAgentFetchError, mapModelError } from './map-agent-error'

describe('mapAgentFetchError', () => {
  it('preserves structured collaboration codes from NestJS', () => {
    expect(mapAgentFetchError({ code: 'SERVICE_IDENTITY_INVALID' }).code).toBe(
      'SERVICE_IDENTITY_INVALID',
    )
    expect(mapAgentFetchError({ code: 'DELEGATION_INVALID' }).code).toBe('DELEGATION_INVALID')
    expect(mapAgentFetchError({ code: 'VERSION_CONFLICT' }).code).toBe('VERSION_CONFLICT')
    expect(mapAgentFetchError({ code: 'REVIEW_PENDING' }).code).toBe('REVIEW_PENDING')
  })

  it('maps transport failures to AGENT_UNAVAILABLE', () => {
    expect(mapAgentFetchError(new Error('network'))).toMatchObject({
      code: 'AGENT_UNAVAILABLE',
      retryable: true,
    })
  })
})

describe('mapModelError', () => {
  it('maps abort and timeout to MODEL_TIMEOUT', () => {
    const abort = new Error('This operation was aborted')
    abort.name = 'AbortError'
    expect(mapModelError(abort).code).toBe('MODEL_TIMEOUT')
    expect(mapModelError(new Error('model timeout after 120s')).code).toBe('MODEL_TIMEOUT')
  })

  it('maps policy refusals to MODEL_REFUSED', () => {
    expect(mapModelError(new Error('content filter refused the request')).code).toBe('MODEL_REFUSED')
  })

  it('maps TokenLimiter tripwires to a recoverable capacity failure', () => {
    const trip = new Error('TokenLimiterProcessor: No messages fit within the remaining token budget.')
    trip.name = 'TripWire'
    expect(mapModelError(trip).code).toBe('CONTEXT_CAPACITY_EXCEEDED')
    expect(mapModelError(new Error('CONTEXT_CAPACITY_EXCEEDED')).code).toBe('CONTEXT_CAPACITY_EXCEEDED')
    expect(mapModelError(new Error('CONTEXT_CAPACITY_EXCEEDED')).retryable).toBe(true)
  })

  it('keeps existing collaboration errors', () => {
    const original = AiCollaborationError.fromCode('INVALID_FORMAT')
    expect(mapModelError(original)).toBe(original)
  })
})
