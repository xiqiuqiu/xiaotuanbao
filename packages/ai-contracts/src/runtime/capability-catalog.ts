import type { CapabilityDefinition } from './agent-platform'
import { AI_CREATE_CAPABILITY_DEFINITIONS } from './ai-create-definitions'
import { CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS } from './conversation-general-definitions'

export function uniqueCapabilityDefinitions<T extends { key: string; version: number }>(
  definitions: readonly T[],
): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const definition of definitions) {
    const id = `${definition.key}@${definition.version}`
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    unique.push(definition)
  }
  return unique
}

export const REGISTERED_CAPABILITY_DEFINITIONS = uniqueCapabilityDefinitions([
  ...AI_CREATE_CAPABILITY_DEFINITIONS,
  ...CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
]) satisfies readonly CapabilityDefinition[]

export function registeredCapabilityDefinitionForTool(toolName: string) {
  return REGISTERED_CAPABILITY_DEFINITIONS.find((definition) => definition.toolName === toolName)
}
