import {
  sanitizeAgentExecutionOptions,
  wrapAgentExecutionWithoutInboundAuth,
} from './sanitize-model-headers'

describe('sanitizeAgentExecutionOptions', () => {
  it('drops inbound delegation Authorization so it cannot replace the model API key', () => {
    expect(
      sanitizeAgentExecutionOptions({
        runId: 'run-1',
        modelSettings: {
          headers: {
            Authorization: 'Bearer jwt.signature.AHB0',
            authorization: 'Bearer jwt.signature.mBJg',
            'X-Ai-Task-Id': 'task-1',
            'X-Ai-Run-Id': 'run-1',
            'X-Request-Id': 'keep-me',
          },
        },
      }),
    ).toEqual({
      runId: 'run-1',
      modelSettings: {
        headers: { 'X-Request-Id': 'keep-me' },
      },
    })
  })

  it('leaves options unchanged when there are no model headers', () => {
    const options = { runId: 'run-1' }
    expect(sanitizeAgentExecutionOptions(options)).toBe(options)
  })
})

describe('wrapAgentExecutionWithoutInboundAuth', () => {
  it('strips inbound Authorization before stream and resumeStream', async () => {
    const received: unknown[] = []
    const fake = {
      stream: async (_input: unknown, options?: unknown) => {
        received.push(['stream', options])
        return 'streamed'
      },
      resumeStream: async (_input: unknown, options?: unknown) => {
        received.push(['resume', options])
        return 'resumed'
      },
    }

    const wrapped = wrapAgentExecutionWithoutInboundAuth(fake)
    const inbound = {
      modelSettings: { headers: { Authorization: 'Bearer jwt.signature.eg9g' } },
    }

    await expect(wrapped.stream('hello', inbound)).resolves.toBe('streamed')
    await expect(wrapped.resumeStream?.('hello', inbound)).resolves.toBe('resumed')
    expect(received).toEqual([
      ['stream', { modelSettings: { headers: {} } }],
      ['resume', { modelSettings: { headers: {} } }],
    ])
  })
})
