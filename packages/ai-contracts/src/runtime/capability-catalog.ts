import type { CapabilityDefinition } from './agent-platform'
import { AI_CREATE_CAPABILITY_DEFINITIONS } from './ai-create-definitions'
import { CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS } from './conversation-general-definitions'

export const REGISTERED_CAPABILITY_DEFINITIONS = [
  ...AI_CREATE_CAPABILITY_DEFINITIONS,
  ...CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
] as const satisfies readonly CapabilityDefinition[]

export function registeredCapabilityDefinitionForTool(toolName: string) {
  return REGISTERED_CAPABILITY_DEFINITIONS.find((definition) => definition.toolName === toolName)
}
