import {
  AI_CREATE_AGENT_CAPABILITY_DECLARATION,
  AI_CREATE_CAPABILITY_DEFINITIONS,
  AgentDefinitionRegistry,
  aiCreateCapabilityDefinitionRegistry,
  type AgentDefinition,
} from '@xiaotuanbao/ai-contracts'
import { READONLY_ASSIST_INSTRUCTIONS } from './readonly-turn'

export const AI_CREATE_AGENT_DEFINITION = {
  ...AI_CREATE_AGENT_CAPABILITY_DECLARATION,
  name: 'AI 建团助手',
  instructions: READONLY_ASSIST_INSTRUCTIONS,
} as const satisfies AgentDefinition

export { AI_CREATE_CAPABILITY_DEFINITIONS }

export const agentDefinitionRegistry = new AgentDefinitionRegistry([
  AI_CREATE_AGENT_DEFINITION,
])
export const capabilityDefinitionRegistry = aiCreateCapabilityDefinitionRegistry
