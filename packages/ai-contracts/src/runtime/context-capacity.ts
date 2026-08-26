export const TOKEN_LIMITER_PROCESSOR_VERSION = 'mastra-token-limiter-contiguous/v1'
export const TOKEN_LIMITER_TRIM_MODE = 'contiguous' as const
export const TOKEN_ESTIMATOR_VERSION = 'utf8-bytes-ceil-div3/v1'
export const PROVIDER_FRAMING_VERSION = 'openai-compatible-framing/v1'
export const OUTPUT_RESERVE_VERSION = 'ai-create-output-reserve/v1'

export const CONTEXT_PROFILE_MISSING = 'CONTEXT_PROFILE_MISSING'

export interface ContextCapacityProfile {
  profileVersion: string
  contextWindowTokens: number
  softInputLimitTokens: number
  outputReserveTokens: number
  providerFramingTokens: number
  safetyMarginTokens: number
}

const CONTEXT_CAPACITY_PROFILES: Readonly<Record<string, ContextCapacityProfile>> = {
  deterministic: {
    profileVersion: 'ai-create-deterministic-32k/v1',
    contextWindowTokens: 32_768,
    softInputLimitTokens: 24_576,
    outputReserveTokens: 4_096,
    providerFramingTokens: 1_024,
    safetyMarginTokens: 2_048,
  },
  'deepseek/deepseek-chat': {
    profileVersion: 'ai-create-deepseek-chat-32k/v1',
    contextWindowTokens: 32_768,
    softInputLimitTokens: 24_576,
    outputReserveTokens: 4_096,
    providerFramingTokens: 1_024,
    safetyMarginTokens: 2_048,
  },
  'deepseek/deepseek-v4-flash': {
    profileVersion: 'ai-create-deepseek-v4-flash-32k/v1',
    contextWindowTokens: 32_768,
    softInputLimitTokens: 24_576,
    outputReserveTokens: 4_096,
    providerFramingTokens: 1_024,
    safetyMarginTokens: 2_048,
  },
}

const MODEL_ID_ALIASES: Readonly<Record<string, string>> = {
  'deepseek-chat': 'deepseek/deepseek-chat',
  'deepseek-v4-flash': 'deepseek/deepseek-v4-flash',
}

export function canonicalModelId(modelId: string): string {
  return MODEL_ID_ALIASES[modelId] ?? modelId
}

export function contextCapacityProfileFor(modelId: string): ContextCapacityProfile {
  const profile = CONTEXT_CAPACITY_PROFILES[canonicalModelId(modelId)]
  if (!profile) {
    throw new Error(`${CONTEXT_PROFILE_MISSING}: ${modelId}`)
  }
  return profile
}

export function tokenLimiterLimitTokens(profile: ContextCapacityProfile): number {
  return profile.contextWindowTokens - profile.outputReserveTokens
}

export function tokenLimiterLimitForModel(modelId: string): number {
  return tokenLimiterLimitTokens(contextCapacityProfileFor(modelId))
}
