import { mapAgentFetchError } from './map-agent-error'

describe('mapAgentFetchError', () => {
  it('preserves structured collaboration codes from NestJS', () => {
    expect(mapAgentFetchError({ code: 'SERVICE_IDENTITY_INVALID' }).code).toBe(
      'SERVICE_IDENTITY_INVALID',
    )
    expect(mapAgentFetchError({ code: 'DELEGATION_INVALID' }).code).toBe('DELEGATION_INVALID')
  })

  it('maps transport failures to AGENT_UNAVAILABLE', () => {
    expect(mapAgentFetchError(new Error('network'))).toMatchObject({
      code: 'AGENT_UNAVAILABLE',
      retryable: true,
    })
  })
})
