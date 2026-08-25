import { AI_CREATE_TOOL_DESCRIPTIONS, AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requireTaskBoundAssistContext } from './assist-request-context'
import { fetchTaskContext } from './get-task-context.client'

export interface GetTaskContextToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

export function createGetTaskContextTool(config: GetTaskContextToolConfig) {
  return createTool({
    id: 'getTaskContext',
    description: AI_CREATE_TOOL_DESCRIPTIONS.getTaskContext,
    inputSchema: z.object({}),
    execute: async () => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return fetchTaskContext(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        { taskId, runId },
      )
    },
  })
}
