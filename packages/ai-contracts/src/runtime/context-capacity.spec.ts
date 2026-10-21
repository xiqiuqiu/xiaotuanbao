import {
  CONTEXT_PROFILE_MISSING,
  TOKEN_LIMITER_PROCESSOR_VERSION,
  TOKEN_LIMITER_TRIM_MODE,
  canonicalModelId,
  contextCapacityProfileFor,
  tokenLimiterLimitForModel,
  tokenLimiterLimitTokens,
} from './context-capacity'

describe('context capacity profile', () => {
  it('gives TokenLimiter a hard per-step limit above the Builder soft target', () => {
    const profile = contextCapacityProfileFor('deepseek-flash')
    const limiterLimit = tokenLimiterLimitTokens(profile)

    expect(TOKEN_LIMITER_TRIM_MODE).toBe('contiguous')
    expect(TOKEN_LIMITER_PROCESSOR_VERSION).toBe('mastra-token-limiter-contiguous/v1')
    expect(limiterLimit).toBe(28_672)
    expect(limiterLimit).toBeGreaterThan(profile.softInputLimitTokens)
    expect(tokenLimiterLimitForModel('deepseek/deepseek-flash')).toBe(limiterLimit)
  })

  it.each([
    'deepseek-flash',
    'deepseek/deepseek-flash',
    'deepseek-v4-flash',
    'deepseek/deepseek-v4-flash',
    'deepseek-chat',
    'deepseek/deepseek-chat',
    'deepseek-reasoner',
    'deepseek/deepseek-reasoner',
  ])('normalizes %s onto deepseek-flash with the same application budget', (modelId) => {
    expect(canonicalModelId(modelId)).toBe('deepseek/deepseek-flash')
    expect(contextCapacityProfileFor(modelId)).toEqual(contextCapacityProfileFor('deepseek/deepseek-flash'))
    expect(tokenLimiterLimitForModel(modelId)).toBe(28_672)
  })

  it('rejects unknown models instead of inventing a window', () => {
    expect(() => contextCapacityProfileFor('unknown/model')).toThrow(CONTEXT_PROFILE_MISSING)
  })
})
