import { diagnosticFromMastraGenerate, isCapacityTripwire } from './provider-usage'

describe('provider usage diagnostic', () => {
  it('records actual input/output/total when the provider returns usage', () => {
    expect(
      diagnosticFromMastraGenerate(
        {
          text: 'ok',
          totalUsage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
          traceId: 'trace-actual',
          steps: [
            { usage: { inputTokens: 30, outputTokens: 5, totalTokens: 35 } },
            { usage: { inputTokens: 50, outputTokens: 15, totalTokens: 65 } },
          ],
        },
        [],
      ),
    ).toMatchObject({
      mastraTraceId: 'trace-actual',
      processorVersion: 'mastra-token-limiter-contiguous/v1',
      usageSource: 'actual',
      usage: { input: 80, output: 20, total: 100 },
      modelSteps: [
        { stepIndex: 0, usageSource: 'actual', usage: { input: 30, output: 5, total: 35 } },
        { stepIndex: 1, usageSource: 'actual', usage: { input: 50, output: 15, total: 65 } },
      ],
    })
  })

  it('aggregates per-step provider usage across a tool continuation without inventing missing values', () => {
    expect(
      diagnosticFromMastraGenerate(
        {
          text: 'ok',
          steps: [
            { usage: { inputTokens: 11, outputTokens: 2, totalTokens: 13 } },
            { usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 } },
          ],
        },
        [],
      ),
    ).toMatchObject({
      usageSource: 'actual',
      usage: { input: 20, output: 6, total: 26 },
      modelSteps: [
        { stepIndex: 0, usageSource: 'actual', usage: { input: 11, output: 2, total: 13 } },
        { stepIndex: 1, usageSource: 'actual', usage: { input: 9, output: 4, total: 13 } },
      ],
    })

    const partial = diagnosticFromMastraGenerate(
      {
        text: 'ok',
        steps: [
          { usage: { inputTokens: 11, outputTokens: 2, totalTokens: 13 } },
          { usage: undefined },
          { usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 } },
        ],
      },
      [],
    )
    expect(partial).toMatchObject({
      usageSource: 'missing',
      modelSteps: [
        { stepIndex: 0, usageSource: 'actual', usage: { input: 11, output: 2, total: 13 } },
        { stepIndex: 1, usageSource: 'missing' },
        { stepIndex: 2, usageSource: 'actual', usage: { input: 9, output: 4, total: 13 } },
      ],
    })
    expect(partial.usage).toBeUndefined()
  })

  it('records missing usage when the provider omits token counts', () => {
    expect(
      diagnosticFromMastraGenerate({ text: 'ok', toolCalls: [] }, []),
    ).toMatchObject({
      usageSource: 'missing',
      processorVersion: 'mastra-token-limiter-contiguous/v1',
      modelSteps: [],
    })
    expect(diagnosticFromMastraGenerate({ text: 'ok' }, []).usage).toBeUndefined()
  })

  it('detects TokenLimiter tripwires as capacity failures', () => {
    expect(
      isCapacityTripwire({
        tripwire: { processorId: 'token-limiter', reason: 'TokenLimiterProcessor: System messages alone exceed token limit.' },
      }),
    ).toBe(true)
    expect(isCapacityTripwire({ tripwire: { processorId: 'moderation' } })).toBe(false)
    expect(isCapacityTripwire({ text: 'ok' })).toBe(false)
  })
})
