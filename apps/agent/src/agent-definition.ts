import {
  AI_CREATE_AGENT_CAPABILITY_DECLARATION,
  AI_CREATE_CAPABILITY_DEFINITIONS,
  AgentDefinitionRegistry,
  CONVERSATION_GENERAL_AGENT_DEFINITION,
  CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
  CapabilityDefinitionRegistry,
  type AgentDefinition,
} from '@xiaotuanbao/ai-contracts'
import { READONLY_ASSIST_INSTRUCTIONS } from './readonly-turn'

export const AI_CREATE_AGENT_DEFINITION = {
  ...AI_CREATE_AGENT_CAPABILITY_DECLARATION,
  name: 'AI 建团助手',
  instructions: READONLY_ASSIST_INSTRUCTIONS,
} as const satisfies AgentDefinition

export { AI_CREATE_CAPABILITY_DEFINITIONS, CONVERSATION_GENERAL_AGENT_DEFINITION }

export const agentDefinitionRegistry = new AgentDefinitionRegistry([
  AI_CREATE_AGENT_DEFINITION,
  CONVERSATION_GENERAL_AGENT_DEFINITION,
])
export const capabilityDefinitionRegistry = new CapabilityDefinitionRegistry([
  ...AI_CREATE_CAPABILITY_DEFINITIONS,
  ...CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
])
