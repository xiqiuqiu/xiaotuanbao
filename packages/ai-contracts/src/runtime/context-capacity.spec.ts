import {
  CONTEXT_PROFILE_MISSING,
  TOKEN_LIMITER_PROCESSOR_VERSION,
  TOKEN_LIMITER_TRIM_MODE,
  contextCapacityProfileFor,
  tokenLimiterLimitForModel,
  tokenLimiterLimitTokens,
} from './context-capacity'

describe('context capacity profile', () => {
  it('gives TokenLimiter a hard per-step limit above the Builder soft target', () => {
    const profile = contextCapacityProfileFor('deepseek-chat')
    const limiterLimit = tokenLimiterLimitTokens(profile)

    expect(TOKEN_LIMITER_TRIM_MODE).toBe('contiguous')
    expect(TOKEN_LIMITER_PROCESSOR_VERSION).toBe('mastra-token-limiter-contiguous/v1')
    expect(limiterLimit).toBe(28_672)
    expect(limiterLimit).toBeGreaterThan(profile.softInputLimitTokens)
    expect(tokenLimiterLimitForModel('deepseek/deepseek-chat')).toBe(limiterLimit)
  })

  it('rejects unknown models instead of inventing a window', () => {
    expect(() => contextCapacityProfileFor('unknown/model')).toThrow(CONTEXT_PROFILE_MISSING)
  })
})
