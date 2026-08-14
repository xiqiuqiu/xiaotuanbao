import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core'
import { createGetTaskContextTool, type GetTaskContextToolConfig } from './get-task-context.tool'
import { createGetMaterialParseResultTool } from './get-material-parse-result.tool'
import { createSearchRouteTemplatesTool } from './search-route-templates.tool'
import { createSubmitReviewPackageTool } from './submit-review-package.tool'
import { READONLY_ASSIST_INSTRUCTIONS } from './readonly-turn'
import { wrapAgentStreamToRestoreToolReasoning } from './restore-tool-reasoning'
import { wrapAgentExecutionWithoutInboundAuth } from './sanitize-model-headers'
import { wrapAgentStreamToStripInboundFiles } from './strip-inbound-file-parts'

const AI_CREATE_AGENT_ID = 'ai-create-readonly-assist'

export interface AiCreateMastraConfig extends GetTaskContextToolConfig {
  model?: string
  modelBaseUrl?: string
}

export function createAiCreateMastra(config: AiCreateMastraConfig) {
  const getTaskContext = createGetTaskContextTool(config)
  const getMaterialParseResult = createGetMaterialParseResultTool(config)
  const searchRouteTemplates = createSearchRouteTemplatesTool(config)
  const submitReviewPackage = createSubmitReviewPackageTool(config)
  const agent = new Agent({
    id: AI_CREATE_AGENT_ID,
    name: 'AI 建团助手',
    instructions: READONLY_ASSIST_INSTRUCTIONS,
    model: {
      id: toModelId(config.model ?? 'deepseek/deepseek-chat'),
      url: config.modelBaseUrl ?? 'https://api.deepseek.com',
      apiKey: config.modelApiKey || 'missing',
    },
    tools: { getTaskContext, searchRouteTemplates, getMaterialParseResult, submitReviewPackage },
  })

  wrapAgentExecutionWithoutInboundAuth(agent)
  wrapAgentStreamToStripInboundFiles(agent)
  wrapAgentStreamToRestoreToolReasoning(agent)

  return new Mastra({
    agents: { [AI_CREATE_AGENT_ID]: agent },
    logger: false,
  })
}

function toModelId(model: string): `${string}/${string}` {
  return (model.includes('/') ? model : `deepseek/${model}`) as `${string}/${string}`
}
