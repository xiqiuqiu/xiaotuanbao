import { Mastra } from '@mastra/core'
import { Agent } from '@mastra/core/agent'
import {
  requestContextSchema,
  type AgentDefinition,
  type RequestContext,
} from '@xiaotuanbao/ai-contracts'
import {
  AI_CREATE_AGENT_DEFINITION,
  agentDefinitionRegistry,
  capabilityDefinitionRegistry,
} from './agent-definition'
import { createGetMaterialParseResultTool } from './get-material-parse-result.tool'
import { createGetTaskContextTool, type GetTaskContextToolConfig } from './get-task-context.tool'
import { createSearchRouteTemplatesTool } from './search-route-templates.tool'
import { createSubmitReviewPackageTool } from './submit-review-package.tool'
import { wrapAgentStreamToRestoreToolReasoning } from './restore-tool-reasoning'
import { wrapAgentExecutionWithoutInboundAuth } from './sanitize-model-headers'

export const AI_CREATE_AGENT_ID = 'ai-create-readonly-assist'

export interface AiCreateAgentFactoryConfig extends GetTaskContextToolConfig {
  model?: string
  modelBaseUrl?: string
}

export function createAiCreateMastraFromDefinition(
  config: AiCreateAgentFactoryConfig,
  input: RequestContext,
) {
  const context = requestContextSchema.parse(input)
  const definition = agentDefinitionRegistry.get(context.agentDefinition)
  return createMastra(config, definition, context.grantedCapabilities)
}

export function createAiCreateDiscoveryMastra(config: AiCreateAgentFactoryConfig) {
  const definition = agentDefinitionRegistry.get(AI_CREATE_AGENT_DEFINITION)
  return createMastra(config, definition, [])
}

function createMastra(
  config: AiCreateAgentFactoryConfig,
  definition: AgentDefinition,
  grantedCapabilities: RequestContext['grantedCapabilities'],
) {
  const allowed = new Set(toolNamesForCapabilityGrants(definition, grantedCapabilities))
  const registeredTools = {
    getTaskContext: createGetTaskContextTool(config),
    searchRouteTemplates: createSearchRouteTemplatesTool(config),
    submitReviewPackage: createSubmitReviewPackageTool(config),
    getMaterialParseResult: createGetMaterialParseResultTool(config),
  }
  const tools = Object.fromEntries(
    Object.entries(registeredTools).filter(([name]) => allowed.has(name)),
  ) as Partial<typeof registeredTools>
  const agent = new Agent({
    id: AI_CREATE_AGENT_ID,
    name: definition.name,
    instructions: definition.instructions,
    model: {
      id: toModelId(config.model ?? 'deepseek/deepseek-chat'),
      url: config.modelBaseUrl ?? 'https://api.deepseek.com',
      apiKey: config.modelApiKey || 'missing',
    },
    tools,
  })

  wrapAgentExecutionWithoutInboundAuth(agent)
  wrapAgentStreamToRestoreToolReasoning(agent)

  return new Mastra({ agents: { [AI_CREATE_AGENT_ID]: agent }, logger: false })
}

export function toolNamesForRequestContext(input: RequestContext): string[] {
  const context = requestContextSchema.parse(input)
  const definition = agentDefinitionRegistry.get(context.agentDefinition)
  return toolNamesForCapabilityGrants(definition, context.grantedCapabilities)
}

export function allAiCreateToolNames(): string[] {
  return AI_CREATE_AGENT_DEFINITION.capabilities.map(
    (ref) => capabilityDefinitionRegistry.get(ref).toolName,
  )
}

function toolNamesForCapabilityGrants(
  definition: AgentDefinition,
  grantedCapabilities: RequestContext['grantedCapabilities'],
): string[] {
  const declared = new Set(definition.capabilities.map(refId))
  return grantedCapabilities.flatMap((ref) => {
    const capability = capabilityDefinitionRegistry.get(ref)
    return declared.has(refId(ref)) ? [capability.toolName] : []
  })
}

function refId(ref: { key: string; version: number }): string {
  return `${ref.key}@${ref.version}`
}

function toModelId(model: string): `${string}/${string}` {
  return (model.includes('/') ? model : `deepseek/${model}`) as `${string}/${string}`
}
